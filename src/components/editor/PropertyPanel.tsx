import { Icon } from "@iconify/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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

const STATE_CHOICES: Array<{ value: NoteState; label: string }> = [
  { value: "", label: "None" },
  ...NOTE_STATES.map((state) => ({ value: state as NoteState, label: state })),
];

/**
 * Workflow state as a DaisyUI dropdown. A daisyUI `<select class="select">` opts into
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className={`dropdown dropdown-bottom ${open ? "dropdown-open" : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="State"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="note-heading-state btn btn-sm h-8 min-h-8 gap-2 rounded-full px-3 font-medium"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          data-testid="state-dot"
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-success)]"
        />
        <span>{value || "None"}</span>
        <Icon icon="uil:angle-down" className="h-4 w-4 opacity-70" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Note state"
          className="dropdown-content z-50 mt-1 min-w-[10rem]"
          onKeyDown={onMenuKeyDown}
        >
          <ul className="menu w-full rounded-box border border-base-300 bg-base-100 p-1 shadow-xl">
            {STATE_CHOICES.map((choice) => (
              <li key={choice.label}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === choice.value}
                  className={value === choice.value ? "bg-base-200" : undefined}
                  onClick={() => choose(choice.value)}
                >
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
  tone,
  segments,
}: {
  label: string;
  tone: "mode" | "priority";
  segments: Array<{
    label: string;
    pressed: boolean;
    title?: string;
    onClick: () => void;
  }>;
}) {
  return (
    <fieldset
      className={
        tone === "mode"
          ? "join note-heading-mode m-0 inline-flex h-8 items-center rounded-full border-0 bg-base-200 p-0.5 [min-inline-size:0]"
          : "join note-heading-priority m-0 inline-flex h-8 items-center overflow-hidden rounded-full border border-base-300 bg-base-100 p-0 [min-inline-size:0]"
      }
    >
      <legend className="sr-only">{label}</legend>
      {segments.map((segment) => (
        <button
          key={segment.label}
          type="button"
          aria-label={segment.label}
          aria-pressed={segment.pressed}
          title={segment.title ?? segment.label}
          data-selected={segment.pressed ? "true" : "false"}
          className={`btn btn-sm join-item h-7 min-h-0 px-3 font-medium ${tone === "mode" ? "rounded-full" : ""}`}
          onClick={segment.onClick}
        >
          {segment.label}
        </button>
      ))}
    </fieldset>
  );
}

function FlagSwitch({
  label,
  pressed,
  icon,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  icon: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      aria-label={label}
      title={label}
      className={iconButtonClass(pressed ? "active" : "default")}
      onClick={onToggle}
    >
      <Icon icon={icon} className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

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
            <Icon icon="uil:times" className="h-3 w-3" aria-hidden="true" />
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
          <Icon icon="uil:plus" className="h-3 w-3" aria-hidden="true" />
          Tag
        </button>
      )}
    </div>
  );
}

export function PropertyPanel({
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
  const infoRef = useRef<HTMLDivElement>(null);
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
  const { notes } = useNoteStore();
  const linkBody = content ?? notes.find((n) => n.id === frontmatter.id)?.content ?? "";
  const outgoingLinks = resolveOutgoingLinks(
    { id: frontmatter.id, content: linkBody, frontmatter },
    notes,
  );

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
                  className="btn btn-ghost btn-xs btn-square shrink-0 text-[var(--color-text-muted)]"
                  onClick={beginTitleEdit}
                >
                  <Icon icon="uil:pen" className="h-4 w-4" aria-hidden="true" />
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
              <Icon
                icon={copied ? "uil:check" : "uil:copy"}
                className="h-4 w-4"
                aria-hidden="true"
              />
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
              <Icon icon="uil:history" className="h-4 w-4" aria-hidden="true" />
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
              <Icon icon="uil:file-export" className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {onToggleMarkdown && (
            <>
              <HeadingDivider />
              <JoinToggle
                label="Editor mode"
                tone="mode"
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
              <Icon icon="uil:archive" className="h-4 w-4" aria-hidden="true" />
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
              <Icon icon="uil:trash-alt" className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <HeadingDivider />
          <div className="relative">
            <button
              ref={infoButtonRef}
              type="button"
              aria-label="Note info"
              aria-expanded={infoOpen}
              aria-controls={infoOpen ? infoId : undefined}
              title="Note info"
              className={iconButtonClass(infoOpen ? "active" : "default")}
              onClick={() => setInfoOpen((open) => !open)}
            >
              <Icon icon="uil:info-circle" className="h-4 w-4" aria-hidden="true" />
            </button>
            {infoOpen && (
              <section
                ref={infoRef}
                id={infoId}
                aria-label="Note info"
                className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-base-300 bg-base-100 p-3 text-xs shadow-xl"
              >
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-text-muted)]">Created</dt>
                    <dd className="text-[var(--color-text)]" title={frontmatter.created}>
                      {formatTimestamp(frontmatter.created)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-text-muted)]">Updated</dt>
                    <dd className="text-[var(--color-text)]" title={frontmatter.updated}>
                      {formatTimestamp(frontmatter.updated)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-text-muted)]">ID</dt>
                    <dd className="truncate font-mono text-[var(--color-text)]">
                      {frontmatter.id}
                    </dd>
                  </div>
                  {filePath && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--color-text-muted)]">Path</dt>
                      <dd className="truncate text-[var(--color-text)]" title={filePath}>
                        {filePath}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
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
          <StateMenu value={frontmatter.state} onChange={(state) => onChange({ state })} />
          <JoinToggle
            label="Priority"
            tone="priority"
            segments={[
              {
                label: "Urgent",
                pressed: frontmatter.urgent,
                onClick: () => onChange({ urgent: !frontmatter.urgent }),
              },
              {
                label: "Important",
                pressed: frontmatter.important,
                onClick: () => onChange({ important: !frontmatter.important }),
              },
            ]}
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
            icon={frontmatter.locked ? "uil:lock" : "uil:lock-open-alt"}
            onToggle={() => onChange({ locked: !(frontmatter.locked ?? false) })}
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
          <Icon
            icon="uil:angle-down"
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
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
                {outgoingLinks.map((link) => {
                  const title = notes.find((n) => n.id === link.id)?.frontmatter.title ?? link.id;
                  return (
                    <span key={link.id} className="badge badge-ghost badge-sm">
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
