import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../types/note";

const renderMermaid = vi.fn();
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: (...a: unknown[]) => renderMermaid(...a),
}));

import { useThemeStore } from "../../store/theme";
import { NotePrintView } from "./NotePrintView";

function makeNote(content: string, title = "Printable"): Note {
  return {
    id: "01JPRINT",
    filePath: "/vault/printable.md",
    fileName: "printable.md",
    vaultId: "v1",
    content,
    frontmatter: {
      id: "01JPRINT",
      title,
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const printRoot = () => document.body.querySelector<HTMLElement>(".print-root");

describe("NotePrintView", () => {
  beforeEach(() => {
    renderMermaid.mockReset();
    useThemeStore.getState().setTheme("light");
  });

  it("renders the title and the note body read-only into a print-only root", async () => {
    const onReady = vi.fn();
    render(<NotePrintView note={makeNote("Hello **world**")} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const root = printRoot();
    expect(root?.parentElement).toBe(document.body);
    expect(root?.querySelector("h1")?.textContent).toBe("Printable");
    expect(root?.querySelector("strong")?.textContent).toBe("world");
    expect(root?.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
  });

  it("waits for every diagram before reporting ready", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    renderMermaid.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onReady = vi.fn();
    const md = "```mermaid\ngraph TD; A-->B\n```\n\n```mermaid\nsequenceDiagram\n A->>B: hi\n```";
    render(<NotePrintView note={makeNote(md)} onReady={onReady} />);

    await waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve("<svg data-testid='one'></svg>"));
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => second.resolve("<svg data-testid='two'></svg>"));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(printRoot()?.querySelectorAll("svg")).toHaveLength(2);
  });

  it("still reports ready when a diagram fails, printing its error", async () => {
    renderMermaid.mockRejectedValueOnce(new Error("Parse error on line 1"));
    const onReady = vi.fn();
    render(<NotePrintView note={makeNote("```mermaid\ngraph TD; A-->\n```")} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(printRoot()?.textContent).toContain("Parse error on line 1");
  });

  it("prints a dark theme on the light palette, diagrams included", async () => {
    useThemeStore.getState().setTheme("dracula");
    renderMermaid.mockResolvedValue("<svg></svg>");
    const onReady = vi.fn();
    render(<NotePrintView note={makeNote("```mermaid\ngraph TD; A-->B\n```")} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(printRoot()?.dataset.theme).toBe("light");
    expect(renderMermaid).toHaveBeenCalledWith(
      "graph TD; A-->B",
      expect.objectContaining({ id: "light" }),
    );
  });

  it("keeps the current theme when it is already light", async () => {
    useThemeStore.getState().setTheme("garden");
    const onReady = vi.fn();
    render(<NotePrintView note={makeNote("x")} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(printRoot()?.dataset.theme).toBe("garden");
  });

  it("removes the print root on unmount", async () => {
    const onReady = vi.fn();
    const { unmount } = render(<NotePrintView note={makeNote("x")} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    unmount();
    expect(printRoot()).toBeNull();
  });
});
