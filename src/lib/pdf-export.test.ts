import { describe, expect, it } from "vitest";
import { pdfFileName, printTheme } from "./pdf-export";
import { THEMES } from "./themes";

describe("pdfFileName", () => {
  it("uses the note title", () => {
    expect(pdfFileName("Project Plan")).toBe("Project Plan.pdf");
  });

  it("replaces characters that are not allowed in file names", () => {
    expect(pdfFileName('Q3: plan/review "draft" <v2>?')).toBe("Q3- plan-review -draft- -v2--.pdf");
  });

  it("drops control characters and leading dots so the file is never hidden", () => {
    expect(pdfFileName("..hidden\tnote\n")).toBe("hidden note.pdf");
  });

  it("falls back to Untitled for empty titles", () => {
    expect(pdfFileName("")).toBe("Untitled.pdf");
    expect(pdfFileName("  ///  ")).toBe("Untitled.pdf");
  });
});

describe("printTheme", () => {
  it("keeps a light theme as it is", () => {
    for (const theme of THEMES.filter((t) => t.colorScheme === "light")) {
      expect(printTheme(theme)).toBe(theme);
    }
  });

  it("prints dark themes on the default light theme", () => {
    for (const theme of THEMES.filter((t) => t.colorScheme === "dark")) {
      expect(printTheme(theme)).toMatchObject({ id: "light", colorScheme: "light" });
    }
  });
});
