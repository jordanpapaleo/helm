import { Icon } from "@iconify/react";
import matter from "gray-matter";
import { memo, useEffect, useId, useRef, useState } from "react";
import { isArchived } from "../../lib/archive";
import { NOTE_STATES, UNMANAGED_CLEARED_FIELDS } from "../../lib/constants";
import { resolveOutgoingLinks } from "../../lib/note-links";
import { formatTimestamp } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
import { reportError } from "../../store/toast";
import type { NoteFrontmatter, NoteState } from "../../types/note";
import { PinToSideButton } from "../layout/PinToSideButton";

interface PropertyPanelProps {
  frontmatter: NoteFrontmatter;
  /** Body used to resolve [[wiki links]]. Falls back to the loaded note. */
  content?: string;
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

/** Shown as text. Path is rendered beside these but is not a frontmatter key. */
const READ_ONLY_KEYS = new Set(["id", "created", "updated"]);

/**
 * Workflow fields an unmanaged note does not use. They leave the heading and
 * the properties editor, and marking the note unmanaged clears their values.
 */
const UNMANAGED_HIDDEN_KEYS = new Set(["state", "urgent", "important", "blocked"]);

/** Known keys keep a stable order. Anything else follows in file order. */
const KNOWN_ORDER = [
  "title",
  "state",
  "urgent",
  "important",
  "blocked",
  "pinned",
  "locked",
  "template",
  "unmanaged",
  "archived",
  "deadline",
  "team",
  "tags",
  "links",
  "kanbanOrder",
  "eisenhowerOrder",
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** Helm stores timestamps as UTC seconds with a trailing Z. */
const STORED_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE_PLACEHOLDER = "YYYY-MM-DD";
const DATETIME_PLACEHOLDER = "YYYY-MM-DDTHH:mm:ssZ";

type ValueKind =
  | "boolean"
  | "date"
  | "datetime"
  | "array"
  | "state"
  | "number"
  | "string"
  | "object";

function valueKind(key: string, value: unknown): ValueKind {
  if (key === "state") return "state";
  // deadline stays a calendar date even when the value is blank, so the
  // empty field can show YYYY-MM-DD instead of a generic text box.
  if (key === "deadline") return "date";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  if (typeof value === "string" && DATE_ONLY.test(value)) return "date";
  if (typeof value === "string" && DATE_TIME.test(value)) return "datetime";
  return "string";
}

function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function editableKeys(frontmatter: NoteFrontmatter): string[] {
  const hideWorkflow = frontmatter.unmanaged === true;
  const keys = Object.keys(frontmatter).filter(
    (key) => !READ_ONLY_KEYS.has(key) && !(hideWorkflow && UNMANAGED_HIDDEN_KEYS.has(key)),
  );
  const known = KNOWN_ORDER.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !KNOWN_ORDER.includes(key));
  return [...known, ...rest];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function listText(value: unknown[]): string {
  return value.map((item) => String(item)).join(", ");
}

function parseList(text: string, current: unknown[]): unknown[] {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const numeric = current.length > 0 && current.every((item) => typeof item === "number");
  if (!numeric) return parts;
  if (parts.some((part) => part.trim() === "" || !Number.isFinite(Number(part)))) {
    throw new Error("Enter numbers separated by commas");
  }
  return parts.map((part) => Number(part));
}

function parseNumber(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "" || !Number.isFinite(Number(trimmed))) {
    throw new Error("Enter a number");
  }
  return Number(trimmed);
}

function commitDate(draft: string): string {
  const trimmed = draft.trim();
  if (trimmed === "") return "";
  if (!isCalendarDate(trimmed)) throw new Error(`Enter a date as ${DATE_PLACEHOLDER}`);
  return trimmed;
}

function commitDatetime(draft: string, current: string): string {
  const trimmed = draft.trim();
  if (trimmed === "" || trimmed === current) return trimmed === "" ? "" : current;
  if (!STORED_DATETIME.test(trimmed) || !isCalendarDate(trimmed.slice(0, 10))) {
    throw new Error(`Enter a time as ${DATETIME_PLACEHOLDER}`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Enter a time as ${DATETIME_PLACEHOLDER}`);
  }
  return trimmed;
}

function parseObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Enter a JSON or YAML object");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    try {
      parsed = matter(`---\n${trimmed}\n---\n`).data;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid YAML";
      throw new Error(detail);
    }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Enter a JSON or YAML object");
  }
  return parsed as Record<string, unknown>;
}

function displayText(kind: ValueKind, value: unknown): string {
  if (kind === "array" && Array.isArray(value)) return listText(value);
  if (kind === "object") return JSON.stringify(value);
  if (kind === "datetime" && typeof value === "string") return value;
  if (kind === "number") return String(value ?? "");
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-base-300/40 last:border-0">
      <span className="w-24 shrink-0 text-xs opacity-50">{label}</span>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  );
}

function StateSelect({
  value,
  onChange,
  label = "State",
  className = "select select-sm note-heading-state",
  disabled = false,
}: {
  value: NoteState;
  onChange: (state: NoteState) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as NoteState)}
    >
      <option value="">State</option>
      {NOTE_STATES.map((state) => (
        <option key={state} value={state}>
          {state}
        </option>
      ))}
    </select>
  );
}

function FieldText({ value }: { value: string }) {
  return value ? (
    <span className="text-[var(--color-text)]">{value}</span>
  ) : (
    <span className="text-[var(--color-text-muted)]">—</span>
  );
}

function DraftInput({
  label,
  text,
  placeholder,
  disabled,
  mono = false,
  onCommit,
}: {
  label: string;
  text: string;
  placeholder?: string;
  disabled: boolean;
  mono?: boolean;
  /** Return false to reject the draft and restore the stored value. */
  onCommit: (draft: string) => boolean;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    setDraft(text);
  }, [text]);

  function commit() {
    if (disabled) return;
    if (!onCommit(draft)) setDraft(text);
  }

  return (
    <input
      aria-label={label}
      type="text"
      inputMode={placeholder ? "numeric" : undefined}
      spellCheck={placeholder ? false : undefined}
      placeholder={placeholder}
      disabled={disabled}
      value={draft}
      className={`input input-sm w-full max-w-md placeholder:text-[var(--color-text-muted)] ${mono ? "font-mono text-xs" : ""}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commit();
      }}
    />
  );
}

