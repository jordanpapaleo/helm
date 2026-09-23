import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMermaid = vi.fn();
vi.mock("../../lib/mermaid", () => ({ renderMermaid: (...a: unknown[]) => renderMermaid(...a) }));

import { MermaidPreview } from "./MermaidPreview";

describe("MermaidPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renderMermaid.mockReset();
    renderMermaid.mockResolvedValue("<svg data-testid='diagram'></svg>");
  });

  it("renders nothing for an empty source", () => {
    const { container } = render(<MermaidPreview source="   " onActivate={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it("renders the svg after the debounce", async () => {
    render(<MermaidPreview source="graph TD; A-->B" onActivate={() => {}} />);
    expect(screen.getByText("Rendering diagram…")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(renderMermaid).toHaveBeenCalledWith(
      "graph TD; A-->B",
      expect.stringMatching(/light|dark/),
    );
    expect(screen.getByTestId("diagram")).toBeInTheDocument();
  });

  it("coalesces rapid edits into one render", async () => {
    const { rerender } = render(<MermaidPreview source="a" onActivate={() => {}} />);
    rerender(<MermaidPreview source="ab" onActivate={() => {}} />);
    rerender(<MermaidPreview source="abc" onActivate={() => {}} />);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(renderMermaid).toHaveBeenCalledWith("abc", expect.anything());
  });

  it("shows the parse error instead of crashing", async () => {
    renderMermaid.mockRejectedValueOnce(new Error("Parse error on line 2"));
    render(<MermaidPreview source="graph TD; A-->" onActivate={() => {}} />);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(screen.getByText("Parse error on line 2")).toBeInTheDocument();
  });

  it("calls onActivate when clicked", () => {
    const onActivate = vi.fn();
    render(<MermaidPreview source="graph TD; A-->B" onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
