import { describe, expect, it } from "vitest";
import type { Note, VaultConfig } from "../types/note";
import { serializeNote } from "./note-parser";
import { instantiateNote, listTemplateChoices } from "./templates";

const WORK: VaultConfig = { id: "v-work", name: "Work", path: "/work" };
const PERSONAL: VaultConfig = { id: "v-personal", name: "Personal", path: "/personal" };

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01TEMPLATE000000000000000",
    filePath: "/work/templates/bug.md",
    fileName: "bug.md",
    content: "Steps to reproduce\n\nSee [[Status]]",
    vaultId: "v-work",
    frontmatter: {
      id: "01TEMPLATE000000000000000",
      title: "Bug report",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-02T00:00:00Z",
      tags: ["eng", "eng/bugs"],
      urgent: true,
      important: false,
      state: "Prepare",
      blocked: true,
      deadline: "2026-04-01",
      team: ["Ada"],
      links: ["STALE"],
      locked: true,
      pinned: true,
      template: true,
      unmanaged: false,
      kanbanOrder: 4,
      eisenhowerOrder: 2,
      owner: "Ada",
    },
    ...overrides,
  };
}

const STATUS: Note = {
  id: "01STATUS00000000000000000",
  filePath: "/work/status.md",
  fileName: "status.md",
  content: "",
  vaultId: "v-work",
  frontmatter: {
    id: "01STATUS00000000000000000",
    title: "Status",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    tags: [],
    urgent: false,
    important: false,
    state: "Doing",
    blocked: false,
  },
};

describe("listTemplateChoices", () => {
  it("lists only notes flagged template: true, including locked ones", () => {
    const plain = makeNote({
      id: "plain",
      frontmatter: { ...makeNote().frontmatter, id: "plain", title: "Plain", template: undefined },
    });
    const unmarked = makeNote({
      id: "off",
      frontmatter: { ...makeNote().frontmatter, id: "off", title: "Off", template: false },
    });
    const locked = makeNote();

    const choices = listTemplateChoices([plain, unmarked, locked], [WORK]);

    expect(choices.map((c) => c.id)).toEqual([locked.id]);
    expect(choices[0]?.label).toBe("Bug report");
  });

  it("sorts by title and disambiguates identical titles with vault and path", () => {
    const a = makeNote({
      id: "a",
      filePath: "/work/docs/spec.md",
      fileName: "spec.md",
      frontmatter: { ...makeNote().frontmatter, id: "a", title: "Spec" },
    });
    const b = makeNote({
      id: "b",
      vaultId: "v-personal",
      filePath: "/personal/spec.md",
      fileName: "spec.md",
      frontmatter: { ...makeNote().frontmatter, id: "b", title: "Spec" },
    });
    const c = makeNote({
      id: "c",
      filePath: "/work/alpha.md",
      frontmatter: { ...makeNote().frontmatter, id: "c", title: "Alpha" },
    });

    const choices = listTemplateChoices([b, a, c], [WORK, PERSONAL]);

    expect(choices.map((choice) => choice.label)).toEqual([
      "Alpha",
      "Spec — Personal/spec.md",
      "Spec — Work/docs/spec.md",
    ]);
  });

  it("disambiguates a template titled Blank so it does not collide with the blank action", () => {
    const blank = makeNote({
      id: "blank",
      filePath: "/work/blank.md",
      fileName: "blank.md",
      frontmatter: { ...makeNote().frontmatter, id: "blank", title: "Blank" },
    });

    expect(listTemplateChoices([blank], [WORK])[0]?.label).toBe("Blank — Work/blank.md");
  });

  it("reflects a rename, an unflag, and a removal on the next read", () => {
    const template = makeNote();
    expect(listTemplateChoices([template], [WORK])).toHaveLength(1);

    const renamed = {
      ...template,
      frontmatter: { ...template.frontmatter, title: "Defect" },
    };
    expect(listTemplateChoices([renamed], [WORK])[0]?.label).toBe("Defect");

    const unflagged = {
      ...template,
      frontmatter: { ...template.frontmatter, template: false },
    };
    expect(listTemplateChoices([unflagged], [WORK])).toEqual([]);
    expect(listTemplateChoices([], [WORK])).toEqual([]);
  });
});

