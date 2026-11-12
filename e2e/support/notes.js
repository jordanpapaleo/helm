import { writeFileSync } from "node:fs";
import { join } from "node:path";

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
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${yamlValue(value)}`);
  writeFileSync(join(vaultPath, fileName), `---\n${lines.join("\n")}\n---\n\n${body}\n`);
}
