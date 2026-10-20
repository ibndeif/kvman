import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { useKvcoder } from './kvcoder-kernel.ts';
import { fsCall, runs, says, toolResults, type RunCallSpec } from './model-script.ts';
import { newSession } from './turns.ts';

/**
 * One reply of calls through a real turn, in a workspace that `prepare` filled first: the kernel, the session, and what
 * the calls returned to the model, and the outputs their `details` keep for the card (ADR 0097, 2). The chat first
 * reads the files in `seen`, which it must before it changes them (ADR 0053, 2).
 */
// A result whose call never ran keeps no details; its output is then empty.
const storedOutput = z.object({ details: z.object({ output: z.string() }).nullable().catch(null) });

export function useLooked() {
  const kvcoder = useKvcoder();
  const looked = async (prepare: (folder: string) => void, calls: readonly RunCallSpec[], settings: Record<string, string> = {}, seen: readonly string[] = []) => {
    const { kernel, fake } = await kvcoder.start({ settings });
    prepare(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    fake.reply(...(seen.length === 0 ? [] : [runs(...seen.map((file) => fsCall('read', { path: file })))]), runs(...calls), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 200 });
    const outputs = messages.filter((message) => message.kind === 'toolResult').map((message) => storedOutput.parse(message.content).details?.output ?? '').slice(seen.length);
    return { kernel, fake, sessionId, results: toolResults(fake).slice(seen.length), outputs };
  };
  /** Writes a file into the workspace a `prepare` got. */
  const write = (folder: string, name: string, content: string): void => writeFileSync(path.join(folder, name), content);
  return Object.assign(looked, { write });
}