function FrontmatterValue({
  fieldKey,
  value,
  disabled,
  onChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  onChange: (updates: Partial<NoteFrontmatter>) => void;
}) {
  const kind = valueKind(fieldKey, value);
  const text = displayText(kind, value);

  function commitParsed(next: unknown): boolean {
    if (sameValue(next, value)) return true;
    onChange({ [fieldKey]: next });
    return true;
  }

  function commitText(draft: string): boolean {
    try {
      // A cleared field is removed. Writing "" created deadline: '' and team: ''
      // on disk. A key that already holds "" stays that way.
      if ((kind === "string" || kind === "date" || kind === "datetime") && draft.trim() === "") {
        return commitParsed(value === "" ? "" : undefined);
      }
      if (kind === "number") return commitParsed(parseNumber(draft));
      if (kind === "date") return commitParsed(commitDate(draft));
      if (kind === "datetime") {
        return commitParsed(commitDatetime(draft, typeof value === "string" ? value : ""));
      }
      if (kind === "array") {
        return commitParsed(parseList(draft, Array.isArray(value) ? value : []));
      }
      if (kind === "object") return commitParsed(parseObject(draft));
      return commitParsed(draft);
    } catch (error) {
      reportError(`Could not save ${fieldKey}`, error);
      return false;
    }
  }

  if (kind === "boolean") {
    return (
      <input
        type="checkbox"
        className="toggle toggle-sm"
        aria-label={fieldKey}
        checked={value === true}
        disabled={disabled}
        onChange={(event) => onChange({ [fieldKey]: event.target.checked })}
      />
    );
  }

  if (kind === "state") {
    return (
      <StateSelect
        label="state"
        className="select select-sm w-full max-w-md"
        value={(typeof value === "string" ? value : "") as NoteState}
        disabled={disabled}
        onChange={(state) => onChange({ state })}
      />
    );
  }

  return (
    <DraftInput
      label={fieldKey}
      text={text}
      mono={kind === "object" || kind === "datetime"}
      placeholder={
        kind === "date" ? DATE_PLACEHOLDER : kind === "datetime" ? DATETIME_PLACEHOLDER : undefined
      }
      disabled={disabled}
      onCommit={commitText}
    />
  );
}

/** Stable icon ids. Iconify otherwise mints new ids and replaces the svg on every render. */
const HeadingIcon = memo(function HeadingIcon({
  icon,
  id,
  className = "h-4 w-4",
}: {
  icon: string;
  id: string;
  className?: string;
}) {
  return <Icon id={id} icon={icon} className={className} aria-hidden="true" />;
});

