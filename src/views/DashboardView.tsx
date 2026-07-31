/**
 * Dashboard view — overview and statistics for notes.
 * Displays summary chips for Eisenhower quadrants, tag/state/team distribution
 * charts, and a filterable note list. Clicking a chip filters all content to that subset.
 */
import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { buildBriefing } from "../lib/briefing";
import { NOTE_STATES } from "../lib/constants";
import { useNoteStore } from "../store/notes";
import { useThemeStore } from "../store/theme";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { getQuadrant } from "../types/note";

/**
 * Read chart colors from the active theme's CSS custom properties.
 * SVG fill attributes don't resolve var(), so we read computed values directly.
 * Subscribing to the theme store ensures charts re-render on theme change.
 */
function useChartColors(): { colors: string[]; strokeColor: string } {
  useThemeStore((s) => s.theme); // subscribe so charts re-render on theme switch
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    colors: [
      v("--color-primary"),
      v("--color-success"),
      v("--color-error"),
      v("--color-warning"),
      v("--color-info"),
      `color-mix(in oklch, ${v("--color-primary")} 50%, ${v("--color-success")})`,
      `color-mix(in oklch, ${v("--color-error")} 50%, ${v("--color-accent")})`,
      `color-mix(in oklch, ${v("--color-warning")} 50%, ${v("--color-info")})`,
    ],
    // Use the page background as stroke so slices have clean themed gaps
    strokeColor: v("--color-base-100"),
  };
}

/** Dashboard filter type — an Eisenhower quadrant, blocked notes, or all notes */
type Filter = "urgent" | "schedule" | "delegate" | "eliminate" | "blocked" | "all";

/**
 * Filter notes by the active dashboard filter.
 * @internal
 */
function filterNotes(notes: Note[], filter: Filter): Note[] {
  switch (filter) {
    case "urgent":
      return notes.filter((n) => getQuadrant(n) === "do");
    case "schedule":
      return notes.filter((n) => getQuadrant(n) === "schedule");
    case "delegate":
      return notes.filter((n) => getQuadrant(n) === "delegate");
    case "eliminate":
      return notes.filter((n) => getQuadrant(n) === "eliminate");
    case "blocked":
      return notes.filter((n) => n.frontmatter.blocked);
    default:
      return notes;
  }
}

/**
 * Props for the summary chip component.
 */
interface ChipProps {
  /** Count to display */
  value: number;
  /** Label text */
  label: string;
  /** CSS color value (e.g. var(--color-error)) used to derive bg/border/text */
  color: string;
  /** Whether this chip is currently selected */
  active: boolean;
  /** Callback when chip is clicked */
  onClick: () => void;
}

/**
 * Summary chip — displays a count and label, used for Eisenhower quadrants.
 * Click to toggle filtering to that quadrant. Click again to clear filter.
 * @internal
 */
function SummaryChip({ value, label, color, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        color,
      }}
      className={`rounded-xl border px-4 py-3 text-left transition-all min-w-[88px] ${
        active ? "ring-2 ring-offset-1 scale-105" : "opacity-80 hover:opacity-100"
      }`}
    >
      <div className="stat-value text-2xl">{value}</div>
      <div
        className="stat-title text-xs"
        style={{ color: `color-mix(in oklab, ${color} 80%, var(--color-base-content))` }}
      >
        {label}
      </div>
    </button>
  );
}

/**
 * CSS styles for chart tooltips.
 * @internal
 */
const tooltipStyle = {
  backgroundColor: "var(--color-base-200)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  color: "var(--color-base-content)",
};

const tooltipTextStyle = { color: "var(--color-base-content)" };

/**
 * One section of the daily briefing — a colored label followed by clickable
 * note titles. Renders nothing when the section is empty.
 * @internal
 */
