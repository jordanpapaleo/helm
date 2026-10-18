export type WriterMode = "subscription" | "api";
export type WriterProvider = "codex" | "claude";
export interface WriterMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  noteContext?: { title: string; markdown: string };
}
export interface WriterEvent {
  requestId: string;
  kind: "text" | "completed" | "failed" | "cancelled";
  text: string;
}
export interface WriterConnection {
  provider: WriterProvider;
  installed: boolean;
  connected: boolean;
  detail: string;
}
export const WRITER_LIMIT = 60000;
export function buildWriterPrompt(
  messages: WriterMessage[],
  context?: { title: string; content: string },
) {
  const prompt = JSON.stringify({
    attachedNote: context ? { title: context.title, markdown: context.content } : null,
    messages: messages.map(({ role, content, noteContext }) => ({
      role,
      content,
      ...(noteContext ? { noteContext } : {}),
    })),
  });
  if (prompt.length > WRITER_LIMIT)
    throw new Error(
      "This conversation is too long. Start a new chat to make room for more context.",
    );
  return prompt;
}
