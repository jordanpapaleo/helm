import { Icon } from "@iconify/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isArchived } from "../../lib/archive";
import { NOTE_STATES, UNMANAGED_CLEARED_FIELDS } from "../../lib/constants";
import { formatTimestamp } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
import type { NoteFrontmatter, NoteState } from "../../types/note";
import { PinToSideButton } from "../layout/PinToSideButton";

interface PropertyPanelProps {
  frontmatter: NoteFrontmatter;
  filePath?: string;
  onChange: (updates: Partial<NoteFrontmatter>) => void;
  onDelete?: () => void;
  /** Archive or unarchive. Omitted when the note is locked. */
  onArchive?: () => void;
  markdownMode?: boolean;
  onToggleMarkdown?: () => void;
  onShowHistory?: () => void;
  onExportPdf?: () => void;
  /** True while an export is running; the button is disabled meanwhile. */
  exportingPdf?: boolean;
  /** Deleted notes stay visible but their fields cannot be edited. */
  readOnly?: boolean;
}

// Fields handled explicitly — excluded from the "extra fields" section
const KNOWN_FIELDS = new Set([
  "id",
  "title",
  "created",
  "updated",
  "tags",
  "urgent",
  "important",
  "state",
  "blocked",
  "deadline",
  "team",
  "links",
  "locked",
  "pinned",
  "archived",
  "unmanaged",
  "kanbanOrder",
  "eisenhowerOrder",
  "template",
]);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-base-300/40 last:border-0">
      <span className="w-24 shrink-0 text-xs opacity-50">{label}</span>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  );
}

function TeamInput({
  value,
  onChange,
}: {
  value: string[] | undefined;
  onChange: (u: Partial<NoteFrontmatter>) => void;
}) {
  const [draft, setDraft] = useState(value?.join(", ") ?? "");
  useEffect(() => {
    setDraft(value?.join(", ") ?? "");
  }, [value]);
  return (
    <Row label="Team">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          onChange({
            team: draft.trim()
              ? draft
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
              : undefined,
          })
        }
        placeholder="CE, RL, …"
        className="w-full bg-transparent text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]/50"
      />
    </Row>
  );
}

const STATE_CHOICES: Array<{ value: NoteState; label: string }> = [
  { value: "", label: "None" },
  ...NOTE_STATES.map((state) => ({ value: state as NoteState, label: state })),
];

const menuItemClass =
  "flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]";

/**
 * Workflow state as a normal menu. A daisyUI `<select class="select">` opts into
 * `appearance: base-select`, and that picker anchors to the wrong box — it paints
 * over the note title instead of opening under the control.
 */
function StateMenu({
  value,
  onChange,
}: {
  value: NoteState;
  onChange: (state: NoteState) => void;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const trigger = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const margin = 4;
    const spaceBelow = window.innerHeight - trigger.bottom - margin;
    const top =
      spaceBelow >= menu.height || spaceBelow >= trigger.top
        ? trigger.bottom + margin
        : Math.max(margin, trigger.top - menu.height - margin);
    const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - menu.width - margin));
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selected = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    (selected ?? first)?.focus();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ];
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const current = index === -1 ? (event.key === "ArrowUp" ? 0 : -1) : index;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  function choose(state: NoteState) {
    onChange(state);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="State"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="btn btn-ghost btn-sm h-auto min-h-0 gap-1 px-2 py-0.5 font-normal"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value || "None"}</span>
        <Icon icon="uil:angle-down" className="h-4 w-4 opacity-70" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Note state"
          className="fixed z-50 min-w-[10rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
          style={{ left: pos.left, top: pos.top }}
          onKeyDown={onMenuKeyDown}
        >
          {STATE_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="menuitemradio"
              aria-checked={value === choice.value}
              className={`${menuItemClass} ${value === choice.value ? "bg-[var(--color-bg)]" : ""}`}
              onClick={() => choose(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (u: Partial<NoteFrontmatter>) => void;
}) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => {
    setDraft(value.join(", "));
  }, [value]);
  return (
    <Row label="Tags">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          onChange({
            tags: draft.trim()
              ? draft
                  .split(",")
                  .map((t) => t.trim().replace(/^#/, ""))
                  .filter(Boolean)
              : [],
          })
        }
        placeholder="work, work/project"
        className="w-full bg-transparent text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]/50 text-sm"
      />
    </Row>
  );
}

