import type { ComponentType } from "react";
import { EXTENSION_IDS, type ExtensionId, useExtensionsStore } from "../../store/extensions";
import { AssistantChat } from "./AssistantChat";
import { ClaudeAssistantPanel } from "./ClaudeAssistantPanel";

export interface ToolExtension {
  id: ExtensionId;
  name: string;
  description: string;
  /** Bundled `uil:*` icon shown in the right-panel toolbar. */
  icon: string;
  panel: ComponentType<{ extension: ToolExtension }>;
}

const DEFINITIONS: Record<ExtensionId, ToolExtension> = {
  "openai-assistant": {
    id: "openai-assistant",
    name: "OpenAI Assistant",
    description: "Think through notes with OpenAI.",
    icon: "uil:chat",
    panel: AssistantChat,
  },
  "claude-assistant": {
    id: "claude-assistant",
    name: "Claude Assistant",
    description: "Think through notes with Claude.",
    icon: "uil:asterisk",
    panel: ClaudeAssistantPanel,
  },
};

/** Built-in extensions in toolbar order. */
export const BUILT_IN_EXTENSIONS: readonly ToolExtension[] = EXTENSION_IDS.map(
  (id) => DEFINITIONS[id],
);

export function useExtensions(): (ToolExtension & { enabled: boolean })[] {
  const enabled = useExtensionsStore((state) => state.enabled);
  return BUILT_IN_EXTENSIONS.map((extension) => ({
    ...extension,
    enabled: enabled.includes(extension.id),
  }));
}
