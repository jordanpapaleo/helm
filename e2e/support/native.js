import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "accept-dialog.py");

/**
 * Accept a native Tauri confirm dialog by its window title.
 *
 * The dialog is a GTK window outside the webview. Return is not Ok: the
 * message text is a selectable label, so the key never activates the button.
 * Start this before the click that opens the dialog.
 */
export function armNativeAccept(title) {
  const child = spawn("python3", [script, title], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  child.stderr.on("data", (chunk) => {
    err += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(err.trim() || `native dialog "${title}" was not accepted (exit ${code})`));
    });
  });
}
