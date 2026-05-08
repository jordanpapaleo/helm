import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import matter from "gray-matter";

// ── Vault resolution ──────────────────────────────────────────────────────────
// Supports multiple vaults via HELM_VAULTS (comma-separated paths) or HELM_VAULT (single path)

function resolveVaults(): { name: string; path: string }[] {
  const multi = process.env.HELM_VAULTS;
  if (multi) {
    return multi
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({
        name: path.basename(p),
        path: p,
      }));
  }
  const single = process.env.HELM_VAULT ?? `${process.env.HOME}/notes`;
  return [{ name: path.basename(single), path: single }];
}

const VAULTS = resolveVaults();

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoteData {
  id: string;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  urgent: boolean;
  important: boolean;
  state: string;
  blocked: boolean;
  locked?: boolean;
  pinned?: boolean;
  deadline?: string;
  team?: string[];
  links?: string[];
  [key: string]: unknown;
}

interface Note {
  frontmatter: NoteData;
  content: string;
  filePath: string;
  fileName: string;
  vaultName: string;
}

// ── File I/O ──────────────────────────────────────────────────────────────────

function listAllNotes(): Note[] {
  const notes: Note[] = [];
  for (const vault of VAULTS) {
    if (!fs.existsSync(vault.path)) continue;
    const files = fs.readdirSync(vault.path).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(vault.path, file);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const { data, content } = matter(raw);
        notes.push({
          frontmatter: data as NoteData,
          content,
          filePath,
          fileName: file,
          vaultName: vault.name,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }
  return notes;
}

function writeNote(filePath: string, frontmatter: NoteData, content: string): void {
  const data = Object.fromEntries(Object.entries(frontmatter).filter(([, v]) => v !== undefined));
  fs.writeFileSync(filePath, matter.stringify(content, data));
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractInlineTags(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(/(?:^|[^a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9/_-]*)/g)) {
    seen.add(match[1]);
  }
  return [...seen];
}

function extractWikiLinks(content: string): string[] {
  const seen = new Set<string>();
  const unescaped = content.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
  for (const match of unescaped.matchAll(/\[\[([^\]]+)\]\]/g)) {
    seen.add(match[1].trim());
  }
  return [...seen];
}

function isOverdue(deadline: string | undefined): boolean {
  if (!deadline) return false;
  return deadline < new Date().toISOString().split("T")[0];
}

// ── Quadrant helper ───────────────────────────────────────────────────────────

type Quadrant = "do" | "schedule" | "delegate" | "eliminate";

function getQuadrant(fm: NoteData): Quadrant {
  if (fm.urgent && fm.important) return "do";
  if (!fm.urgent && fm.important) return "schedule";
  if (fm.urgent && !fm.important) return "delegate";
  return "eliminate";
}

// ── Summary shape for list responses ─────────────────────────────────────────

function noteSummary(n: Note) {
  return {
    id: n.frontmatter.id,
    title: n.frontmatter.title,
    tags: n.frontmatter.tags ?? [],
    state: n.frontmatter.state,
    urgent: n.frontmatter.urgent,
    important: n.frontmatter.important,
    blocked: n.frontmatter.blocked,
    pinned: n.frontmatter.pinned,
    locked: n.frontmatter.locked,
    deadline: n.frontmatter.deadline,
    team: n.frontmatter.team,
    links: n.frontmatter.links ?? [],
    vault: n.vaultName,
    preview: n.content.slice(0, 300).trim(),
  };
}

// ── Rules & conventions ───────────────────────────────────────────────────────

const RULES = `
HELM VAULT RULES — read these before creating or updating any note:

IDENTIFIERS
• Every note has a stable ULID in the 'id' field. Always use IDs, never filenames — notes can be renamed.
• Use resolve_note to turn a title into a ULID before adding it to a 'links' array.

LOCKED NOTES
• Never modify a note where locked: true. Return an error explaining the note must be unlocked in Helm first.

FRONTMATTER FIELDS
• id: ULID (system-generated, never change)
• title: string
• created / updated: YYYY-MM-DD (updated is set automatically on every write)
• tags: string[] — e.g. ["work", "work/project"]. Tags are hierarchical with '/'.
• urgent / important: boolean — Eisenhower matrix axes
• state: "Prepare" | "Doing" | "Maintain" | "Done"
• blocked: boolean — note is blocked from progress
• locked: boolean — note is read-only (only changeable in the Helm app)
• pinned: boolean — floats to top of lists
• deadline: YYYY-MM-DD
• team: string[] — team member names (freeform strings)
• links: string[] — ULIDs of linked notes (outbound graph edges)

TAGS
• Tags go in the frontmatter 'tags' array AND/OR inline in the body as #tag or #parent/child.
• Helm merges both sources on parse. Both styles are valid.
• Hierarchical tags use '/' — e.g. "work/project/alpha" appears nested under "work/project" under "work".
• To APPEND tags without losing existing ones, use append_tags in update_note. Don't replace the full array.

LINKS
• The 'links' frontmatter field stores ULIDs of related notes (outbound edges).
• Use [[Note Title]] syntax in the body for inline wiki links — Helm resolves these to IDs on open.
• To APPEND links without losing existing ones, use append_links in update_note.
• Always resolve titles to ULIDs with resolve_note before adding to 'links'.

DATES
• All dates must be YYYY-MM-DD. Full ISO 8601 timestamps are not accepted.

SHALLOW MERGE
• update_note does a shallow merge of frontmatter fields.
• Passing frontmatter: { tags: ["new"] } REPLACES the entire tags array.
• Use append_tags and append_links instead to safely add without overwriting.

STATES
• Prepare → Doing → Maintain → Done is the natural workflow progression.
• "Doing" notes show up in daily standups. "Maintain" means ongoing/recurring.

PROTECTED FIELDS
• id and locked can never be changed via the MCP server — changes will be silently ignored.
`.trim();

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "helm", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

// ── Tools ─────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_rules",
      description:
        "Get all conventions and rules for working with this Helm vault. Call this first in any session before creating or modifying notes.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_notes",
      description:
        "List notes with their metadata and a short preview. Supports rich filtering. Returns summaries — use read_note for full content.",
      inputSchema: {
        type: "object",
        properties: {
          tag: {
            type: "string",
            description:
              "Filter by tag. Hierarchical: 'work' matches 'work', 'work/project', 'work/project/alpha', etc.",
          },
          state: {
            type: "string",
            enum: ["Prepare", "Doing", "Maintain", "Done"],
            description: "Filter by workflow state.",
          },
          urgent: { type: "boolean" },
          important: { type: "boolean" },
          blocked: { type: "boolean", description: "Filter by blocked status." },
          pinned: { type: "boolean", description: "Filter to pinned notes only." },
          locked: { type: "boolean", description: "Filter to locked (read-only) notes." },
          overdue: {
            type: "boolean",
            description: "If true, return only notes with a deadline in the past.",
          },
          team_member: {
            type: "string",
            description: "Filter to notes where this string appears in the team array.",
          },
          quadrant: {
            type: "string",
            enum: ["do", "schedule", "delegate", "eliminate"],
            description:
              "Eisenhower quadrant shorthand. 'do'=urgent+important, 'schedule'=!urgent+important, 'delegate'=urgent+!important, 'eliminate'=!urgent+!important.",
          },
          vault: {
            type: "string",
            description:
              "Filter to a specific vault by name (only relevant if multiple vaults are configured).",
          },
        },
      },
    },
    {
      name: "read_note",
      description:
        "Read the full content and frontmatter of a single note by its ULID. Always call this before updating a note so you have the current state.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Note ULID." },
        },
        required: ["id"],
      },
    },
    {
      name: "resolve_note",
      description:
        "Look up one or more notes by title (case-insensitive, partial match). Returns their ULIDs. Use this before adding links to other notes.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title substring to search for." },
        },
        required: ["title"],
      },
    },
    {
      name: "search_notes",
      description:
        "Search notes by keyword across title, content, and tags. Returns ranked results.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search terms." },
        },
        required: ["query"],
      },
    },
    {
      name: "get_eisenhower",
      description:
        "Get all active notes (state=Prepare or Doing) grouped into the four Eisenhower quadrants: do, schedule, delegate, eliminate.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_kanban",
      description:
        "Get all notes grouped by workflow state (Prepare, Doing, Maintain, Done). Useful for reviewing progress across the board.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_backlinks",
      description:
        "Find all notes that link TO a given note (inbound references). Essential for zettelkasten graph navigation.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "ULID of the note to find backlinks for." },
        },
        required: ["id"],
      },
    },
    {
      name: "get_tag_tree",
      description:
        "Return the full hierarchical tag tree with note counts at each level. Useful for understanding the vault's taxonomy.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_note",
      description:
        "Create a new note in the vault. Read get_rules first. Use resolve_note to get ULIDs before setting links.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Note title." },
          content: {
            type: "string",
            description:
              "Body content in markdown. Use [[Note Title]] for inline wiki links and #tag for inline tags.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Tag array, e.g. ['work', 'work/project']. Hierarchical — use '/' as separator.",
          },
          links: {
            type: "array",
            items: { type: "string" },
            description: "ULIDs of related notes. Use resolve_note first to find the correct IDs.",
          },
          urgent: { type: "boolean", default: false },
          important: { type: "boolean", default: false },
          state: {
            type: "string",
            enum: ["Prepare", "Doing", "Maintain", "Done"],
            default: "Prepare",
          },
          blocked: {
            type: "boolean",
            default: false,
            description: "Is this note currently blocked?",
          },
          pinned: {
            type: "boolean",
            default: false,
            description: "Pin this note to the top of lists.",
          },
          deadline: { type: "string", description: "Due date in YYYY-MM-DD format." },
          team: {
            type: "array",
            items: { type: "string" },
            description: "Team member names responsible for this note.",
          },
          created: {
            type: "string",
            description:
              "Creation date in YYYY-MM-DD. Defaults to today. Set this when bulk-importing historical notes.",
          },
          vault: {
            type: "string",
            description:
              "Vault name to create the note in. Defaults to the first configured vault.",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "update_note",
      description: `Update a note's content and/or frontmatter by ULID. Refuses if the note is locked.

IMPORTANT — shallow merge: passing frontmatter.tags replaces the ENTIRE tags array.
Use append_tags and append_links to safely add values without overwriting existing ones.
Read get_rules for full merge semantics.`,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Note ULID." },
          content: {
            type: "string",
            description: "New full body content. Omit to leave content unchanged.",
          },
          frontmatter: {
            type: "object",
            description:
              "Frontmatter fields to shallow-merge in. Safe fields: title, tags, links, urgent, important, state, blocked, pinned, deadline, team. Protected: id, locked (ignored if provided).",
          },
          append_tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags to ADD to the existing tags array without replacing it.",
          },
          append_links: {
            type: "array",
            items: { type: "string" },
            description: "ULIDs to ADD to the existing links array without replacing it.",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_note",
      description:
        "Permanently delete a note from disk. Refuses if the note is locked. This cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Note ULID." },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const notes = listAllNotes();

  // ── get_rules ──────────────────────────────────────────────────────────────
  if (name === "get_rules") {
    const vaultList = VAULTS.map((v) => `  • ${v.name}: ${v.path}`).join("\n");
    return {
      content: [
        {
          type: "text",
          text: `${RULES}\n\nCONFIGURED VAULTS:\n${vaultList}`,
        },
      ],
    };
  }

  // ── list_notes ─────────────────────────────────────────────────────────────
  if (name === "list_notes") {
    let filtered = notes;

    if (args?.vault) {
      filtered = filtered.filter((n) => n.vaultName === String(args.vault));
    }
    if (args?.tag) {
      const tag = String(args.tag);
      filtered = filtered.filter((n) =>
        (n.frontmatter.tags ?? []).some((t) => t === tag || t.startsWith(`${tag}/`)),
      );
    }
    if (args?.quadrant) {
      const q = args.quadrant as Quadrant;
      filtered = filtered.filter((n) => getQuadrant(n.frontmatter) === q);
    } else {
      if (args?.urgent !== undefined)
        filtered = filtered.filter((n) => n.frontmatter.urgent === args.urgent);
      if (args?.important !== undefined)
        filtered = filtered.filter((n) => n.frontmatter.important === args.important);
    }
    if (args?.state) filtered = filtered.filter((n) => n.frontmatter.state === args.state);
    if (args?.blocked !== undefined)
      filtered = filtered.filter((n) => Boolean(n.frontmatter.blocked) === args.blocked);
    if (args?.pinned !== undefined)
      filtered = filtered.filter((n) => Boolean(n.frontmatter.pinned) === args.pinned);
    if (args?.locked !== undefined)
      filtered = filtered.filter((n) => Boolean(n.frontmatter.locked) === args.locked);
    if (args?.overdue) filtered = filtered.filter((n) => isOverdue(n.frontmatter.deadline));
    if (args?.team_member) {
      const member = String(args.team_member).toLowerCase();
      filtered = filtered.filter((n) =>
        (n.frontmatter.team ?? []).some((m) => m.toLowerCase().includes(member)),
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(filtered.map(noteSummary), null, 2),
        },
      ],
    };
  }

  // ── read_note ──────────────────────────────────────────────────────────────
  if (name === "read_note") {
    const id = String(args?.id);
    const note = notes.find((n) => n.frontmatter.id === id);
    if (!note) return { content: [{ type: "text", text: `Note not found: ${id}` }] };

    const wikiLinks = extractWikiLinks(note.content);
    const inlineTags = extractInlineTags(note.content);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              frontmatter: note.frontmatter,
              content: note.content,
              vault: note.vaultName,
              derived: {
                wikiLinks,
                inlineTags,
                quadrant: getQuadrant(note.frontmatter),
                overdue: isOverdue(note.frontmatter.deadline),
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // ── resolve_note ───────────────────────────────────────────────────────────
  if (name === "resolve_note") {
    const query = String(args?.title ?? "").toLowerCase();
    const matches = notes.filter((n) => n.frontmatter.title?.toLowerCase().includes(query));
    if (matches.length === 0) {
      return { content: [{ type: "text", text: `No note found matching: "${args?.title}"` }] };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            matches.map((n) => ({
              id: n.frontmatter.id,
              title: n.frontmatter.title,
              tags: n.frontmatter.tags,
              vault: n.vaultName,
            })),
            null,
            2,
          ),
        },
      ],
    };
  }

  // ── search_notes ───────────────────────────────────────────────────────────
  if (name === "search_notes") {
    const query = String(args?.query ?? "")
      .toLowerCase()
      .trim();
    if (!query) return { content: [{ type: "text", text: "[]" }] };

    const terms = query.split(/\s+/);

    const scored = notes.map((n) => {
      const titleLower = (n.frontmatter.title ?? "").toLowerCase();
      const contentLower = n.content.toLowerCase();
      const tagStr = (n.frontmatter.tags ?? []).join(" ").toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (titleLower.includes(term)) score += 10;
        if (tagStr.includes(term)) score += 5;
        if (contentLower.includes(term)) score += 1;
      }
      return { note: n, score };
    });

    const results = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => noteSummary(s.note));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  // ── get_eisenhower ─────────────────────────────────────────────────────────
  if (name === "get_eisenhower") {
    const active = notes.filter(
      (n) => n.frontmatter.state === "Prepare" || n.frontmatter.state === "Doing",
    );
    const quadrants: Record<Quadrant, ReturnType<typeof noteSummary>[]> = {
      do: [],
      schedule: [],
      delegate: [],
      eliminate: [],
    };
    for (const n of active) {
      quadrants[getQuadrant(n.frontmatter)].push(noteSummary(n));
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(quadrants, null, 2),
        },
      ],
    };
  }

  // ── get_kanban ─────────────────────────────────────────────────────────────
  if (name === "get_kanban") {
    const columns: Record<string, ReturnType<typeof noteSummary>[]> = {
      Prepare: [],
      Doing: [],
      Maintain: [],
      Done: [],
    };
    for (const n of notes) {
      const state = n.frontmatter.state ?? "Prepare";
      if (state in columns) columns[state].push(noteSummary(n));
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(columns, null, 2),
        },
      ],
    };
  }

  // ── get_backlinks ──────────────────────────────────────────────────────────
  if (name === "get_backlinks") {
    const id = String(args?.id);
    const target = notes.find((n) => n.frontmatter.id === id);
    if (!target) return { content: [{ type: "text", text: `Note not found: ${id}` }] };

    // Check both frontmatter links (ULID refs) and wiki links (title refs)
    const targetTitle = target.frontmatter.title?.toLowerCase() ?? "";

    const backlinks = notes
      .filter((n) => n.frontmatter.id !== id)
      .filter((n) => {
        const linksToId = (n.frontmatter.links ?? []).includes(id);
        const wikiLinksToTitle = extractWikiLinks(n.content).some(
          (link) => link.toLowerCase() === targetTitle,
        );
        return linksToId || wikiLinksToTitle;
      })
      .map((n) => ({
        id: n.frontmatter.id,
        title: n.frontmatter.title,
        tags: n.frontmatter.tags,
        vault: n.vaultName,
        linkType: (n.frontmatter.links ?? []).includes(id) ? "frontmatter" : "wiki",
        preview: n.content.slice(0, 200).trim(),
      }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              target: { id, title: target.frontmatter.title },
              backlinks,
              count: backlinks.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // ── get_tag_tree ───────────────────────────────────────────────────────────
  if (name === "get_tag_tree") {
    interface TagNode {
      count: number;
      children: Record<string, TagNode>;
    }

    const tree: Record<string, TagNode> = {};

    function ensureNode(parts: string[], cur: Record<string, TagNode>): TagNode {
      const [head, ...rest] = parts;
      if (!cur[head]) cur[head] = { count: 0, children: {} };
      if (rest.length === 0) return cur[head];
      return ensureNode(rest, cur[head].children);
    }

    for (const note of notes) {
      for (const tag of note.frontmatter.tags ?? []) {
        const parts = tag.split("/").filter(Boolean);
        const node = ensureNode(parts, tree);
        node.count += 1;
        // Also increment parent counts
        for (let i = 1; i < parts.length; i++) {
          ensureNode(parts.slice(0, i), tree).count += 0; // ensure exists
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tree, null, 2),
        },
      ],
    };
  }

  // ── create_note ────────────────────────────────────────────────────────────
  if (name === "create_note") {
    const { ulid } = await import("ulid");
    const id = ulid();
    const title = String(args?.title ?? "Untitled");

    // Resolve target vault
    const vaultName = args?.vault ? String(args.vault) : undefined;
    const vault = vaultName ? (VAULTS.find((v) => v.name === vaultName) ?? VAULTS[0]) : VAULTS[0];

    if (!vault) {
      return {
        content: [{ type: "text", text: "No vault configured. Set HELM_VAULT or HELM_VAULTS." }],
      };
    }

    if (!fs.existsSync(vault.path)) {
      fs.mkdirSync(vault.path, { recursive: true });
    }

    const slug = slugify(title);
    const filePath = path.join(vault.path, `${slug}-${id.slice(-6).toLowerCase()}.md`);
    const today = new Date().toISOString().split("T")[0];

    const content = String(args?.content ?? "");
    const inlineTags = extractInlineTags(content);
    const frontmatterTags: string[] = (args?.tags as string[]) ?? [];
    const mergedTags = [...new Set([...frontmatterTags, ...inlineTags])];

    const frontmatter: NoteData = {
      id,
      title,
      created: args?.created ? String(args.created) : today,
      updated: today,
      tags: mergedTags,
      urgent: (args?.urgent as boolean) ?? false,
      important: (args?.important as boolean) ?? false,
      state: (args?.state as string) ?? "Prepare",
      blocked: (args?.blocked as boolean) ?? false,
      locked: false,
      pinned: (args?.pinned as boolean) ?? false,
      links: (args?.links as string[]) ?? [],
      ...(args?.deadline ? { deadline: String(args.deadline) } : {}),
      ...(args?.team ? { team: args.team as string[] } : {}),
    };

    writeNote(filePath, frontmatter, content);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ id, title, filePath, vault: vault.name }, null, 2),
        },
      ],
    };
  }

  // ── update_note ────────────────────────────────────────────────────────────
  if (name === "update_note") {
    const id = String(args?.id);
    const note = notes.find((n) => n.frontmatter.id === id);
    if (!note) return { content: [{ type: "text", text: `Note not found: ${id}` }] };

    if (note.frontmatter.locked) {
      return {
        content: [
          {
            type: "text",
            text: `Refused: "${note.frontmatter.title}" is locked. Unlock it in Helm first.`,
          },
        ],
      };
    }

    const incoming = (args?.frontmatter as Record<string, unknown>) ?? {};

    // Build updated frontmatter — protect id and locked
    let updatedTags: string[] = incoming.tags
      ? (incoming.tags as string[])
      : (note.frontmatter.tags ?? []);

    let updatedLinks: string[] = incoming.links
      ? (incoming.links as string[])
      : (note.frontmatter.links ?? []);

    // append_tags / append_links — safe additive operations
    if (args?.append_tags) {
      updatedTags = [...new Set([...updatedTags, ...(args.append_tags as string[])])];
    }
    if (args?.append_links) {
      updatedLinks = [...new Set([...updatedLinks, ...(args.append_links as string[])])];
    }

    const updatedFrontmatter: NoteData = {
      ...note.frontmatter,
      ...incoming,
      tags: updatedTags,
      links: updatedLinks,
      id: note.frontmatter.id, // never overwrite
      locked: note.frontmatter.locked, // never overwrite
      updated: new Date().toISOString().split("T")[0],
    };

    const content = args?.content !== undefined ? String(args.content) : note.content;
    writeNote(note.filePath, updatedFrontmatter, content);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { id, title: updatedFrontmatter.title, updated: updatedFrontmatter.updated },
            null,
            2,
          ),
        },
      ],
    };
  }

  // ── delete_note ────────────────────────────────────────────────────────────
  if (name === "delete_note") {
    const id = String(args?.id);
    const note = notes.find((n) => n.frontmatter.id === id);
    if (!note) return { content: [{ type: "text", text: `Note not found: ${id}` }] };

    if (note.frontmatter.locked) {
      return {
        content: [
          {
            type: "text",
            text: `Refused: "${note.frontmatter.title}" is locked. Unlock it in Helm first.`,
          },
        ],
      };
    }

    fs.unlinkSync(note.filePath);

    return {
      content: [
        {
          type: "text",
          text: `Deleted: "${note.frontmatter.title}" (${id})`,
        },
      ],
    };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// ── Resources ─────────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const notes = listAllNotes();
  return {
    resources: notes.map((n) => ({
      uri: `note://${n.frontmatter.id}`,
      name: n.frontmatter.title || n.fileName,
      description: `${n.frontmatter.tags?.join(", ") || "no tags"} · ${n.frontmatter.state} · ${n.vaultName}`,
      mimeType: "text/markdown",
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const id = uri.replace("note://", "");
  const notes = listAllNotes();
  const note = notes.find((n) => n.frontmatter.id === id);

  if (!note) {
    throw new Error(`Note not found: ${id}`);
  }

  // Return the raw markdown file (frontmatter + content)
  const raw = fs.readFileSync(note.filePath, "utf-8");
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: raw,
      },
    ],
  };
});

