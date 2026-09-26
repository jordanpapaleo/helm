//! Export the current webview's *print* rendering to a PDF file.
//!
//! The frontend mounts a print-only view of the note (see
//! `src/components/editor/NotePrintView.tsx`) and then calls `export_pdf`.
//! The platform's own print engine lays the page out, so the PDF is vector
//! output of exactly what the editor shows, mermaid SVGs included.
//!
//! Both native paths are asynchronous and report back on the main thread, so
//! the command hands a channel into the webview closure and waits on it from
//! a blocking task.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

/// Upper bound on a single export. Printing a long note takes well under a
/// second; this only exists so a print engine that never calls back cannot
/// leave the frontend waiting forever.
const EXPORT_TIMEOUT: Duration = Duration::from_secs(60);

type ExportResult = Result<(), String>;

/// Resolve the destination the user picked into the path we will write.
///
/// Save panels do not always append the extension (GTK never does), so a
/// missing or different extension gets `.pdf` added rather than letting the
/// export overwrite, say, a note that happens to share the name.
pub fn normalize_pdf_path(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path.trim());
    if !path.is_absolute() {
        return Err(format!("Export path must be absolute: {}", path.display()));
    }
    if path.file_name().is_none() {
        return Err(format!("Export path has no file name: {}", path.display()));
    }
    let is_pdf = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if is_pdf {
        return Ok(path.to_path_buf());
    }
    let mut with_ext = path.as_os_str().to_owned();
    with_ext.push(".pdf");
    Ok(PathBuf::from(with_ext))
}

