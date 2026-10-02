import { randomUUID } from 'node:crypto';

// A model reply that was lost on the way (plan 08 §8.2, ADR 0009, 188, 191, and 192): a provider can generate a tool call and
// never deliver it, so the reply holds no call and little text, yet its output tokens are more than the text and the
// reasoning explain. What is left over is the call that never came.

/** The most automatic retries of a lost reply in one turn. */
export const lostRetries = 2;

const unaccountedLimit = 150;
const shortTextLimit = 400;
// Arabic runs near 2.2 characters a token and English near 4, so counting 2 never makes a visible reply look lost.
const charactersPerToken = 2;

export type ReplyBlock = { type: string; text?: string; thinking?: string };

const characters = (blocks: readonly ReplyBlock[], type: string): number => blocks.reduce((total, block) => total + (block.type === type ? (block.text ?? block.thinking ?? '').length : 0), 0);

/** The output tokens of a reply that its visible text and its reasoning don't explain. */
export function unaccountedTokens(blocks: readonly ReplyBlock[], usage: { output: number; reasoning?: number | undefined }): number {
  const reasoning = usage.reasoning !== undefined && usage.reasoning > 0 ? usage.reasoning : Math.ceil(characters(blocks, 'thinking') / charactersPerToken);
  return usage.output - reasoning - Math.ceil(characters(blocks, 'text') / charactersPerToken);
}

/** The unaccounted tokens of a reply with no call that was lost, or `undefined` for a reply that was not. */
export function lostTokens(blocks: readonly ReplyBlock[], usage: { output: number; reasoning?: number | undefined }): number | undefined {
  if (blocks.some((block) => block.type === 'toolCall')) return undefined;
  const unaccounted = unaccountedTokens(blocks, usage);
  return characters(blocks, 'text') < shortTextLimit && unaccounted > unaccountedLimit ? unaccounted : undefined;
}

/** What the model is told about its lost reply. */
export function lostHint(tokens: number): string {
  const about = Math.round(tokens / 100) * 100;
  return `Your last reply was lost on the way: the provider produced about ${String(about)} tokens, but no tool call or text reached me. Send it again now, calling the tool directly. If it was a large file, send the content in smaller pieces: one file per reply, under about 150 lines each, giving each file's content as the raw heredoc body of \`fs write\`, not as JSON.`;
}

type CallBlock = { type: string; id?: string; name?: string };

/** A reply's blocks with a call that has a name but no id given one, and a call with no name dropped and counted (ADR 0009, 192). */
export function repairedCalls<Block extends CallBlock>(blocks: readonly Block[]): { blocks: Block[]; broken: number } {
  const kept: Block[] = [];
  let broken = 0;
  for (const block of blocks) {
    if (block.type !== 'toolCall') kept.push(block);
    else if (block.name === undefined || block.name === '') broken += 1;
    else kept.push(block.id === undefined || block.id === '' ? Object.assign({}, block, { id: `call_${randomUUID()}` }) : block);
  }
  return { blocks: kept, broken };
}