// ── Prompts ───────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "capture",
      description: "Quickly capture a new idea, task, or note into the vault.",
      arguments: [
        { name: "idea", description: "What to capture", required: true },
        { name: "tags", description: "Comma-separated tags (optional)", required: false },
      ],
    },
    {
      name: "daily_standup",
      description: "Generate a daily standup summary from all notes currently in 'Doing' state.",
      arguments: [],
    },
    {
      name: "weekly_review",
      description:
        "Run a weekly review: surface overdue items, blocked notes, and notes ready to move states.",
      arguments: [],
    },
    {
      name: "project_brief",
      description: "Summarize all notes under a specific tag as a project status brief.",
      arguments: [{ name: "tag", description: "The project tag to summarize", required: true }],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "capture") {
    const idea = args?.idea ?? "";
    const tags = args?.tags ?? "";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please capture the following into my Helm vault as a new note:

"${idea}"

${tags ? `Tags: ${tags}` : "Infer appropriate tags from the content."}

Steps:
1. Call get_rules to review vault conventions.
2. Determine the right title, tags, state (Prepare for tasks, Doing if it's active), urgent/important flags.
3. Call create_note with the structured data.
4. Confirm what was created.`,
          },
        },
      ],
    };
  }

  if (name === "daily_standup") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate my daily standup from my Helm vault.

Steps:
1. Call list_notes with state="Doing" to get everything I'm currently working on.
2. Also call list_notes with blocked=true to surface any blockers.
3. Also call list_notes with overdue=true to catch any missed deadlines.
4. Format the output as a standup:
   - **Yesterday / In Progress**: what I'm working on (Doing notes)
   - **Blockers**: any blocked notes
   - **Overdue**: any past-deadline items
   - **Suggested next**: pick the highest-priority Prepare note based on urgent+important flags`,
          },
        },
      ],
    };
  }

  if (name === "weekly_review") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Run a weekly review of my Helm vault.

