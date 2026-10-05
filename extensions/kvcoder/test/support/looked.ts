import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { useKvcoder } from './kvcoder-kernel.ts';
import { runs, says, toolResults, type RunCallSpec } from './model-script.ts';
import { newSession } from './turns.ts';

/** One reply of calls through a real turn, in a workspace that `prepare` filled first: the kernel, the session, and what the calls returned. */
export function useLooked() {
  const kvcoder = useKvcoder();
  const looked = async (prepare: (folder: string) => void, calls: readonly RunCallSpec[], settings: Record<string, string> = {}) => {
    const { kernel, fake } = await kvcoder.start({ settings });
    prepare(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    fake.reply(runs(...calls), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    return { kernel, fake, sessionId, results: toolResults(fake) };
  };
  /** Writes a file into the workspace a `prepare` got. */
  const write = (folder: string, name: string, content: string): void => writeFileSync(path.join(folder, name), content);
  return Object.assign(looked, { write });
}
