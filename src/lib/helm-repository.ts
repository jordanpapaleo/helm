import { openUrl } from "@tauri-apps/plugin-opener";

/** KEEP IN SYNC with HELM_REPOSITORY_URL in src-tauri/src/lib.rs */
export const HELM_REPOSITORY_URL = "https://github.com/jordanpapaleo/helm";

/** Open the Helm GitHub repository with the app's opener plugin. */
export function openHelmRepository(open: (url: string) => Promise<void> = openUrl): Promise<void> {
  return open(HELM_REPOSITORY_URL);
}
