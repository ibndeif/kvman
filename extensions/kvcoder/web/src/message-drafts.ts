import { reactive } from 'vue';

// The send box's text and attachments (ADR 0048, 6 and 7), kept for the application's life by workspace and chat, so
// they outlive the page's components. A draft is cleared only when its send is confirmed.

export type Attachment = { id: string; name: string };
/** `attachments` names files already saved under `attachments/`, as an undone message holds them (ADR 0118, 6). */
export type Outgoing = { text: string; fileIds: string[]; attachments?: string[] };
type Attempt = Outgoing & { sendId: string };
export type MessageDraft = {
  text: string;
  files: Attachment[];
  saved: string[];
  sending: boolean;
  error: unknown;
  attempt: Attempt | undefined;
  /** The chat the new chat's draft created, which a retry sends into. */
  createdChat: string | undefined;
};

const newChat = '';
const workspaces = new Map<string, Map<string, MessageDraft>>();

/** The draft of a chat, or of the new chat without a `sessionId`. */
export function messageDraft(workspaceId: string, sessionId?: string): MessageDraft {
  const drafts = workspaces.get(workspaceId) ?? new Map<string, MessageDraft>();
  workspaces.set(workspaceId, drafts);
  const found = drafts.get(sessionId ?? newChat) ?? reactive<MessageDraft>({ text: '', files: [], saved: [], sending: false, error: undefined, attempt: undefined, createdChat: undefined });
  drafts.set(sessionId ?? newChat, found);
  return found;
}

const sameList = (first: readonly string[], second: readonly string[]): boolean => first.length === second.length && first.every((item, index) => item === second[index]);
const sameMessage = (attempt: Attempt, message: Outgoing): boolean => attempt.text === message.text && sameList(attempt.fileIds, message.fileIds) && sameList(attempt.attachments ?? [], message.attachments ?? []);

/** Sends the draft's message once: a repeat of the same message keeps its `sendId`. Says whether it was confirmed. */
export async function sendDraft(draft: MessageDraft, message: Outgoing, send: (sendId: string) => Promise<void>): Promise<boolean> {
  if (draft.sending) return false;
  const attempt = draft.attempt !== undefined && sameMessage(draft.attempt, message) ? draft.attempt : { ...message, sendId: crypto.randomUUID() };
  Object.assign(draft, { attempt, sending: true, error: undefined });
  try {
    await send(attempt.sendId);
  } catch (error) {
    Object.assign(draft, { sending: false, error });
    return false;
  }
  Object.assign(draft, { text: '', files: [], saved: [], sending: false, attempt: undefined, createdChat: undefined });
  return true;
}
