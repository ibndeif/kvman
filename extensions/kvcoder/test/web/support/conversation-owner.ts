import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { vi } from 'vitest';
import { useConversation, type Conversation } from '../../../web/src/use-conversation.ts';
import { createFakeKvman } from './fake-kvman.ts';
import { serve, session, turn, user, type World } from './fixtures.ts';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

export async function ownerWorld(initial: Partial<World> = {}) {
  const fake = createFakeKvman();
  const world: World = { found: session({ status: 'running', stepJobId: 'j1' }), messages: [user('go')], omitted: 0, turns: [turn()], ...initial };
  serve(fake, world);
  const id = ref<string | undefined>('s1');
  const attached: string[] = [];
  const original = fake.kvman.stream;
  fake.kvman.stream = jobId => { attached.push(jobId); return original(jobId); };
  const follow = vi.fn(async (_jobId: string) => undefined);
  fake.kvman.follow = follow;
  const failed = vi.fn((_error: unknown) => undefined);
  let captured: Conversation | undefined;
  const view = mount(defineComponent({ setup() { captured = useConversation(fake.kvman, () => id.value, failed); return () => h('div'); } }));
  await flushPromises();
  const chat = captured;
  if (chat === undefined) throw new Error('Expected mounted conversation');
  const close = async () => {
    if (view.exists()) view.unmount();
    for (const jobId of new Set(attached)) fake.end(jobId);
    await flushPromises();
  };
  return { fake, world, id, attached, follow, failed, chat, view, close };
}

export type OwnerWorld = Awaited<ReturnType<typeof ownerWorld>>;
export async function withOwner(check: (world: OwnerWorld) => Promise<void>, initial: Partial<World> = {}): Promise<void> {
  const world = await ownerWorld(initial);
  try { await check(world); } finally { await world.close(); }
}
