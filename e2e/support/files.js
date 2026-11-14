import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { browser } from "@wdio/globals";
import matter from "gray-matter";

export function vaultPath() {
  const vault = process.env.HELM_E2E_VAULT;
  if (!vault) throw new Error("HELM_E2E_VAULT is not set");
  return vault;
}

export function notePath(relativePath) {
  return join(vaultPath(), relativePath);
}

export function readNoteFile(relativePath) {
  const full = notePath(relativePath);
  const parsed = matter(readFileSync(full, "utf8"));
  return { data: parsed.data, content: parsed.content, path: full };
}

export function noteExists(relativePath) {
  return existsSync(notePath(relativePath));
}

/** Markdown files a person can see. Dot-directories and assets are not notes. */
export function visibleMarkdown(dir = vaultPath(), prefix = "") {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      if (name === "assets") continue;
      found.push(...visibleMarkdown(full, relative));
    } else if (name.endsWith(".md")) {
      found.push(relative);
    }
  }
  return found.sort();
}

/** Files that appeared after `before`, which is a list from `visibleMarkdown()`. */
export function addedMarkdown(before) {
  const known = new Set(before);
  return visibleMarkdown().filter((file) => !known.has(file));
}

export async function waitForNoteFile(relativePath, predicate, timeoutMsg) {
  let latest = null;
  let error = "";
  await browser.waitUntil(
    async () => {
      try {
        latest = readNoteFile(relativePath);
        error = "";
        return predicate(latest);
      } catch (failure) {
        latest = null;
        error = failure instanceof Error ? failure.message : String(failure);
        return false;
      }
    },
    {
      timeout: 10000,
      timeoutMsg: () =>
        `${timeoutMsg}\n${error}\n${
          latest ? `${JSON.stringify(latest.data)}\n${latest.content}` : "(file missing)"
        }`,
    },
  );
  return latest;
}

export async function waitForFile(relativePath, timeoutMsg) {
  await browser.waitUntil(async () => noteExists(relativePath), {
    timeout: 10000,
    timeoutMsg,
  });
}