function iconButtonClass(tone: "default" | "active" | "danger" = "default"): string {
  const color =
    tone === "active"
      ? "text-[var(--color-accent)]"
      : tone === "danger"
        ? "text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
        : "text-[var(--color-text-muted)]";
  return `btn btn-ghost btn-sm btn-square ${color}`;
}

function HeadingDivider() {
  return (
    <span
      data-testid="heading-divider"
      aria-hidden="true"
      className="inline-block h-4 w-px shrink-0 self-center bg-base-300"
    />
  );
}

function JoinToggle({
  label,
  segments,
}: {
  label: string;
  segments: Array<{
    label: string;
    pressed: boolean;
    title?: string;
    onClick: () => void;
  }>;
}) {
  return (
    <fieldset className="join note-heading-mode m-0 inline-flex h-8 items-center rounded-full border-0 bg-base-200 p-0.5 [min-inline-size:0]">
      <legend className="sr-only">{label}</legend>
      {segments.map((segment) => (
        <button
          key={segment.label}
          type="button"
          aria-label={segment.label}
          aria-pressed={segment.pressed}
          title={segment.title ?? segment.label}
          data-selected={segment.pressed ? "true" : "false"}
          className="btn btn-sm join-item h-7 min-h-0 rounded-full px-3 font-medium"
          onClick={segment.onClick}
        >
          {segment.label}
        </button>
      ))}
    </fieldset>
  );
}

const FlagSwitch = memo(
  function FlagSwitch({
    label,
    pressed,
    icon,
    onToggle,
    indicator = "switch",
    controls,
  }: {
    label: string;
    pressed: boolean;
    icon: string;
    onToggle: () => void;
    /** Pin and lock stay switches. The other heading toggles report aria-pressed. */
    indicator?: "switch" | "pressed";
    /** When set, the button also exposes aria-expanded for the controlled panel. */
    controls?: string;
  }) {
    const pressedProps =
      indicator === "switch"
        ? ({ role: "switch", "aria-checked": pressed } as const)
        : ({ "aria-pressed": pressed } as const);
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        data-icon={icon}
        aria-expanded={controls ? pressed : undefined}
        aria-controls={controls}
        className={iconButtonClass(pressed ? "active" : "default")}
        onClick={onToggle}
        {...pressedProps}
      >
        <HeadingIcon icon={icon} id={`note-heading-${label}`} />
      </button>
    );
  },
  (prev, next) =>
    prev.label === next.label &&
    prev.pressed === next.pressed &&
    prev.icon === next.icon &&
    prev.controls === next.controls &&
    (prev.indicator ?? "switch") === (next.indicator ?? "switch"),
);

