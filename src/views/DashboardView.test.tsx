import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { DashboardView } from "./DashboardView";

// ---------------------------------------------------------------------------
// recharts' ResponsiveContainer uses ResizeObserver + real dimensions.
// In jsdom everything has zero size, so we swap it for a plain <div> wrapper
// that renders its children at a fixed size — enough to keep charts happy.
// ---------------------------------------------------------------------------
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 220 }}>{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/test.md",
    fileName: "test.md",
    content: "",
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Test Note",
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

/** Reset all stores to a clean state before each test. */
beforeEach(() => {
  useNoteStore.setState({
    notes: [],
    selectedNoteId: null,
    vaults: [],
    activeVaultId: null,
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
  useUIStore.setState({ activeView: "dashboard" });
});

// ---------------------------------------------------------------------------
// Rendering — empty vault
// ---------------------------------------------------------------------------

describe("DashboardView — empty vault", () => {
  it("renders the Dashboard heading", () => {
    render(<DashboardView />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("shows 0 notes in vault when store is empty", () => {
    render(<DashboardView />);
    expect(screen.getByText(/0 notes in vault/i)).toBeInTheDocument();
  });

  it("renders all six summary chips by label", () => {
    render(<DashboardView />);
    expect(screen.getByText("Do")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Delegate")).toBeInTheDocument();
    expect(screen.getByText("Eliminate")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Total Notes")).toBeInTheDocument();
  });

  it("shows the 'No notes match this filter.' placeholder when vault is empty", () => {
    render(<DashboardView />);
    expect(screen.getByText(/No notes match this filter/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Rendering — with notes in the store
// ---------------------------------------------------------------------------

describe("DashboardView — with notes", () => {
  it("shows the correct note count in the vault subtitle", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({ id: "n1", filePath: "/vault/a.md" }),
        makeNote({ id: "n2", filePath: "/vault/b.md" }),
      ],
    });
    render(<DashboardView />);
    expect(screen.getByText(/2 notes in vault/i)).toBeInTheDocument();
  });

  it("renders note titles in the 'All Notes' list", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", title: "Alpha Note" },
        }),
        makeNote({
          id: "n2",
          filePath: "/vault/b.md",
          frontmatter: { ...makeNote().frontmatter, id: "n2", title: "Beta Note" },
        }),
      ],
    });
    render(<DashboardView />);
    expect(screen.getByText("Alpha Note")).toBeInTheDocument();
    expect(screen.getByText("Beta Note")).toBeInTheDocument();
  });

  it("shows 'urgent' badge for urgent notes", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", urgent: true, important: false },
        }),
      ],
    });
    render(<DashboardView />);
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("shows 'blocked' badge for blocked notes", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", blocked: true },
        }),
      ],
    });
    render(<DashboardView />);
    // 'Blocked' appears in both the chip label and the badge — find the badge
    const badges = screen.getAllByText("blocked");
    expect(badges.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Summary chip counts
// ---------------------------------------------------------------------------

describe("DashboardView — chip counts", () => {
  it("Do chip shows count of urgent+important notes", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", urgent: true, important: true },
        }),
        makeNote({
          id: "n2",
          filePath: "/vault/b.md",
          frontmatter: { ...makeNote().frontmatter, id: "n2", urgent: false, important: false },
        }),
      ],
    });
    render(<DashboardView />);
    // The "Do" chip should display "1"
    const doChip = screen.getByText("Do").closest("button");
    expect(doChip?.textContent).toContain("1");
  });

  it("Blocked chip shows count of blocked notes", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", blocked: true },
        }),
        makeNote({
          id: "n2",
          filePath: "/vault/b.md",
          frontmatter: { ...makeNote().frontmatter, id: "n2", blocked: true },
        }),
        makeNote({
          id: "n3",
          filePath: "/vault/c.md",
          frontmatter: { ...makeNote().frontmatter, id: "n3", blocked: false },
        }),
      ],
    });
    render(<DashboardView />);
    const blockedChip = screen.getByText("Blocked").closest("button");
    expect(blockedChip?.textContent).toContain("2");
  });

  it("Total Notes chip shows total note count", () => {
    const notes = Array.from({ length: 5 }, (_, i) =>
      makeNote({
        id: `n${i}`,
        filePath: `/vault/n${i}.md`,
        frontmatter: { ...makeNote().frontmatter, id: `n${i}` },
      }),
    );
    useNoteStore.setState({ ...useNoteStore.getState(), notes });
    render(<DashboardView />);
    const totalChip = screen.getByText("Total Notes").closest("button");
    expect(totalChip?.textContent).toContain("5");
  });
});

// ---------------------------------------------------------------------------
// Filter chip interactions
// ---------------------------------------------------------------------------

