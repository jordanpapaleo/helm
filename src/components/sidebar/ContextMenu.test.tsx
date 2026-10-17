import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu keyboard", () => {
  it("moves through a New Note submenu with the arrow keys", () => {
    const onBlank = vi.fn();
    const onTemplate = vi.fn();
    const onClose = vi.fn();

    render(
      <ContextMenu
        x={10}
        y={10}
        onClose={onClose}
        items={[
          { kind: "action", label: "Open", onClick: vi.fn() },
          {
            kind: "submenu",
            label: "New Note Here",
            items: [
              { label: "Blank", onClick: onBlank },
              { label: "Bug report", onClick: onTemplate },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "Open" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    const submenuTrigger = screen.getByRole("menuitem", { name: "New Note Here" });
    expect(submenuTrigger).toHaveFocus();

    fireEvent.keyDown(submenuTrigger, { key: "ArrowRight" });
    expect(screen.getByRole("menuitem", { name: "Blank" })).toHaveFocus();

    const submenu = screen.getByRole("menu", { name: "New Note Here" });
    fireEvent.keyDown(submenu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Bug report" })).toHaveFocus();

    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));
    expect(onTemplate).toHaveBeenCalledTimes(1);
    expect(onBlank).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("scrolls a tall submenu and keeps it inside a short viewport", () => {
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 220 });
    const rect = {
      x: 8,
      y: 180,
      top: 180,
      left: 8,
      right: 180,
      bottom: 204,
      width: 172,
      height: 24,
      toJSON: () => ({}),
    };
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);

    render(
      <ContextMenu
        x={8}
        y={180}
        onClose={vi.fn()}
        items={[
          {
            kind: "submenu",
            label: "New Note Here",
            items: [
              { label: "Blank", onClick: vi.fn() },
              ...Array.from({ length: 12 }, (_, index) => ({
                label: `Template ${index + 1}`,
                onClick: vi.fn(),
              })),
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "New Note Here" }));
    const submenu = screen.getByRole("menu", { name: "New Note Here" });
    expect(submenu.className).toContain("overflow-y-auto");
    expect(submenu.className).toContain("bottom-0");
    expect(submenu.style.maxHeight).toBe("200px");
    expect(screen.getByRole("menuitem", { name: "Template 12" })).toBeInTheDocument();

    spy.mockRestore();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: previousHeight });
  });

  it("caps a submenu at the same height as the New Note menu when the viewport is tall", () => {
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 8,
      y: 10,
      top: 10,
      left: 8,
      right: 180,
      bottom: 34,
      width: 172,
      height: 24,
      toJSON: () => ({}),
    });

    render(
      <ContextMenu
        x={8}
        y={10}
        onClose={vi.fn()}
        items={[
          {
            kind: "submenu",
            label: "New Note Here",
            items: [{ label: "Blank", onClick: vi.fn() }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "New Note Here" }));
    const submenu = screen.getByRole("menu", { name: "New Note Here" });
    expect(submenu.className).toContain("overflow-y-auto");
    expect(submenu.className).toContain("top-0");
    expect(submenu.style.maxHeight).toBe("320px");

    spy.mockRestore();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: previousHeight });
  });
});
