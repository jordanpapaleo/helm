import { common, createLowlight } from "lowlight";

export const lowlight = createLowlight(common);
// Not a highlight.js grammar — rendered as a diagram by CodeBlockView.
export const LANGUAGES: string[] = [...lowlight.listLanguages(), "mermaid"].sort();
