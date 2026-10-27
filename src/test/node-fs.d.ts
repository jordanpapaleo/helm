// src tests are typechecked without @types/node. Declare only the read this
// suite uses so it can load the shipped stylesheet.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare const process: { cwd(): string };
