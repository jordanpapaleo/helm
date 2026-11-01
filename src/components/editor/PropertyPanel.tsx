import { Icon } from "@iconify/react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { isArchived } from "../../lib/archive";
import { NOTE_STATES, UNMANAGED_CLEARED_FIELDS } from "../../lib/constants";
import { resolveOutgoingLinks } from "../../lib/note-links";
import { formatTimestamp } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
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

function StateSelect({
  value,
  onChange,
}: {
  value: NoteState;
  onChange: (state: NoteState) => void;
}) {
  return (
    <select
      aria-label="State"
      className="select select-sm note-heading-state"
      value={value}
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

function PriorityFilter({
  urgent,
  important,
  onChange,
}: {
  urgent: boolean;
  important: boolean;
  onChange: (updates: Partial<NoteFrontmatter>) => void;
}) {
  return (
    <fieldset className="filter note-heading-filter m-0 inline-flex items-center border-0 p-0 [min-inline-size:0]">
      <legend className="sr-only">Priority</legend>
      <input
        className="btn btn-sm"
        type="checkbox"
        aria-label="Urgent"
        title="Urgent"
        checked={urgent}
        onChange={() => onChange({ urgent: !urgent })}
      />
      <input
        className="btn btn-sm"
        type="checkbox"
        aria-label="Important"
        title="Important"
        checked={important}
        onChange={() => onChange({ important: !important })}
      />
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
  }: {
    label: string;
    pressed: boolean;
    icon: string;
    onToggle: () => void;
    /** Pin and lock stay switches. Template and Unmanaged report aria-pressed. */
    indicator?: "switch" | "pressed";
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(frontmatter.title);
  const editingTitleRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const infoRef = useRef<HTMLUListElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const infoId = useId();
  const canEditTitle = !readOnly && !frontmatter.locked;

  // Drop an in-progress edit when the open note changes, even if the titles match.
  // biome-ignore lint/correctness/useExhaustiveDependencies: frontmatter.id is the note switch; title is read from the new note
  useEffect(() => {
    editingTitleRef.current = false;
    setEditingTitle(false);
    setTitleDraft(frontmatter.title);
    setInfoOpen(false);
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

  useEffect(() => {
    if (!infoOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (infoRef.current?.contains(target) || infoButtonRef.current?.contains(target)) return;
      setInfoOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setInfoOpen(false);
      infoButtonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

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

  // Extra unknown fields beyond the known set
  const extraFields = Object.entries(frontmatter).filter(([k]) => !KNOWN_FIELDS.has(k));

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
          <div
            className={`dropdown dropdown-end dropdown-bottom ${infoOpen ? "dropdown-open" : ""}`}
          >
            <button
              ref={infoButtonRef}
              type="button"
              aria-label="Note info"
              aria-haspopup="menu"
              aria-expanded={infoOpen}
              aria-controls={infoOpen ? infoId : undefined}
              title="Note info"
              className={iconButtonClass(infoOpen ? "active" : "default")}
              onClick={() => setInfoOpen((open) => !open)}
            >
              <HeadingIcon icon="uil:info-circle" id="note-heading-info" />
            </button>
            {infoOpen && (
              <ul
                ref={infoRef}
                id={infoId}
                aria-label="Note info"
                className="dropdown-content menu menu-sm z-50 mt-1 w-72 rounded-box border border-base-300 bg-base-100 p-2 text-xs shadow-xl"
              >
                <li>
                  <span className="flex justify-between gap-3">
                    <span className="text-[var(--color-text-muted)]">Created</span>
                    <span className="text-[var(--color-text)]" title={frontmatter.created}>
                      {formatTimestamp(frontmatter.created)}
                    </span>
                  </span>
                </li>
                <li>
                  <span className="flex justify-between gap-3">
                    <span className="text-[var(--color-text-muted)]">Updated</span>
                    <span className="text-[var(--color-text)]" title={frontmatter.updated}>
                      {formatTimestamp(frontmatter.updated)}
                    </span>
                  </span>
                </li>
                <li>
                  <span className="flex justify-between gap-3">
                    <span className="text-[var(--color-text-muted)]">ID</span>
                    <span className="truncate font-mono text-[var(--color-text)]">
                      {frontmatter.id}
                    </span>
                  </span>
                </li>
                {filePath && (
                  <li>
                    <span className="flex justify-between gap-3">
                      <span className="text-[var(--color-text-muted)]">Path</span>
                      <span className="truncate text-[var(--color-text)]" title={filePath}>
                        {filePath}
                      </span>
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
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
          <StateSelect value={frontmatter.state} onChange={(state) => onChange({ state })} />
          <PriorityFilter
            urgent={frontmatter.urgent}
            important={frontmatter.important}
            onChange={onChange}
          />
          <HeadingDivider />
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
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="btn btn-ghost btn-xs ml-auto gap-1 self-center"
        >
          Properties
          <HeadingIcon
            icon="uil:angle-down"
            id="note-heading-properties"
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Expanded frontmatter panel */}
      {expanded && (
        <fieldset
          disabled={readOnly}
          className="m-0 min-w-0 rounded-lg border border-base-300 bg-base-200/50 px-4 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-base-300/40 py-2">
            {!unmanaged && (
              <label className="flex cursor-pointer items-center gap-1.5 opacity-70 hover:opacity-100">
                <input
                  type="checkbox"
                  checked={frontmatter.blocked}
                  onChange={(e) => onChange({ blocked: e.target.checked })}
                  className="rounded accent-[var(--color-accent)]"
                />
                Blocked
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 opacity-70 hover:opacity-100">
              <input
                type="checkbox"
                checked={unmanaged}
                onChange={(e) =>
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
            <label className="flex cursor-pointer items-center gap-1.5 opacity-70 hover:opacity-100">
              <input
                type="checkbox"
                checked={frontmatter.template ?? false}
                onChange={(e) => onChange({ template: e.target.checked })}
                className="rounded accent-[var(--color-accent)]"
              />
              Template
            </label>
          </div>
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
            {outgoingLinks.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {outgoingLinks.map((link) => (
                  <span key={link.id} className="badge badge-ghost badge-sm">
                    {link.title}
                  </span>
                ))}
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
}, sameHeadingProps);
