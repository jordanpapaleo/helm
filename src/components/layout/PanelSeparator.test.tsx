import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PanelSeparator } from "./PanelSeparator";

it("supports keyboard resizing, reversed on the right and clamped to bounds", () => {
  const onCommit = vi.fn();
  const { rerender } = render(
    <PanelSeparator panel="right" width={320} max={600} onPreview={vi.fn()} onCommit={onCommit} />,
  );
  fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
  expect(onCommit).toHaveBeenLastCalledWith(310);
  rerender(
    <PanelSeparator
      panel="navigation"
      width={180}
      max={360}
      onPreview={vi.fn()}
      onCommit={onCommit}
    />,
  );
  fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
  expect(onCommit).toHaveBeenLastCalledWith(180);
});
it("captures pointers, previews without committing, and restores body styles on cancel and unmount", () => {
  const onCommit = vi.fn();
  const onPreview = vi.fn();
  const { unmount } = render(
    <PanelSeparator
      panel="navigation"
      width={220}
      max={360}
      onPreview={onPreview}
      onCommit={onCommit}
    />,
  );
  const separator = screen.getByRole("separator");
  separator.setPointerCapture = vi.fn();
  separator.releasePointerCapture = vi.fn();
  vi.stubGlobal("PointerEvent", MouseEvent);
  fireEvent.pointerDown(separator, { button: 0, clientX: 220, pointerId: 1 });
  fireEvent.pointerMove(separator, { clientX: 250, pointerId: 1 });
  expect(onPreview).toHaveBeenLastCalledWith(250);
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.pointerCancel(separator);
  expect(document.body.style.userSelect).toBe("");
  fireEvent.pointerDown(separator, { button: 0, clientX: 220, pointerId: 1 });
  unmount();
  expect(document.body.style.cursor).toBe("");
  vi.unstubAllGlobals();
});
