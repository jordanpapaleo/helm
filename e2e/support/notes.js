import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CREATED = "2026-03-13T09:14:22Z";

function yamlValue(value) {
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map((item) => yamlValue(item)).join(", ")}]`;
  return String(value);
}

/** Write one markdown note. Missing keys stay missing, which the unmanaged flow needs. */
export function writeNote(vaultPath, fileName, fields, body) {
  const frontmatter = {
    id: fields.id,
    title: fields.title,
    created: CREATED,
    updated: CREATED,
    ...fields,
  };
  const lines = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${yamlValue(value)}`);
  const full = join(vaultPath, fileName);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `---\n${lines.join("\n")}\n---\n\n${body}\n`);
}

/** Write a markdown file exactly, including notes that omit required keys. */
export function writeRaw(vaultPath, fileName, contents) {
  const full = join(vaultPath, fileName);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}
