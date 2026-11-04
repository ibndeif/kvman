import type { Message } from '../../src/index.ts';
import type { MessageDraft } from './message-drafts.ts';

// Edit and Undo on the person's messages (plan 08 §8.7, ADR 0118, 7): which message has which, and the send box after
// an undo.

const kvcoderName = '@kvman/kvcoder';
const typed = (message: Message): boolean => message.kind === 'user' && message.queued !== true && message.source?.kind === 'user';
const undoable = (message: Message): boolean => typed(message) || (message.kind === 'user' && message.queued !== true && message.source?.kind === 'extension' && message.source.name !== kvcoderName);

/** The id of the latest message that may be undone. */
export function latestUndoable(messages: readonly Message[]): string | undefined {
  return messages.findLast(undoable)?.id;
}

/** The actions a message has in a chat that isn't a helper's. */
export function rewindActions(message: Message, latest: string | undefined): { edit: boolean; undo: boolean } {
  return { edit: typed(message), undo: message.id === latest };
}

/** What an undo gives back for the send box. */
export type Undone = { text: string; fileIds: string[]; fileNames: string[]; attachments: string[] };

/** Puts an undone message in the send box: its text before what the box held, and its files beside the box's. */
export function restoreDraft(draft: MessageDraft, undone: Undone): void {
  const held = draft.text.trim();
  draft.text = held === '' ? undone.text : `${undone.text}\n\n${draft.text}`;
  const images = undone.fileIds.map((id, index) => ({ id, name: undone.fileNames[index] ?? id }));
  draft.files = [...images.filter((image) => !draft.files.some((file) => file.id === image.id)), ...draft.files];
  draft.saved = [...undone.attachments.filter((name) => !draft.saved.includes(name)), ...draft.saved];
}

/** A saved attachment's name, for its chip. */
export const savedName = (saved: string): string => saved.split('/').at(-1) ?? saved;
