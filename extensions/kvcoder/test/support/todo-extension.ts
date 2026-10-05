// The `todo` fixture extension: a commands connector, sections, session handlers, and a file writer, registered from
// its `kernel.started` handler as a real extension would (plan 08 §8.4). `todo.item.wait` waits at a BroadcastChannel
// gate, so a test sees calls run at the same time.

export const gateCode = `
  const gate = (name: string) => new Promise<void>((resolve) => {
    const channel = new BroadcastChannel(name);
    channel.onmessage = () => { channel.close(); resolve(); };
    const ready = new BroadcastChannel(name + ':ready');
    ready.postMessage('ready');
    ready.close();
  });
`;

export const todoEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
${gateCode}
  const items = () => ctx.store.collection('items', z.object({ text: z.string() }));
  ctx.registerCommand('todo.item.add', { description: 'Adds a todo item.', input: z.object({ text: z.string() }), output: z.object({ id: z.string(), text: z.string() }), public: true,
    handle: async ({ text }) => { const item = await items().insert({ text }); return { id: item.id, text: item.text }; } });
  ctx.registerCommand('todo.item.wait', { description: 'Waits at a gate, then adds an item.', input: z.object({ gate: z.string(), text: z.string() }), output: z.object({ text: z.string() }), public: true,
    handle: async ({ gate: name, text }) => { await gate(name); await items().insert({ text }); return { text }; } });
  ctx.registerCommand('todo.item.fail', { description: 'Always fails.', input: z.object({}), output: z.object({}), public: true, handle: () => { throw ctx.problem('todo/BROKEN', { reason: 'test' }); } });
  ctx.registerQuery('todo.item.list', { description: 'Lists the items.', input: z.object({}), output: z.array(z.object({ text: z.string() })), public: true,
    handle: async () => (await items().find({}, { limit: 100 })).map(({ text }) => ({ text })) });
  ctx.registerCommand('todo.private', { description: 'A private command.', input: z.object({}), output: z.object({}), handle: () => ({}) });
  ctx.registerCommand('todo.file.write', { description: 'Writes a file.', input: z.object({ name: z.string(), base64: z.string(), type: z.string() }), output: z.object({ id: z.string() }), public: true,
    handle: async ({ name, base64, type }) => ({ id: (await ctx.files.write(name, Buffer.from(base64, 'base64'), type)).id }) });
  ctx.registerQuery('todo.file.read', { description: 'Reads a file as text.', input: z.object({ id: z.string() }), output: z.object({ name: z.string(), text: z.string() }), public: true,
    handle: async ({ id }) => ({ name: (await ctx.files.get(id)).name, text: (await ctx.files.read(id)).toString('utf8') }) });
  ctx.registerCommand('todo.file.unlink', { description: 'Deletes a file.', input: z.object({ id: z.string() }), output: z.object({}), public: true, handle: async ({ id }) => { await ctx.files.unlink(id); return {}; } });
  ctx.registerCommand('todo.seen', { description: 'Records a session point.', input: z.record(z.string(), z.json()), output: z.object({}), public: true,
    handle: async (input) => { await ctx.store.collection('seen', z.object({ input: z.json() })).insert({ input }); return {}; } });
  ctx.registerQuery('todo.seen.list', { description: 'Lists recorded session points.', input: z.object({}), output: z.array(z.json()), public: true,
    handle: async () => (await ctx.store.collection('seen', z.object({ input: z.json() })).find({}, { limit: 100 })).map((entry) => entry.input) });
  ctx.registerCommand('todo.inject', { description: 'Injects a message.', input: z.object({ sessionId: z.string(), text: z.string() }), output: z.object({}), public: true,
    handle: async (input) => { await ctx.exec('kvcoder.message.inject', input); return {}; } });
  ctx.registerCommand('todo.react', { description: 'Injects a message from a session handler.', input: z.object({ sessionId: z.string() }), output: z.object({}), public: true,
    handle: async ({ sessionId }) => { await ctx.exec('kvcoder.message.inject', { sessionId, text: 'from a handler' }); return {}; } });
  ctx.registerCommand('todo.process.start', { description: 'Starts a process that prints and exits by itself.', input: z.object({ name: z.string() }), output: z.object({}), public: true,
    handle: async ({ name }) => { await ctx.processes.start(name, { command: 'sh', args: ['-c', 'echo other; exit 4'] }); return {}; } });
  ctx.registerHandler('kernel.started', {
    description: 'Registers the todo connector with kvcoder.',
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', {
        name: 'todo',
        description: 'Keep a todo list.',
        commands: [
          { name: 'add', command: 'todo.item.add', examples: [{ description: 'Add an item', input: { text: "it's done" } }] },
          { name: 'wait', command: 'todo.item.wait' },
          { name: 'fail', command: 'todo.item.fail' },
          { name: 'list', command: 'todo.item.list' },
        ],
      });
    },
  });
};
`;