describe("instantiateNote", () => {
  const NOW = "2026-10-17T16:00:00Z";
  const NEW_ID = "01NEWNOTE0000000000000000";

  it("builds a blank note with the existing defaults when no template is given", () => {
    const note = instantiateNote({
      template: null,
      notes: [],
      id: NEW_ID,
      now: NOW,
      vaultId: "v-work",
      folderPath: "/work/inbox/",
    });

    expect(note).toMatchObject({
      id: NEW_ID,
      vaultId: "v-work",
      filePath: "/work/inbox/01newnote0000000000000000.md",
      fileName: "01newnote0000000000000000.md",
      content: "",
    });
    expect(note.frontmatter).toMatchObject({
      id: NEW_ID,
      title: "Untitled",
      created: NOW,
      updated: NOW,
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
    });
    expect(note.frontmatter.template).toBeUndefined();
    expect(note.frontmatter.links).toBeUndefined();
    expect(serializeNote(note)).not.toContain("template:");
  });

  it("copies body and reusable defaults, and leaves identity, flags, order, and stale links behind", () => {
    const template = makeNote();
    const before = structuredClone(template);

    const note = instantiateNote({
      template,
      notes: [template, STATUS],
      id: NEW_ID,
      now: NOW,
      vaultId: "v-personal",
      folderPath: "/personal/incoming",
    });

    expect(note.id).toBe(NEW_ID);
    expect(note.vaultId).toBe("v-personal");
    expect(note.filePath).toBe("/personal/incoming/01newnote0000000000000000.md");
    expect(note.content).toBe(template.content);
    expect(note.frontmatter).toMatchObject({
      id: NEW_ID,
      title: "Untitled",
      created: NOW,
      updated: NOW,
      tags: ["eng", "eng/bugs"],
      urgent: true,
      important: false,
      state: "Prepare",
      blocked: true,
      deadline: "2026-04-01",
      team: ["Ada"],
      unmanaged: false,
      owner: "Ada",
      links: [STATUS.id],
    });
    expect(note.frontmatter.template).toBeUndefined();
    expect(note.frontmatter.locked).toBeUndefined();
    expect(note.frontmatter.pinned).toBeUndefined();
    expect(note.frontmatter.kanbanOrder).toBeUndefined();
    expect(note.frontmatter.eisenhowerOrder).toBeUndefined();
    expect(note.frontmatter.links).not.toContain("STALE");

    note.frontmatter.tags.push("mutated");
    expect(template).toEqual(before);
  });

  it("lets explicit creation context override template defaults", () => {
    const note = instantiateNote({
      template: makeNote(),
      notes: [],
      id: NEW_ID,
      now: NOW,
      vaultId: "v-work",
      folderPath: "/work",
      overrides: {
        state: "Doing",
        urgent: false,
        important: true,
        addTags: ["eng/bugs", "triage"],
        appendInlineTag: "triage",
      },
    });

    expect(note.frontmatter.state).toBe("Doing");
    expect(note.frontmatter.urgent).toBe(false);
    expect(note.frontmatter.important).toBe(true);
    expect(note.frontmatter.tags).toEqual(["eng", "eng/bugs", "triage"]);
    expect(note.content).toBe("Steps to reproduce\n\nSee [[Status]]\n\n#triage\n");
    expect(note.frontmatter.blocked).toBe(true);
  });

  it("does not duplicate an inline tag the template body already has", () => {
    const template = makeNote({ content: "Already #triage here" });
    const note = instantiateNote({
      template,
      notes: [],
      id: NEW_ID,
      now: NOW,
      vaultId: "v-work",
      folderPath: "/work",
      overrides: { appendInlineTag: "triage", addTags: ["triage"] },
    });

    expect(note.content).toBe("Already #triage here");
    expect(note.frontmatter.tags).toEqual(["eng", "eng/bugs", "triage"]);
  });

  it("puts a tag-scoped blank note's tag in the body and the frontmatter", () => {
    const note = instantiateNote({
      template: null,
      notes: [],
      id: NEW_ID,
      now: NOW,
      vaultId: "v-work",
      folderPath: "/work",
      overrides: { addTags: ["work"], appendInlineTag: "work" },
    });

    expect(note.content).toBe("#work");
    expect(note.frontmatter.tags).toEqual(["work"]);
  });
});
