import { useEffect, useState } from "react";
import { NOTE_STATES } from "../../lib/constants";
import { useNoteStore } from "../../store/notes";
import type { NoteFrontmatter, NoteState } from "../../types/note";

interface PropertyPanelProps {
  frontmatter: NoteFrontmatter;
  filePath?: string;
  onChange: (updates: Partial<NoteFrontmatter>) => void;
  onTitleTab?: () => void;
  onDelete?: () => void;
  markdownMode?: boolean;
  onToggleMarkdown?: () => void;
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
  "unmanaged",
  "kanbanOrder",
  "eisenhowerOrder",
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
}: { value: string[] | undefined; onChange: (u: Partial<NoteFrontmatter>) => void }) {
  const [draft, setDraft] = useState(value?.join(", ") ?? "");
  useEffect(() => { setDraft(value?.join(", ") ?? ""); }, [value]);
  return (
    <Row label="Team">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          onChange({
            team: draft.trim()
              ? draft.split(",").map((t) => t.trim()).filter(Boolean)
              : undefined,
          })
        }
        placeholder="CE, RL, …"
        className="w-full bg-transparent text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]/50"
      />
    </Row>
  );
}

function TagsInput({
  value,
  onChange,
}: { value: string[]; onChange: (u: Partial<NoteFrontmatter>) => void }) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => { setDraft(value.join(", ")); }, [value]);
  return (
    <Row label="Tags">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          onChange({
            tags: draft.trim()
              ? draft.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean)
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
  onTitleTab,
  onDelete,
  markdownMode,
  onToggleMarkdown,
}: PropertyPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyPath() {
    if (!filePath) return;
    navigator.clipboard.writeText(filePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const { notes } = useNoteStore();

  // Extra unknown fields beyond the known set
  const extraFields = Object.entries(frontmatter).filter(([k]) => !KNOWN_FIELDS.has(k));

  return (
    <div className="border-b border-base-300 px-12 py-4 space-y-3">
      {/* Title row */}
      <div className="flex items-center gap-3">
        <input
          className="flex-1 bg-transparent text-3xl font-bold text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
          value={frontmatter.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              onTitleTab?.();
            }
          }}
          placeholder="Untitled"
        />
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
        {onToggleMarkdown && (
          <button
            type="button"
            onClick={onToggleMarkdown}
            title={markdownMode ? "Switch to editor" : "Switch to Markdown"}
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            {markdownMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            )}
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

      {/* Compact metadata row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">State</span>
          <select
            className="select select-ghost select-sm h-auto min-h-0 py-0.5"
            value={frontmatter.state}
            onChange={(e) => onChange({ state: e.target.value as NoteState })}
          >
            {NOTE_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
            checked={frontmatter.unmanaged ?? false}
            onChange={(e) => onChange({ unmanaged: e.target.checked })}
            className="rounded accent-[var(--color-accent)]"
          />
          Unmanaged
        </label>

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
        <div className="rounded-lg border border-base-300 bg-base-200/50 px-4 py-2 text-sm">
          <Row label="ID">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {frontmatter.id}
            </span>
          </Row>

          <Row label="Created">
            <span className="text-[var(--color-text-muted)]">{frontmatter.created}</span>
          </Row>

          <Row label="Updated">
            <span className="text-[var(--color-text-muted)]">{frontmatter.updated}</span>
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
        </div>
      )}

      {/* Tags display */}
      {frontmatter.tags.length > 0 && !expanded && (
        <div className="flex flex-wrap gap-1.5">
          {frontmatter.tags.map((tag) => (
            <span key={tag} className="badge badge-ghost badge-sm">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
