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
});
