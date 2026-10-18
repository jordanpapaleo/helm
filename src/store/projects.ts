import { create } from "zustand";
import { type Project, retargetProject, serializeProjectMeta } from "../lib/projects";
import { tauriCommands } from "../lib/tauri-commands";
import { reportError } from "./toast";

interface ProjectStore {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  upsert: (project: Project) => void;
  /**
   * A folder rename moved this prefix on disk. Project ids stay put. Renaming
   * a project root also updates the display name stored in helm-project.json.
   */
  retarget: (oldPath: string, newPath: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),
  upsert: (project) =>
    set((state) => ({
      projects: [...state.projects.filter((item) => item.id !== project.id), project],
    })),
  retarget: async (oldPath, newPath) => {
    const current = get().projects;
    const next = current.map((project) => retargetProject(project, oldPath, newPath));
    set({ projects: next });
    for (let i = 0; i < current.length; i++) {
      const before = current[i];
      const after = next[i];
      if (!before || !after) continue;
      if (before.rootPath === oldPath.replace(/\/+$/, "") && after.name !== before.name) {
        try {
          await tauriCommands.writeTextFile(after.metaPath, serializeProjectMeta(after));
        } catch (error) {
          reportError("Failed to update project name", error);
        }
      }
    }
  },
}));
