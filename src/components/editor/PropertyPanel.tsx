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

function FieldText({ value }: { value: string }) {
  return value ? (
    <span className="text-[var(--color-text)]">{value}</span>
  ) : (
    <span className="text-[var(--color-text-muted)]">—</span>
  );
}

function yesNo(value: boolean | undefined): string {
  return value ? "Yes" : "No";
}

function formatExtra(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
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
          <Row label="ID">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {frontmatter.id}
            </span>
          </Row>
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
            <FieldText value={frontmatter.deadline ?? ""} />
          </Row>
          <Row label="Team">
            <FieldText value={frontmatter.team?.join(", ") ?? ""} />
          </Row>
          <Row label="Tags">
            <FieldText value={frontmatter.tags.join(", ")} />
          </Row>
          <Row label="Blocked">
            <FieldText value={yesNo(frontmatter.blocked)} />
          </Row>
          <Row label="Unmanaged">
            <FieldText value={yesNo(unmanaged)} />
          </Row>
          <Row label="Template">
            <FieldText value={yesNo(frontmatter.template)} />
          </Row>
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
          {extraFields.map(([key, value]) => (
            <Row key={key} label={key}>
              <FieldText value={formatExtra(value)} />
            </Row>
          ))}
        </section>
      )}
    </div>
  );
}, sameHeadingProps);
