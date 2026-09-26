import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMermaid = vi.fn();
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: (...a: unknown[]) => renderMermaid(...a),
}));

import { useThemeStore } from "../../store/theme";
import { MermaidPreview } from "./MermaidPreview";

async function flush(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe("MermaidPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useThemeStore.getState().setTheme("light");
    renderMermaid.mockReset();
    renderMermaid.mockResolvedValue("<svg data-testid='diagram'></svg>");
  });

  it("renders nothing for an empty source", () => {
    const { container } = render(<MermaidPreview source="   " onActivate={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it("renders the first diagram without waiting for the edit debounce", async () => {
    render(<MermaidPreview source="graph TD; A-->B" onActivate={() => {}} />);
    expect(screen.getByText("Rendering diagram…")).toBeInTheDocument();
    await flush();
    expect(renderMermaid).toHaveBeenCalledWith(
      "graph TD; A-->B",
      expect.objectContaining({ id: "light" }),
    );
    expect(screen.getByTestId("diagram")).toBeInTheDocument();
  });

  it("exposes the diagram as a labelled image", async () => {
    render(<MermaidPreview source="sequenceDiagram\n A->>B: hi" onActivate={() => {}} />);
    await flush();
    expect(screen.getByRole("img", { name: "Sequence diagram" })).toContainElement(
      screen.getByTestId("diagram"),
    );
  });

  it("coalesces rapid edits after the first render into one render", async () => {
    const { rerender } = render(<MermaidPreview source="a" onActivate={() => {}} />);
    await flush();
    renderMermaid.mockClear();
    rerender(<MermaidPreview source="ab" onActivate={() => {}} />);
    rerender(<MermaidPreview source="abc" onActivate={() => {}} />);
    await flush(299);
    expect(renderMermaid).not.toHaveBeenCalled();
    await flush(1);
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(renderMermaid).toHaveBeenCalledWith("abc", expect.anything());
  });

  it("re-renders with the new colours when the theme changes", async () => {
    render(<MermaidPreview source="graph TD; A-->B" onActivate={() => {}} />);
    await flush();
    act(() => useThemeStore.getState().setTheme("dark"));
    await flush(300);
    expect(renderMermaid).toHaveBeenLastCalledWith(
      "graph TD; A-->B",
      expect.objectContaining({ id: "dark" }),
    );
  });

  it("shows a readable error instead of crashing", async () => {
    renderMermaid.mockRejectedValueOnce(new Error("Parse error on line 2"));
    render(<MermaidPreview source="graph TD; A-->" onActivate={() => {}} />);
    await flush();
    expect(screen.getByText("Couldn't render this diagram")).toBeInTheDocument();
    expect(screen.getByText("Parse error on line 2")).toBeInTheDocument();
    expect(screen.queryByText("Rendering diagram…")).not.toBeInTheDocument();
  });

  it("calls onActivate when the diagram is clicked", async () => {
    const onActivate = vi.fn();
    render(<MermaidPreview source="graph TD; A-->B" onActivate={onActivate} />);
    await flush();
    fireEvent.click(screen.getByRole("img"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