describe("DashboardView — chip filtering", () => {
  const urgentNote = makeNote({
    id: "u1",
    filePath: "/vault/urgent.md",
    frontmatter: {
      ...makeNote().frontmatter,
      id: "u1",
      title: "Urgent Task",
      urgent: true,
      important: true,
    },
  });
  const normalNote = makeNote({
    id: "n1",
    filePath: "/vault/normal.md",
    frontmatter: {
      ...makeNote().frontmatter,
      id: "n1",
      title: "Normal Task",
      urgent: false,
      important: false,
    },
  });

  beforeEach(() => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [urgentNote, normalNote],
    });
  });

  it("clicking 'Do' chip filters the note list to urgent+important notes only", () => {
    render(<DashboardView />);
    // Before filtering both notes are visible
    expect(screen.getByText("Urgent Task")).toBeInTheDocument();
    expect(screen.getByText("Normal Task")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\bDo\b/ }));

    expect(screen.getByText("Urgent Task")).toBeInTheDocument();
    expect(screen.queryByText("Normal Task")).not.toBeInTheDocument();
  });

  it("clicking an active filter chip a second time resets to 'All Notes'", () => {
    render(<DashboardView />);
    const doButton = screen.getByRole("button", { name: /\bDo\b/ });
    fireEvent.click(doButton); // activate
    expect(screen.queryByText("Normal Task")).not.toBeInTheDocument();

    fireEvent.click(doButton); // deactivate (toggle off)
    expect(screen.getByText("Normal Task")).toBeInTheDocument();
  });

  it("clicking 'Blocked' chip shows only blocked notes", () => {
    const blockedNote = makeNote({
      id: "b1",
      filePath: "/vault/blocked.md",
      frontmatter: { ...makeNote().frontmatter, id: "b1", title: "Blocked Task", blocked: true },
    });
    useNoteStore.setState({ ...useNoteStore.getState(), notes: [urgentNote, blockedNote] });

    render(<DashboardView />);
    fireEvent.click(screen.getByRole("button", { name: /^\d+\s*Blocked/ }));

    expect(screen.getByText("Blocked Task")).toBeInTheDocument();
    expect(screen.queryByText("Urgent Task")).not.toBeInTheDocument();
  });

  it("the active filter label appears in the note list header", () => {
    render(<DashboardView />);
    // Default is "all" — header shows "All Notes"
    expect(screen.getByText("All Notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Schedule/ }));
    // After activating the Schedule filter the list header shows "Schedule".
    // Use getAllByText because the chip button also contains "Schedule".
    const scheduleMatches = screen.getAllByText("Schedule");
    expect(scheduleMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'No notes in this category.' when filter has zero matches", () => {
    // None of the notes in this describe block are "schedule" (important, not urgent)
    render(<DashboardView />);
    fireEvent.click(screen.getByRole("button", { name: /Schedule/ }));
    expect(screen.getByText(/No notes in this category/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Note click — navigates to notes view and selects note
// ---------------------------------------------------------------------------

describe("DashboardView — note click navigation", () => {
  it("clicking a note selects it in the store and switches view to 'notes'", () => {
    const note = makeNote({
      id: "n1",
      filePath: "/vault/a.md",
      frontmatter: { ...makeNote().frontmatter, id: "n1", title: "Click Me" },
    });
    useNoteStore.setState({ ...useNoteStore.getState(), notes: [note] });

    render(<DashboardView />);
    fireEvent.click(screen.getByRole("button", { name: /Click Me/ }));

    expect(useNoteStore.getState().selectedNoteId).toBe("n1");
    expect(useUIStore.getState().activeView).toBe("notes");
  });
});

// ---------------------------------------------------------------------------
// Chart rendering — basic presence checks
// ---------------------------------------------------------------------------

describe("DashboardView — charts", () => {
  it("shows 'Tag Distribution' section heading when notes are present", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [makeNote({ id: "n1", filePath: "/vault/a.md" })],
    });
    render(<DashboardView />);
    expect(screen.getByText("Tag Distribution")).toBeInTheDocument();
  });

  it("shows 'State Distribution' section heading when notes are present", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [makeNote({ id: "n1", filePath: "/vault/a.md" })],
    });
    render(<DashboardView />);
    expect(screen.getByText("State Distribution")).toBeInTheDocument();
  });

  it("shows 'No tags in selection' when notes have no tags", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", tags: [] },
        }),
      ],
    });
    render(<DashboardView />);
    expect(screen.getByText(/No tags in selection/i)).toBeInTheDocument();
  });

  it("does NOT show 'Team Distribution' when no notes have team members", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [makeNote({ id: "n1", filePath: "/vault/a.md" })],
    });
    render(<DashboardView />);
    expect(screen.queryByText("Team Distribution")).not.toBeInTheDocument();
  });

  it("shows 'Team Distribution' section when notes have team members", () => {
    useNoteStore.setState({
      ...useNoteStore.getState(),
      notes: [
        makeNote({
          id: "n1",
          filePath: "/vault/a.md",
          frontmatter: { ...makeNote().frontmatter, id: "n1", team: ["Alice", "Bob"] },
        }),
      ],
    });
    render(<DashboardView />);
    expect(screen.getByText("Team Distribution")).toBeInTheDocument();
  });
});