Steps:
1. Call get_eisenhower to see everything in the "do" and "schedule" quadrants.
2. Call list_notes with overdue=true to find missed deadlines.
3. Call list_notes with blocked=true to surface blockers.
4. Call list_notes with state="Done" to review recently completed work.
5. Produce a weekly review with sections:
   - **Must Do This Week** (do quadrant)
   - **Schedule / Plan** (schedule quadrant)
   - **Overdue — Needs Attention**
   - **Blocked — Needs Resolution**
   - **Completed Recently** (celebrate wins)
   - **Recommended Actions**: suggest state changes, archive candidates, or new notes to create`,
          },
        },
      ],
    };
  }

  if (name === "project_brief") {
    const tag = args?.tag ?? "";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate a project status brief for the "${tag}" tag in my Helm vault.

Steps:
1. Call list_notes with tag="${tag}" to get all notes in this project.
2. For any notes with links, call get_backlinks to understand the relationship graph.
3. Produce a brief with:
   - **Summary**: what this project is about (inferred from the notes)
   - **Status**: current state distribution (how many in Prepare/Doing/Maintain/Done)
   - **Active work**: Doing notes with any blockers called out
   - **Upcoming**: Prepare notes, sorted by urgency
   - **Dependencies**: any cross-linked notes or team members involved
   - **Risks**: overdue items, blocked notes, notes with no state progress`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
