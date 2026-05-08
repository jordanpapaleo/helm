/**
 * Dashboard view — overview and statistics for notes.
 * Displays summary chips for Eisenhower quadrants, tag/state/team distribution
 * charts, and a filterable note list. Clicking a chip filters all content to that subset.
 */
import { useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { NOTE_STATES } from "../lib/constants";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { getQuadrant } from "../types/note";

const CHART_COLORS = [
  "#0a84ff",
  "#30d158",
  "#ff453a",
  "#ff9f0a",
  "#bf5af2",
  "#64d2ff",
  "#ffd60a",
  "#ff6961",
];

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
  /** CSS classes for background/border/text color */
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
      className={`rounded-xl border px-4 py-3 text-left transition-all min-w-[88px] ${color} ${
        active ? "ring-2 ring-white/30 scale-105" : "opacity-80 hover:opacity-100"
      }`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </button>
  );
}

/**
 * CSS styles for chart tooltips.
 * @internal
 */
const tooltipStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  color: "var(--color-text)",
};

/**
 * Dashboard view component.
 * Shows summary chips, statistics charts, and a filterable note list.
 * Charts and notes are scoped to the active filter (Eisenhower quadrant or all).
 *
 * @returns The dashboard UI
 */
export function DashboardView() {
  const { notes, selectNote } = useNoteStore();
  const { setView } = useUIStore();
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const subset = filterNotes(notes, activeFilter);

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

  // Same color assignment as the chart (index into CHART_COLORS by stateData order)
  const stateColorMap = Object.fromEntries(
    stateData.map((d, i) => [d.name, CHART_COLORS[i % CHART_COLORS.length]]),
  );

  function handleChipClick(filter: Filter) {
    setActiveFilter((prev) => (prev === filter ? "all" : filter));
  }

  function handleNoteClick(note: Note) {
    selectNote(note.id);
    setView("notes");
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
      <h2 className="mb-2 text-xl font-bold text-[var(--color-text)]">Dashboard</h2>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">{notes.length} notes in vault</p>

      {/* Summary chips */}
      <div className="mb-8 flex flex-wrap gap-3">
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "do").length}
          label="Do"
          color="border-red-500/20 bg-red-500/10 text-red-400"
          active={activeFilter === "urgent"}
          onClick={() => handleChipClick("urgent")}
        />
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "schedule").length}
          label="Schedule"
          color="border-blue-500/20 bg-blue-500/10 text-blue-400"
          active={activeFilter === "schedule"}
          onClick={() => handleChipClick("schedule")}
        />
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "delegate").length}
          label="Delegate"
          color="border-orange-500/20 bg-orange-500/10 text-orange-400"
          active={activeFilter === "delegate"}
          onClick={() => handleChipClick("delegate")}
        />
        <SummaryChip
          value={notes.filter((n) => getQuadrant(n) === "eliminate").length}
          label="Eliminate"
          color="border-purple-500/20 bg-purple-500/10 text-purple-400"
          active={activeFilter === "eliminate"}
          onClick={() => handleChipClick("eliminate")}
        />
        <SummaryChip
          value={notes.filter((n) => n.frontmatter.blocked).length}
          label="Blocked"
          color="border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
          active={activeFilter === "blocked"}
          onClick={() => handleChipClick("blocked")}
        />
        <SummaryChip
          value={notes.length}
          label="Total Notes"
          color="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
          active={activeFilter === "all"}
          onClick={() => handleChipClick("all")}
        />
      </div>

      {/* Charts — scoped to subset */}
      {subset.length > 0 ? (
        <div className={`grid gap-6 mb-6 ${teamData.length > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="mb-4 font-semibold text-[var(--color-text)]">Tag Distribution</p>
            {tagData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={tagData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {tagData.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle as React.CSSProperties} />
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
              <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                No tags in selection
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="mb-4 font-semibold text-[var(--color-text)]">State Distribution</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stateData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {stateData.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle as React.CSSProperties} />
                <Legend
                  formatter={(v) => (
                    <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>{v}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {teamData.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="mb-4 font-semibold text-[var(--color-text)]">Team Distribution</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={teamData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {teamData.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle as React.CSSProperties} />
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
          )}
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12">
          <p className="text-[var(--color-text-muted)]">No notes match this filter.</p>
        </div>
      )}

      {/* Note list for active filter */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <p className="font-semibold text-[var(--color-text)]">{filterLabel[activeFilter]}</p>
          <span className="text-xs text-[var(--color-text-muted)]">{subset.length} notes</span>
        </div>
        {subset.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--color-text-muted)]">
            No notes in this category.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {subset.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => handleNoteClick(note)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-[var(--color-border)]/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {note.frontmatter.title || "Untitled"}
                  </p>
                  {note.frontmatter.tags.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                      {note.frontmatter.tags.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <span
                    className="rounded px-1.5 py-0.5"
                    style={{
                      backgroundColor: `${stateColorMap[note.frontmatter.state] ?? "#6e6e73"}22`,
                      color: stateColorMap[note.frontmatter.state] ?? "#6e6e73",
                    }}
                  >
                    {note.frontmatter.state}
                  </span>
                  {note.frontmatter.urgent && (
                    <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-400">urgent</span>
                  )}
                  {note.frontmatter.blocked && (
                    <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400">
                      blocked
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