export function PropertyPanel({
  frontmatter,
  filePath,
  onChange,
  onDelete,
  onArchive,
  markdownMode,
  onToggleMarkdown,
  onShowHistory,
  onExportPdf,
  exportingPdf = false,
  readOnly = false,
}: PropertyPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(frontmatter.title);
  const editingTitleRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const canEditTitle = !readOnly && !frontmatter.locked;

  // Drop an in-progress edit when the open note changes, even if the titles match.
  // biome-ignore lint/correctness/useExhaustiveDependencies: frontmatter.id is the note switch; title is read from the new note
  useEffect(() => {
    editingTitleRef.current = false;
    setEditingTitle(false);
    setTitleDraft(frontmatter.title);
  }, [frontmatter.id]);

  useEffect(() => {
    if (editingTitleRef.current) return;
    setTitleDraft(frontmatter.title);
  }, [frontmatter.title]);

  useEffect(() => {
    if (!editingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editingTitle]);

  function beginTitleEdit() {
    if (!canEditTitle) return;
    setTitleDraft(frontmatter.title);
    editingTitleRef.current = true;
    setEditingTitle(true);
  }

  function commitTitle(raw: string) {
    if (!editingTitleRef.current) return;
    editingTitleRef.current = false;
    setEditingTitle(false);
    const next = raw.trim();
    if (!next || next === frontmatter.title) {
      setTitleDraft(frontmatter.title);
      return;
    }
    setTitleDraft(next);
    onChange({ title: next });
  }

  function cancelTitleEdit() {
    if (!editingTitleRef.current) return;
    editingTitleRef.current = false;
    setEditingTitle(false);
    setTitleDraft(frontmatter.title);
  }

  function copyPath() {
    if (!filePath) return;
    navigator.clipboard.writeText(filePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const { notes } = useNoteStore();

  const unmanaged = frontmatter.unmanaged ?? false;
  const archived = isArchived(frontmatter);

  // Extra unknown fields beyond the known set
  const extraFields = Object.entries(frontmatter).filter(([k]) => !KNOWN_FIELDS.has(k));

  return (
    <div className="border-b border-base-300 px-12 py-4 space-y-3">
      {/* Title row stays clear of the action icons. */}
      <div className="flex min-w-0 items-center gap-2">
        {editingTitle ? (
          <>
            <input
              ref={titleInputRef}
              aria-label="Note title"
              className="min-w-[8ch] max-w-[calc(100%-2.75rem)] rounded-md border border-base-300 bg-transparent px-2 text-3xl font-bold text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              style={{ width: `${Math.max(titleDraft.length + 1, 8)}ch` }}
              value={titleDraft}
              placeholder="Untitled"
              autoComplete="off"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={(e) => commitTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle(e.currentTarget.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTitleEdit();
                }
              }}
            />
            <button
              type="button"
              aria-label="Save title"
              title="Save title"
              className="btn btn-ghost btn-sm btn-square shrink-0 text-[var(--color-accent)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitTitle(titleDraft)}
            >
              <Icon icon="uil:check" className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <h1 className="min-w-0 break-words text-3xl font-bold leading-tight text-[var(--color-text)]">
              {frontmatter.title || "Untitled"}
            </h1>
            {canEditTitle && (
              <button
                type="button"
                aria-label="Edit title"
                title="Edit title"
                className="btn btn-ghost btn-sm btn-square shrink-0 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                onClick={beginTitleEdit}
              >
                <Icon icon="uil:pen" className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
        {archived && <span className="badge badge-ghost badge-sm shrink-0">Archived</span>}
      </div>

      {/* Same actions as before, on their own line under the title. */}
      <div className="flex flex-wrap items-center gap-1">
        {filePath && (
          <button
            type="button"
            onClick={copyPath}
            title="Copy file path"
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            {copied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        )}
        <PinToSideButton noteId={frontmatter.id} variant="editor" />
        {onShowHistory && (
          <button
            type="button"
            onClick={onShowHistory}
            title="Note history"
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        )}
        {onExportPdf && (
          <button
            type="button"
            onClick={onExportPdf}
            disabled={exportingPdf}
            aria-label="Export to PDF"
            title="Export to PDF (⇧⌘E)"
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            <Icon icon="uil:file-export" className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {onToggleMarkdown && (
          <button
            type="button"
            onClick={onToggleMarkdown}
            title={markdownMode ? "Switch to editor" : "Switch to Markdown"}
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            {markdownMode ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            )}
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            onClick={onArchive}
            title={archived ? "Unarchive note" : "Archive note"}
            aria-label={archived ? "Unarchive note" : "Archive note"}
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            <Icon icon="uil:archive" className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete note"
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100 hover:text-error"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Compact metadata row. The Properties button stays outside the disabled
          fieldset so a deleted note can still be inspected. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <fieldset
          disabled={readOnly}
          className="m-0 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-0 p-0"
        >
          {/* Workflow fields are meaningless for unmanaged notes — hidden and cleared */}
          {!unmanaged && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">State</span>
                <StateMenu value={frontmatter.state} onChange={(state) => onChange({ state })} />
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
                <input
                  type="checkbox"
                  checked={frontmatter.urgent}
                  onChange={(e) => onChange({ urgent: e.target.checked })}
                  className="rounded accent-[var(--color-accent)]"
                />
                Urgent
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
                <input
                  type="checkbox"
                  checked={frontmatter.important}
                  onChange={(e) => onChange({ important: e.target.checked })}
                  className="rounded accent-[var(--color-accent)]"
                />
                Important
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
                <input
                  type="checkbox"
                  checked={frontmatter.blocked}
                  onChange={(e) => onChange({ blocked: e.target.checked })}
                  className="rounded accent-[var(--color-accent)]"
                />
                Blocked
              </label>
            </>
          )}

          <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
            <input
              type="checkbox"
              checked={frontmatter.pinned ?? false}
              onChange={(e) => onChange({ pinned: e.target.checked })}
              className="rounded accent-[var(--color-accent)]"
            />
            Pinned
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
            <input
              type="checkbox"
              checked={frontmatter.locked ?? false}
              onChange={(e) => onChange({ locked: e.target.checked })}
              className="rounded accent-[var(--color-accent)]"
            />
            Locked
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
            <input
              type="checkbox"
              checked={unmanaged}
              onChange={(e) =>
                // Clearing rides along in the same update so it is one write, not five.
                onChange(
                  e.target.checked
                    ? { unmanaged: true, ...UNMANAGED_CLEARED_FIELDS }
                    : { unmanaged: false },
                )
              }
              className="rounded accent-[var(--color-accent)]"
            />
            Unmanaged
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
            <input
              type="checkbox"
              checked={frontmatter.template ?? false}
              onChange={(e) => onChange({ template: e.target.checked })}
              className="rounded accent-[var(--color-accent)]"
            />
            Template
          </label>
        </fieldset>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn btn-ghost btn-xs ml-auto gap-1"
        >
          Properties
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Expanded frontmatter panel */}
      {expanded && (
        <fieldset
          disabled={readOnly}
          className="m-0 min-w-0 rounded-lg border border-base-300 bg-base-200/50 px-4 py-2 text-sm"
        >
          <Row label="ID">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {frontmatter.id}
            </span>
          </Row>

          {/* Stored as UTC; shown in the reader's local time. A legacy
              date-only value renders as just a date — no invented midnight. */}
          <Row label="Created">
            <span className="text-[var(--color-text-muted)]" title={frontmatter.created}>
              {formatTimestamp(frontmatter.created)}
            </span>
          </Row>

          <Row label="Updated">
            <span className="text-[var(--color-text-muted)]" title={frontmatter.updated}>
              {formatTimestamp(frontmatter.updated)}
            </span>
          </Row>

          <Row label="Deadline">
            <input
              type="date"
              value={frontmatter.deadline ?? ""}
              onChange={(e) => onChange({ deadline: e.target.value || undefined })}
              className="bg-transparent text-[var(--color-text)] outline-none [color-scheme:dark]"
            />
          </Row>

          <TeamInput value={frontmatter.team} onChange={onChange} />
          <TagsInput value={frontmatter.tags} onChange={onChange} />

          <Row label="Links">
            {frontmatter.links && frontmatter.links.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {frontmatter.links.map((id) => {
                  const title = notes.find((n) => n.id === id)?.frontmatter.title ?? id;
                  return (
                    <span key={id} className="badge badge-ghost badge-sm">
                      {title}
                    </span>
                  );
                })}
              </div>
            ) : (
              <em className="text-xs text-[var(--color-text-muted)]/50">
                use [[Note Title]] in body
              </em>
            )}
          </Row>

          {/* Extra / custom fields */}
          {extraFields.map(([key, value]) => (
            <Row key={key} label={key}>
              <input
                type="text"
                value={String(value ?? "")}
                onChange={(e) => onChange({ [key]: e.target.value })}
                className="w-full bg-transparent text-[var(--color-text)] outline-none"
              />
            </Row>
          ))}
        </fieldset>
      )}
    </div>
  );
}
