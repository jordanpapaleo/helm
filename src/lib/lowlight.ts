import { common, createLowlight } from "lowlight";

export const lowlight = createLowlight(common);
export const LANGUAGES: string[] = lowlight.listLanguages().sort();