function BriefingSection({
  label,
  color,
  notes,
  detail,
  onNoteClick,
}: {
  label: string;
  color: string;
  notes: Note[];
  detail?: (n: Note) => string;
  onNoteClick: (n: Note) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {label} · {notes.length}
      </span>
      {notes.map((n) => (
        <button
          type="button"
          key={n.id}
          onClick={() => onNoteClick(n)}
          className="text-sm underline-offset-2 hover:underline"
        >
          {n.frontmatter.title || "Untitled"}
          {detail && <span className="ml-1 text-xs opacity-50">{detail(n)}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Daily briefing card — a rules-based digest of what needs attention:
 * overdue and upcoming deadlines, blocked work, in-flight notes, and
 * Doing notes that haven't been touched in two weeks.
 * @internal
 */
function BriefingCard({ notes, onNoteClick }: { notes: Note[]; onNoteClick: (n: Note) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const b = buildBriefing(notes, today);
  const allClear =
    b.overdue.length === 0 &&
    b.dueSoon.length === 0 &&
    b.blocked.length === 0 &&
    b.doing.length === 0 &&
    b.staleDoing.length === 0;

  return (
    <div className="card bg-base-200 mb-6" data-testid="daily-briefing">
      <div className="card-body gap-3 p-4">
        <p className="card-title text-sm">Daily Briefing</p>
        {allClear ? (
          <p className="text-sm opacity-50">All clear — nothing overdue, blocked, or in flight.</p>
        ) : (
          <>
            <BriefingSection
              label="Overdue"
              color="var(--color-error)"
              notes={b.overdue}
              detail={(n) => `(${n.frontmatter.deadline})`}
              onNoteClick={onNoteClick}
            />
            <BriefingSection
              label="Due soon"
              color="var(--color-warning)"
              notes={b.dueSoon}
              detail={(n) => `(${n.frontmatter.deadline})`}
              onNoteClick={onNoteClick}
            />
            <BriefingSection
              label="Blocked"
              color="var(--color-warning)"
              notes={b.blocked}
              onNoteClick={onNoteClick}
            />
            <BriefingSection
              label="Doing"
              color="var(--color-info)"
              notes={b.doing}
              onNoteClick={onNoteClick}
            />
            <BriefingSection
              label="Stale (14d+)"
              color="var(--color-secondary)"
              notes={b.staleDoing}
              detail={(n) => `(last touched ${n.frontmatter.updated})`}
              onNoteClick={onNoteClick}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Dashboard view component.
 * Shows summary chips, statistics charts, and a filterable note list.
 * Charts and notes are scoped to the active filter (Eisenhower quadrant or all).
 *
 * @returns The dashboard UI
 */
export function DashboardView() {
  const { colors, strokeColor } = useChartColors();
  const { notes } = useNoteStore();
  const { navigate, selectedGrouping } = useUIStore();
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [resizeKey, setResizeKey] = useState(0);

  useEffect(() => {
    const handler = () => setResizeKey((k) => k + 1);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const subset = filterNotes(notes, activeFilter).sort((a, b) =>
    b.frontmatter.updated.localeCompare(a.frontmatter.updated),
  );

  // Charts derived from the active subset
  const tagCounts: Record<string, number> = {};
  for (const note of subset) {
    for (const tag of note.frontmatter.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  const tagData = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const stateData = NOTE_STATES.map((state) => ({
    name: state,
    value: subset.filter((n) => n.frontmatter.state === state).length,
  })).filter((d) => d.value > 0);

  // Team distribution (each member counted once per note)
  const teamCounts: Record<string, number> = {};
  for (const note of subset) {
    for (const member of note.frontmatter.team ?? []) {
      teamCounts[member] = (teamCounts[member] ?? 0) + 1;
    }
  }
  const teamData = Object.entries(teamCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  // Same color assignment as the chart (index into colors by stateData order)
  const stateColorMap = Object.fromEntries(
    stateData.map((d, i) => [d.name, colors[i % colors.length]]),
  );

  function handleChipClick(filter: Filter) {
    setActiveFilter((prev) => (prev === filter ? "all" : filter));
  }

  function handleNoteClick(note: Note) {
    navigate({ view: "notes", selectedNoteId: note.id, selectedGrouping });
  }

  const filterLabel: Record<Filter, string> = {
    urgent: "Do",
    schedule: "Schedule",
    delegate: "Delegate",
    eliminate: "Eliminate",
    blocked: "Blocked",
    all: "All Notes",
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="mb-2 text-xl font-bold">Dashboard</h2>
      <p className="mb-6 text-sm opacity-50">{notes.length} notes in vault</p>

      <BriefingCard notes={notes} onNoteClick={handleNoteClick} />

      {/* Summary chips */}
      <div className="mb-8 flex flex-wrap gap-3">
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "do").length}
          label="Do"
          color="var(--color-error)"
          active={activeFilter === "urgent"}
          onClick={() => handleChipClick("urgent")}
        />
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "schedule").length}
          label="Schedule"
          color="var(--color-info)"
          active={activeFilter === "schedule"}
          onClick={() => handleChipClick("schedule")}
        />
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "delegate").length}
          label="Delegate"
          color="var(--color-secondary)"
          active={activeFilter === "delegate"}
          onClick={() => handleChipClick("delegate")}
        />
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "eliminate").length}
          label="Eliminate"
          color="var(--color-accent)"
          active={activeFilter === "eliminate"}
          onClick={() => handleChipClick("eliminate")}
        />
        <SummaryChip
          value={notes.filter((n) => n.frontmatter.blocked).length}
          label="Blocked"
          color="var(--color-warning)"
          active={activeFilter === "blocked"}
          onClick={() => handleChipClick("blocked")}
        />
        <SummaryChip
          value={notes.length}
          label="Total Notes"
          color="var(--color-base-content)"
          active={activeFilter === "all"}
          onClick={() => handleChipClick("all")}
        />
      </div>

      {/* Charts — scoped to subset */}
      {subset.length > 0 ? (
        <div className={`grid gap-6 mb-6 ${teamData.length > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
          <div className="card bg-base-200">
            <div className="card-body p-4">
              <p className="card-title text-sm">Tag Distribution</p>
              {tagData.length > 0 ? (
                <ResponsiveContainer key={resizeKey} width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={tagData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      paddingAngle={2}
                      stroke={strokeColor}
                      strokeWidth={2}
                    >
                      {tagData.map((entry, i) => (
                        <Cell key={entry.name} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle as React.CSSProperties}
                      itemStyle={tooltipTextStyle}
                      labelStyle={tooltipTextStyle}
                    />
                    <Legend
                      formatter={(v) => (
                        <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                          {v}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm opacity-50">No tags in selection</p>
              )}
            </div>
          </div>

          <div className="card bg-base-200">
            <div className="card-body p-4">
              <p className="card-title text-sm">State Distribution</p>
              <ResponsiveContainer key={resizeKey} width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stateData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                    stroke={strokeColor}
                    strokeWidth={2}
                  >
                    {stateData.map((entry, i) => (
                      <Cell key={entry.name} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle as React.CSSProperties}
                    itemStyle={tooltipTextStyle}
                    labelStyle={tooltipTextStyle}
                  />
                  <Legend
                    formatter={(v) => (
                      <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                        {v}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {teamData.length > 0 && (
            <div className="card bg-base-200">
              <div className="card-body p-4">
                <p className="card-title text-sm">Team Distribution</p>
                <ResponsiveContainer key={resizeKey} width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={teamData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      paddingAngle={2}
                      stroke={strokeColor}
                      strokeWidth={2}
                    >
                      {teamData.map((entry, i) => (
                        <Cell key={entry.name} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle as React.CSSProperties}
                      itemStyle={tooltipTextStyle}
                      labelStyle={tooltipTextStyle}
                    />
                    <Legend
                      formatter={(v) => (
                        <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                          {v}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card bg-base-200 mb-6">
          <div className="card-body items-center justify-center py-12">
            <p className="opacity-50">No notes match this filter.</p>
          </div>
        </div>
      )}

      {/* Note list for active filter */}
      <div className="card bg-base-200" data-testid="note-list">
        <div className="card-body p-0">
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <p className="font-semibold">{filterLabel[activeFilter]}</p>
            <span className="text-xs opacity-50">{subset.length} notes</span>
          </div>
          {subset.length === 0 ? (
            <p className="px-4 py-6 text-sm opacity-50">No notes in this category.</p>
          ) : (
            <div className="divide-y divide-base-300">
              {subset.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  onClick={() => handleNoteClick(note)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-base-300/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {note.frontmatter.title || "Untitled"}
                    </p>
                    {note.frontmatter.tags.length > 0 && (
                      <p className="mt-0.5 truncate text-xs opacity-50">
                        {note.frontmatter.tags.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* An unmanaged note has a cleared state — no badge, rather
                        than an empty pill */}
                    {note.frontmatter.state && (
                      <span
                        data-testid="state-badge"
                        className="badge badge-sm"
                        style={{
                          backgroundColor: `${stateColorMap[note.frontmatter.state] ?? "#6e6e73"}22`,
                          color: stateColorMap[note.frontmatter.state] ?? "#6e6e73",
                          borderColor: "transparent",
                        }}
                      >
                        {note.frontmatter.state}
                      </span>
                    )}
                    {note.frontmatter.urgent && (
                      <span className="badge badge-error badge-soft badge-sm">urgent</span>
                    )}
                    {note.frontmatter.blocked && (
                      <span className="badge badge-warning badge-soft badge-sm">blocked</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
