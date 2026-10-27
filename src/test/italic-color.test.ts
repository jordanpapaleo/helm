import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { makeEditor } from "./editor-harness";

const globalsCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../styles/globals.css"),
  "utf8",
);

/**
 * Pull the prose text-color rules out of globals.css so the test applies the
 * real selectors instead of a copy that can drift from the stylesheet.
 */
function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`missing selector ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function proseTextColorCss(source: string): string {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: string[] = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  for (const match of stripped.matchAll(re)) {
    const selector = match[1].trim();
    const body = match[2];
    if (!selector.includes(".prose") || !body.includes("color")) continue;
    const setsTextColor =
      selector.startsWith(".prose,") ||
      selector.includes(":where(em)") ||
      selector.includes(":where(a)") ||
      selector.includes(":where(blockquote)") ||
      selector.includes(":where(strong)") ||
      selector.includes(":where(b)");
    if (setsTextColor) rules.push(`${selector} {${body}}`);
  }
  return rules.join("\n");
}

function mountProse(markdown: string, editors: ReturnType<typeof makeEditor>[]): HTMLElement {
  const editor = makeEditor(markdown);
  editors.push(editor);
  editor.view.dom.classList.add("prose");
  document.body.appendChild(editor.view.dom);
  return editor.view.dom;
}

describe("italic markdown color", () => {
  const editors: ReturnType<typeof makeEditor>[] = [];

  afterEach(() => {
    for (const editor of editors) editor.destroy();
    editors.length = 0;
    document.getElementById("italic-color-rules")?.remove();
    document.body.replaceChildren();
  });

  function installProseColors(): void {
    const rules = proseTextColorCss(globalsCss);
    const emRule = ruleBody(rules, ".prose :where(em)");
    expect(emRule).toMatch(/color:\s*inherit/);
    expect(emRule).not.toContain("neutral-content");

    const style = document.createElement("style");
    style.id = "italic-color-rules";
    style.textContent = rules;
    document.head.appendChild(style);
  }

  it("keeps italic text the surrounding color and only changes the style", () => {
    installProseColors();
    const root = mountProse(
      "Plain words and *italic words* plus [a *linked italic*](https://example.com).",
      editors,
    );

    const paragraph = root.querySelector("p");
    const bodyItalic = root.querySelector("p > em");
    const link = root.querySelector("a");
    const linkedItalic = link?.querySelector("em");
    if (!paragraph || !bodyItalic || !link || !linkedItalic) {
      throw new Error(`missing italic markup in ${root.innerHTML}`);
    }

    expect(bodyItalic.textContent).toBe("italic words");
    expect(getComputedStyle(bodyItalic).fontStyle).toBe("italic");
    expect(getComputedStyle(bodyItalic).color).toBe(getComputedStyle(paragraph).color);
    expect(getComputedStyle(bodyItalic).color).toBe("var(--color-base-content)");
    expect(getComputedStyle(bodyItalic).color).not.toContain("neutral");

    expect(getComputedStyle(linkedItalic).fontStyle).toBe("italic");
    expect(getComputedStyle(linkedItalic).color).toBe(getComputedStyle(link).color);
    expect(getComputedStyle(linkedItalic).color).not.toBe("var(--color-base-content)");
    expect(getComputedStyle(linkedItalic).color).not.toContain("neutral");
  });

  it("does not recolor italic text inside a blockquote", () => {
    installProseColors();
    const root = mountProse("> quoted *italic* words", editors);
    const quote = root.querySelector("blockquote");
    const paragraph = quote?.querySelector("p");
    const italic = quote?.querySelector("em");
    if (!quote || !paragraph || !italic) {
      throw new Error(`missing quote markup in ${root.innerHTML}`);
    }

    expect(getComputedStyle(italic).fontStyle).toBe("italic");
    expect(getComputedStyle(italic).color).toBe(getComputedStyle(paragraph).color);
  });
});