/// Print the calling webview to a PDF at `path`. Returns the path written.
#[tauri::command]
pub async fn export_pdf(webview: tauri::Webview, path: String) -> Result<String, String> {
    let target = normalize_pdf_path(&path)?;
    if let Some(parent) = target.parent() {
        if !parent.is_dir() {
            return Err(format!("Folder does not exist: {}", parent.display()));
        }
    }

    let (tx, rx) = mpsc::channel::<ExportResult>();
    let native_target = target.clone();
    webview
        .with_webview(move |platform| platform::print_to_pdf(platform, &native_target, tx))
        .map_err(|e| e.to_string())?;

    let outcome = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(EXPORT_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?;
    match outcome {
        Ok(Ok(())) => Ok(target.to_string_lossy().into_owned()),
        Ok(Err(e)) => Err(e),
        Err(mpsc::RecvTimeoutError::Timeout) => Err("Timed out waiting for the PDF".into()),
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("The print engine stopped without reporting a result".into())
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::ExportResult;
    use std::cell::RefCell;
    use std::path::Path;
    use std::rc::Rc;
    use std::sync::mpsc::Sender;
    use webkit2gtk::{PrintOperation, PrintOperationExt};

    /// Half an inch, matching the macOS margins.
    const MARGIN_MM: f64 = 12.7;

    pub fn print_to_pdf(
        platform: tauri::webview::PlatformWebview,
        path: &Path,
        tx: Sender<ExportResult>,
    ) {
        let uri = match gtk::glib::filename_to_uri(path, None) {
            Ok(uri) => uri,
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
                return;
            }
        };

        let settings = gtk::PrintSettings::new();
        settings.set_printer("Print to File");
        settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT, Some("pdf"));
        settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI, Some(&uri));

        let page_setup = gtk::PageSetup::new();
        page_setup.set_top_margin(MARGIN_MM, gtk::Unit::Mm);
        page_setup.set_bottom_margin(MARGIN_MM, gtk::Unit::Mm);
        page_setup.set_left_margin(MARGIN_MM, gtk::Unit::Mm);
        page_setup.set_right_margin(MARGIN_MM, gtk::Unit::Mm);

        let op = PrintOperation::new(&platform.inner());
        op.set_print_settings(&settings);
        op.set_page_setup(&page_setup);

        // `failed` (if any) always fires before `finished`; whichever reports
        // first wins.
        let tx = Rc::new(RefCell::new(Some(tx)));
        let on_failed = Rc::clone(&tx);
        op.connect_failed(move |_, err| {
            if let Some(tx) = on_failed.borrow_mut().take() {
                let _ = tx.send(Err(err.to_string()));
            }
        });
        op.connect_finished(move |_| {
            if let Some(tx) = tx.borrow_mut().take() {
                let _ = tx.send(Ok(()));
            }
        });
        op.print();
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::ExportResult;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Bool, NSObject, ProtocolObject};
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob,
        NSPrintingPaginationMode,
    };
    use objc2_foundation::{NSCopying, NSString, NSURL};
    use objc2_web_kit::WKWebView;
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::path::Path;
    use std::sync::mpsc::Sender;

    /// Half an inch, in points.
    const MARGIN: f64 = 36.0;

    pub struct Ivars {
        done: RefCell<Option<Sender<ExportResult>>>,
    }

    define_class!(
        // SAFETY: NSObject has no subclassing requirements, and the delegate
        // does not implement Drop.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "HelmPdfExportDelegate"]
        #[ivars = Ivars]
        struct PdfExportDelegate;

        impl PdfExportDelegate {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn did_run(&self, _op: &NSPrintOperation, success: Bool, _context: *mut c_void) {
                if let Some(tx) = self.ivars().done.borrow_mut().take() {
                    let _ = tx.send(if success.as_bool() {
                        Ok(())
                    } else {
                        Err("macOS could not write the PDF".into())
                    });
                }
                DELEGATE.with(|slot| slot.borrow_mut().take());
            }
        }
    );

    thread_local! {
        // NSPrintOperation does not retain its delegate; keep it alive until
        // the completion callback has run.
        static DELEGATE: RefCell<Option<Retained<PdfExportDelegate>>> = const { RefCell::new(None) };
    }

    impl PdfExportDelegate {
        fn new(mtm: MainThreadMarker, tx: Sender<ExportResult>) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(Ivars {
                done: RefCell::new(Some(tx)),
            });
            // SAFETY: NSObject's designated initializer.
            unsafe { msg_send![super(this), init] }
        }
    }

    pub fn print_to_pdf(
        platform: tauri::webview::PlatformWebview,
        path: &Path,
        tx: Sender<ExportResult>,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            let _ = tx.send(Err("PDF export must run on the main thread".into()));
            return;
        };
        // SAFETY: on macOS `inner()` is the live WKWebView backing this webview,
        // and `with_webview` runs this closure on the main thread.
        let webview: &WKWebView = unsafe { &*platform.inner().cast::<WKWebView>() };
        let Some(window) = webview.window() else {
            let _ = tx.send(Err("The note view is not attached to a window".into()));
            return;
        };

        let info: Retained<NSPrintInfo> = NSPrintInfo::sharedPrintInfo().copy();
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        // SAFETY: NSPrintJobSavingURL expects an NSURL; NSPrintSaveJob is a
        // valid job disposition.
        unsafe {
            info.setJobDisposition(NSPrintSaveJob);
            let url: &AnyObject = &url;
            info.dictionary()
                .setObject_forKey(url, ProtocolObject::from_ref(NSPrintJobSavingURL));
        }
        info.setHorizontalPagination(NSPrintingPaginationMode::Automatic);
        info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
        info.setTopMargin(MARGIN);
        info.setBottomMargin(MARGIN);
        info.setLeftMargin(MARGIN);
        info.setRightMargin(MARGIN);

        // SAFETY: the webview and print info are valid for the call.
        let op = unsafe { webview.printOperationWithPrintInfo(&info) };
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);

        let delegate = PdfExportDelegate::new(mtm, tx);
        // WKWebView lays out print pages asynchronously; the synchronous
        // `runOperation` produces blank pages, so run it against the window
        // and wait for the delegate callback instead.
        // SAFETY: the selector matches the delegate method's signature, and
        // the delegate is kept alive in DELEGATE until it fires.
        unsafe {
            op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                &window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                std::ptr::null_mut(),
            );
        }
        DELEGATE.with(|slot| *slot.borrow_mut() = Some(delegate));
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
mod platform {
    use super::ExportResult;
    use std::path::Path;
    use std::sync::mpsc::Sender;

    pub fn print_to_pdf(
        _platform: tauri::webview::PlatformWebview,
        _path: &Path,
        tx: Sender<ExportResult>,
    ) {
        let _ = tx.send(Err(
            "PDF export is not supported on this platform yet".into()
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn keeps_a_pdf_extension_in_any_case() {
        assert_eq!(
            normalize_pdf_path("/tmp/Note.pdf").unwrap(),
            PathBuf::from("/tmp/Note.pdf")
        );
        assert_eq!(
            normalize_pdf_path("/tmp/Note.PDF").unwrap(),
            PathBuf::from("/tmp/Note.PDF")
        );
    }

    #[cfg(unix)]
    #[test]
    fn appends_pdf_when_the_extension_is_missing_or_different() {
        assert_eq!(
            normalize_pdf_path("/tmp/Note").unwrap(),
            PathBuf::from("/tmp/Note.pdf")
        );
        assert_eq!(
            normalize_pdf_path("/tmp/Note.md").unwrap(),
            PathBuf::from("/tmp/Note.md.pdf")
        );
        assert_eq!(
            normalize_pdf_path("/tmp/v1.2 notes").unwrap(),
            PathBuf::from("/tmp/v1.2 notes.pdf")
        );
    }

    #[test]
    fn rejects_relative_paths() {
        assert!(normalize_pdf_path("Note.pdf").is_err());
        assert!(normalize_pdf_path("").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_paths_without_a_file_name() {
        assert!(normalize_pdf_path("/").is_err());
    }
}
