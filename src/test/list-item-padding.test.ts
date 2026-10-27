import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { makeEditor } from "./editor-harness";

/**
 * Checklist rows and the lines under them used to sit on top of each other:
 * bullet and numbered items had no bottom padding, and task rows only had
 * 0.1rem. The gap is `--spacing-list-item` on every row except the last,
 * which would otherwise stack on the list's own block padding.
 *
 * jsdom does not resolve custom properties, so computed padding is asserted
 * as the variable token (or 0px on the last row). The stylesheet is the one
 * the app ships.
 */

const css = readFileSync(`${process.cwd()}/src/styles/globals.css`, "utf8");

function customProp(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([\\d.]+)em;`));
  if (!match) throw new Error(`missing ${name}`);
  return match[1];
}

function section(start: string, end: string): string {
  const from = css.indexOf(start);
  const to = css.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing CSS section "${start}"`);
  return css.slice(from, to);
}

beforeAll(() => {
  const style = document.createElement("style");
  style.setAttribute("data-testid", "list-item-padding");
  style.textContent = [
    ":root {",
    `  --spacing-block: ${customProp("--spacing-block")}em;`,
    `  --spacing-list-item: ${customProp("--spacing-list-item")}em;`,
    "}",
    section(
      "/* ── List item spacing — match paragraph rhythm",
      "/* reset browser default p margins inside task items */",
    ),
    section(
      "/* nested task lists — no extra block padding; the parent row supplies the gap */",
      "/* ── Wiki links",
    ),
  ].join("\n");
  document.head.append(style);
});

function paddingBottom(el: Element): string {
  const value = getComputedStyle(el).paddingBottom;
  if (!value) {
    throw new Error(`no padding-bottom computed for <${el.tagName.toLowerCase()}>`);
  }
  return value;
}

function mount(markdown: string) {
  const editor = makeEditor(markdown);
  const dom = editor.view.dom as HTMLElement;
  dom.classList.add("prose");
  dom.style.fontSize = "16px";
  document.body.append(dom);
  return { editor, dom };
}

describe("list item bottom padding", () => {
  it("declares a list-row gap that is wider than the old tight checklist", () => {
    const row = Number(customProp("--spacing-list-item"));
    const block = Number(customProp("--spacing-block"));
    // 0.1rem at 16px is 0.1em. The row gap has to clear that, and stay
    // tighter than the paragraph rhythm so a list still reads as a list.
    expect(row).toBeGreaterThan(0.25);
    expect(row).toBeLessThan(block);
    expect(css).toMatch(
      /\.prose :where\(li\) \{[^}]*padding-bottom:\s*var\(--spacing-list-item\)\s*!important/,
    );
    expect(css).toMatch(/\.prose :where\(li:last-child\) \{[^}]*padding-bottom:\s*0\s*!important/);
    expect(css).not.toMatch(/padding:\s*0\.1rem\s+0\s*!important/);
  });

  it("gives bullet and numbered rows the same gap under each item", () => {
    const { editor, dom } = mount(
      ["- Action", "- Investigate", "- Document questions", "", "1. First", "2. Second"].join("\n"),
    );

    const bullets = [...dom.querySelectorAll("ul > li")];
    const numbers = [...dom.querySelectorAll("ol > li")];
    expect(bullets.length).toBe(3);
    expect(numbers.length).toBe(2);

    const rowGap = paddingBottom(bullets[0]);
    expect(rowGap).toBe("var(--spacing-list-item)");
    expect(paddingBottom(bullets[1])).toBe(rowGap);
    expect(paddingBottom(numbers[0])).toBe(rowGap);
    // The last row leaves the trailing rhythm to the list itself.
    expect(paddingBottom(bullets[2])).toBe("0px");
    expect(paddingBottom(numbers[1])).toBe("0px");
    expect(paddingBottom(dom.querySelector("ul") as Element)).toBe("var(--spacing-block)");

    editor.destroy();
  });

  it("spaces checklist rows the same way, including the line under the list", () => {
    const { editor, dom } = mount(
      ["- [ ] Action", "- [ ] Investigate", "- [ ] Document questions"].join("\n"),
    );

    const list = dom.querySelector('ul[data-type="taskList"]') as HTMLElement;
    const items = [...list.querySelectorAll(":scope > li")];
    expect(items.length).toBe(3);

    expect(paddingBottom(items[0])).toBe("var(--spacing-list-item)");
    expect(paddingBottom(items[1])).toBe("var(--spacing-list-item)");
    expect(paddingBottom(items[2])).toBe("0px");
    // The checklist keeps the same trailing block padding as other lists,
    // so the last row is not flush with the line under it.
    expect(paddingBottom(list)).toBe("var(--spacing-block)");

    editor.destroy();
  });

  it("does not stack a nested list's padding on the parent row", () => {
    const { editor, dom } = mount(
      ["- parent", "  - nested a", "  - nested b", "- next"].join("\n"),
    );

    const top = [...dom.querySelectorAll(":scope > ul > li")];
    expect(top.length).toBe(2);
    const nested = top[0].querySelector(":scope > ul") as HTMLElement;
    const nestedItems = [...nested.querySelectorAll(":scope > li")];
    expect(nestedItems.length).toBe(2);

    expect(paddingBottom(nestedItems[0])).toBe("var(--spacing-list-item)");
    // Last nested row and the nested list itself add nothing; the parent row's
    // padding is the only gap before the following sibling.
    expect(paddingBottom(nestedItems[1])).toBe("0px");
    expect(paddingBottom(nested)).toBe("0px");
    expect(paddingBottom(top[0])).toBe("var(--spacing-list-item)");

    editor.destroy();
  });

  it("does not stack a checklist nested in an ordinary list item", () => {
    const { editor, dom } = mount(
      ["- parent", "  - [ ] nested a", "  - [ ] nested b", "- next"].join("\n"),
    );

    const top = [...dom.querySelectorAll(":scope > ul:not([data-type]) > li")];
    expect(top.length).toBe(2);
    const nested = top[0].querySelector("ul[data-type='taskList']") as HTMLElement;
    const nestedItems = [...nested.querySelectorAll(":scope > li")];
    expect(nestedItems.length).toBe(2);

    expect(paddingBottom(nestedItems[0])).toBe("var(--spacing-list-item)");
    // The nested checklist must not add --spacing-block on top of the parent row.
    expect(paddingBottom(nested)).toBe("0px");
    expect(paddingBottom(nestedItems[1])).toBe("0px");
    expect(paddingBottom(top[0])).toBe("var(--spacing-list-item)");

    editor.destroy();
  });

  it("does not stack a nested checklist on the parent row", () => {
    const { editor, dom } = mount(
      ["- [ ] parent", "  - [ ] nested a", "  - [ ] nested b", "- [ ] next"].join("\n"),
    );

    const list = dom.querySelector('ul[data-type="taskList"]') as HTMLElement;
    const top = [...list.querySelectorAll(":scope > li")];
    expect(top.length).toBe(2);
    // Task item content, including a nested list, lives in the item's div.
    const nested = top[0].querySelector(":scope > div > ul") as HTMLElement;
    const nestedItems = [...nested.querySelectorAll(":scope > li")];
    expect(nestedItems.length).toBe(2);

    expect(paddingBottom(nestedItems[0])).toBe("var(--spacing-list-item)");
    expect(paddingBottom(nestedItems[1])).toBe("0px");
    expect(paddingBottom(nested)).toBe("0px");
    expect(paddingBottom(top[0])).toBe("var(--spacing-list-item)");
    expect(paddingBottom(list)).toBe("var(--spacing-block)");

    editor.destroy();
  });
});