function HeaderTags({
  value,
  onChange,
}: {
  value: string[];
  onChange: (u: Partial<NoteFrontmatter>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCommit = useRef(false);

  useEffect(() => {
    if (!adding) return;
    inputRef.current?.focus();
  }, [adding]);

  function commit() {
    const next = draft.trim().replace(/^#/, "");
    setDraft("");
    setAdding(false);
    if (!next || value.includes(next)) return;
    onChange({ tags: [...value, next] });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {value.map((tag) => (
        <span key={tag} className="badge badge-ghost gap-1 font-normal">
          <span>#{tag}</span>
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            title={`Remove tag ${tag}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
            onClick={() => onChange({ tags: value.filter((item) => item !== tag) })}
          >
            <HeadingIcon icon="uil:times" id={`note-heading-tag-${tag}`} className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          aria-label="New tag"
          value={draft}
          placeholder="tag"
          className="w-28 border-b border-[var(--color-border)] bg-transparent px-1 py-0.5 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (skipCommit.current) {
              skipCommit.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              skipCommit.current = true;
              setDraft("");
              setAdding(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label="Add tag"
          className="inline-flex items-center gap-1 px-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          onClick={() => {
            skipCommit.current = false;
            setAdding(true);
          }}
        >
          <HeadingIcon icon="uil:plus" id="note-heading-add-tag" className="h-3 w-3" />
          Tag
        </button>
      )}
    </div>
  );
}

function sameHeadingProps(prev: PropertyPanelProps, next: PropertyPanelProps): boolean {
  return (
    prev.frontmatter === next.frontmatter &&
    prev.content === next.content &&
    prev.filePath === next.filePath &&
    prev.readOnly === next.readOnly &&
    prev.markdownMode === next.markdownMode &&
    prev.exportingPdf === next.exportingPdf &&
    (prev.onDelete === undefined) === (next.onDelete === undefined) &&
    (prev.onArchive === undefined) === (next.onArchive === undefined) &&
    (prev.onToggleMarkdown === undefined) === (next.onToggleMarkdown === undefined) &&
    (prev.onShowHistory === undefined) === (next.onShowHistory === undefined) &&
    (prev.onExportPdf === undefined) === (next.onExportPdf === undefined)
  );
}

export const PropertyPanel = memo(function PropertyPanel({
  frontmatter,
  content,
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
  const propertiesId = useId();
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
  // A string selector so an unrelated note reload does not redraw the header
  // when the resolved titles stay the same. Resolution matches the graph and
  // the footer: saved ids plus [[wiki links]] in the body.
  const linkSummary = useNoteStore((state) => {
    const linkBody = content ?? state.notes.find((n) => n.id === frontmatter.id)?.content ?? "";
    return resolveOutgoingLinks({ id: frontmatter.id, content: linkBody, frontmatter }, state.notes)
      .map((link) => {
        const title = state.notes.find((note) => note.id === link.id)?.frontmatter.title ?? link.id;
        return `${link.id}\t${title}`;
      })
      .join("\n");
  });
  const outgoingLinks = linkSummary
    ? linkSummary.split("\n").map((row) => {
        const tab = row.indexOf("\t");
        return { id: row.slice(0, tab), title: row.slice(tab + 1) };
      })
    : [];

  const unmanaged = frontmatter.unmanaged ?? false;
  const archived = isArchived(frontmatter);
  const fieldsDisabled = readOnly || frontmatter.locked === true;

  return (
    <div className="space-y-3 border-b border-base-300 px-12 py-4" data-testid="note-heading">
      <div
        data-testid="note-heading-title-row"
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2"
      >
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
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-accent)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitTitle(titleDraft)}
              >
                <HeadingIcon icon="uil:check" id="note-heading-save-title" />
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
                  className="btn btn-ghost btn-xs btn-square shrink-0 text-[var(--color-text-muted)]"
                  onClick={beginTitleEdit}
                >
                  <HeadingIcon icon="uil:pen" id="note-heading-edit-title" />
                </button>
              )}
            </>
          )}
          {archived && <span className="badge badge-ghost badge-sm shrink-0">Archived</span>}
        </div>

        <div
          data-testid="note-heading-actions"
          className="flex shrink-0 flex-wrap items-center gap-1"
        >
          {filePath && (
            <button
              type="button"
              onClick={copyPath}
              aria-label="Copy file path"
              title="Copy file path"
              className={iconButtonClass(copied ? "active" : "default")}
            >
              <HeadingIcon icon={copied ? "uil:check" : "uil:copy"} id="note-heading-copy" />
            </button>
          )}
          <PinToSideButton noteId={frontmatter.id} variant="editor" />
          {onShowHistory && (
            <button
              type="button"
              onClick={onShowHistory}
              aria-label="Note history"
              title="Note history"
              className={iconButtonClass()}
            >
              <HeadingIcon icon="uil:history" id="note-heading-history" />
            </button>
          )}
          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              disabled={exportingPdf}
              aria-label="Export to PDF"
              title="Export to PDF (⇧⌘E)"
              className={iconButtonClass()}
            >
              <HeadingIcon icon="uil:file-export" id="note-heading-export" />
            </button>
          )}
          {onToggleMarkdown && (
            <>
              <HeadingDivider />
              <JoinToggle
                label="Editor mode"
                segments={[
                  {
                    label: "Rich",
                    pressed: markdownMode !== true,
                    title: markdownMode ? "Switch to editor" : "Rich text",
                    onClick: () => {
                      if (markdownMode) onToggleMarkdown();
                    },
                  },
                  {
                    label: "Markdown",
                    pressed: markdownMode === true,
                    title: markdownMode ? "Markdown" : "Switch to Markdown",
                    onClick: () => {
                      if (!markdownMode) onToggleMarkdown();
                    },
                  },
                ]}
              />
            </>
          )}
          {(onArchive || onDelete) && <HeadingDivider />}
          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              title={archived ? "Unarchive note" : "Archive note"}
              aria-label={archived ? "Unarchive note" : "Archive note"}
              className={iconButtonClass()}
            >
              <HeadingIcon icon="uil:archive" id="note-heading-archive" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete note"
              title="Delete note"
              className={iconButtonClass("danger")}
            >
              <HeadingIcon icon="uil:trash-alt" id="note-heading-delete" />
            </button>
          )}
          <HeadingDivider />
          <FlagSwitch
            label="Properties"
            pressed={expanded}
            icon="uil:info-circle"
            indicator="pressed"
            controls={propertiesId}
            onToggle={() => setExpanded((open) => !open)}
          />
        </div>
      </div>

      <div
        data-testid="note-heading-meta-row"
        className="flex min-w-0 flex-wrap items-center justify-start gap-2"
      >
        <fieldset
          disabled={readOnly}
          className="m-0 flex min-w-0 flex-wrap items-center justify-start gap-2 border-0 p-0"
        >
          {/* State, Urgent, and Important are workflow. Blocked lives in
              Properties. All four are hidden once the note is unmanaged. */}
          {!unmanaged && (
            <>
              <StateSelect value={frontmatter.state} onChange={(state) => onChange({ state })} />
              <FlagSwitch
                label="Urgent"
                pressed={frontmatter.urgent}
                icon="uil:clock"
                indicator="pressed"
                onToggle={() => onChange({ urgent: !frontmatter.urgent })}
              />
              <FlagSwitch
                label="Important"
                pressed={frontmatter.important}
                icon="uil:star"
                indicator="pressed"
                onToggle={() => onChange({ important: !frontmatter.important })}
              />
              <HeadingDivider />
            </>
          )}
          <FlagSwitch
            label="Pinned"
            pressed={frontmatter.pinned ?? false}
            icon="uil:map-pin"
            onToggle={() => onChange({ pinned: !(frontmatter.pinned ?? false) })}
          />
          <FlagSwitch
            label="Locked"
            pressed={frontmatter.locked ?? false}
            icon={frontmatter.locked ? "uil:lock" : "uil:unlock"}
            onToggle={() => onChange({ locked: !(frontmatter.locked ?? false) })}
          />
          <FlagSwitch
            label="Template"
            pressed={frontmatter.template ?? false}
            icon="uil:clipboard-notes"
            indicator="pressed"
            onToggle={() => onChange({ template: !(frontmatter.template ?? false) })}
          />
          <FlagSwitch
            label="Unmanaged"
            pressed={unmanaged}
            icon="uil:eye-slash"
            indicator="pressed"
            onToggle={() =>
              onChange(
                unmanaged ? { unmanaged: false } : { unmanaged: true, ...UNMANAGED_CLEARED_FIELDS },
              )
            }
          />
          <HeadingDivider />
          <HeaderTags key={frontmatter.id} value={frontmatter.tags} onChange={onChange} />
        </fieldset>
      </div>

      {expanded && (
        <section
          id={propertiesId}
          data-testid="note-properties"
          aria-label="Properties"
          className="min-w-0 rounded-lg border border-base-300 bg-base-200/50 px-4 py-2 text-sm"
        >
          <Row label="Path">
            <FieldText value={filePath ?? ""} />
          </Row>
          <Row label="id">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {frontmatter.id}
            </span>
          </Row>
          <Row label="created">
            <span className="text-[var(--color-text-muted)]" title={frontmatter.created}>
              {formatTimestamp(frontmatter.created)}
            </span>
          </Row>
          <Row label="updated">
            <span className="text-[var(--color-text-muted)]" title={frontmatter.updated}>
              {formatTimestamp(frontmatter.updated)}
            </span>
          </Row>
          <fieldset disabled={fieldsDisabled} className="m-0 min-w-0 border-0 p-0">
            {editableKeys(frontmatter).map((key) => (
              <Row key={key} label={key}>
                <FrontmatterValue
                  fieldKey={key}
                  value={frontmatter[key]}
                  disabled={fieldsDisabled}
                  onChange={onChange}
                />
              </Row>
            ))}
          </fieldset>
          <Row label="Links">
            {outgoingLinks.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {outgoingLinks.map((link) => (
                  <span key={link.id} className="badge badge-ghost badge-sm">
                    {link.title}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[var(--color-text-muted)]">—</span>
            )}
          </Row>
        </section>
      )}
    </div>
  );
}, sameHeadingProps);
