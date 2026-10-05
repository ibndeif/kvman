# Agents and tools: plain functions, no jobs

This page is for anyone whose extension runs an agent of its own: a loop that calls a model and lets it use tools. When you finish, you can give your agent tools that are ordinary functions, know where they run, and know when a tool should be a command instead.

## A tool is a function

kvai gives you the model call, `kvai.complete`, and nothing else: no agent, no loop, no tool runner. The model's answer names the tools it wants, and **your handler runs them**. So a tool can be any function in your extension. It needs no command, no query, and no registration with the kernel:

- It runs inside your handler, on the worker thread that runs your job. The kernel's main thread never runs extension code, and a function tool doesn't change that.
- It costs a function call: no job, no row in the database, no retry, no timeout of its own.
- It is private to your extension. Nothing else can call it, and it doesn't appear in `kernel.extensions.list`.

Use a function for work that belongs to one turn of your agent: a calculation, a lookup in memory, formatting, reading your own store through `ctx.store`. Make it a **command** instead when another extension, the web app, or kvman's own agent should call it, when it should be queued or scheduled (`ctx.execAsync`, `ctx.schedule`), or when it needs its own retries and timeout ([jobs.md](jobs.md)).

## The three parts of a tool

1. **What the model sees**: a name, a description, and `parameters` as JSON Schema. Build the schema from zod with `z.toJSONSchema`, and give each field a `.describe()`.
2. **Checking**: the model's arguments are untrusted input. Parse them with the same zod schema before you run anything.
3. **The function**: takes the parsed input and returns JSON. The result goes back to the model as a `toolResult` message.

## The whole extension

This extension answers a question with a model that may call `calculate`. It is complete: put it in `src/index.ts` of a project made with `kvman-new`, with the namespace `calc`.

```ts
import { z, type Ctx } from '@kvman/sdk';

type Tool = { description: string; parameters: unknown; call(args: unknown): unknown };

// A tool: what the model reads, and a plain function behind a zod check. Nothing is registered with the kernel.
function tool<Schema extends z.ZodType>(description: string, input: Schema, run: (input: z.output<Schema>) => unknown): Tool {
  return { description, parameters: z.toJSONSchema(input), call: (args) => run(input.parse(args)) };
}

const tools: Record<string, Tool> = {
  calculate: tool(
    'Adds two numbers.',
    z.object({ a: z.number().describe('The first number.'), b: z.number().describe('The second number.') }),
    ({ a, b }) => ({ sum: a + b }),
  ),
};

const callSchema = z.object({ type: z.literal('toolCall'), id: z.string(), name: z.string(), arguments: z.record(z.string(), z.unknown()) });
const textSchema = z.object({ type: z.literal('text'), text: z.string() });
const answerSchema = z.object({ message: z.looseObject({ content: z.array(z.looseObject({ type: z.string() })) }) });

// Runs one of the model's calls: the tool's JSON, or what was wrong, for the model to read and correct.
function resultOf(call: z.output<typeof callSchema>): { text: string; isError: boolean } {
  const found = tools[call.name];
  if (found === undefined) return { text: `There is no tool ${call.name}.`, isError: true };
  try {
    return { text: JSON.stringify(found.call(call.arguments)), isError: false };
  } catch (error) {
    if (error instanceof z.ZodError) return { text: z.prettifyError(error), isError: true };
    throw error;
  }
}

const maxSteps = 8;

export default (ctx: Ctx): void => {
  ctx.registerCommand('calc.question.answer', {
    description: 'Answers a question with a model that may use the calculate tool.',
    input: z.object({ question: z.string().describe('The question to answer.') }),
    output: z.object({ answer: z.string() }),
    public: true,
    retries: 0,
    handle: async ({ question }) => {
      const offered = Object.entries(tools).map(([name, { description, parameters }]) => ({ name, description, parameters }));
      const messages: unknown[] = [{ role: 'user', content: question, timestamp: Date.now() }];
      for (let step = 0; step < maxSteps; step += 1) {
        const { message } = answerSchema.parse(await ctx.exec('kvai.complete', { messages, tools: offered }));
        messages.push(message);
        const calls = message.content.flatMap((block) => (block.type === 'toolCall' ? [callSchema.parse(block)] : []));
        if (calls.length === 0) return { answer: message.content.flatMap((block) => (block.type === 'text' ? [textSchema.parse(block).text] : [])).join('') };
        for (const call of calls) {
          const result = resultOf(call);
          messages.push({ role: 'toolResult', toolCallId: call.id, toolName: call.name, content: [{ type: 'text', text: result.text }], isError: result.isError, timestamp: Date.now() });
        }
      }
      throw ctx.problem('calc/TOO_MANY_STEPS', { steps: maxSteps });
    },
  });
};
```

What happens when someone calls `calc.question.answer { question: "add 3 and 4" }`:

1. The handler sends the question and the tool list to `kvai.complete` (a nested job, on the same worker).
2. The model answers with a `toolCall` block: `calculate { a: 3, b: 4 }`. kvai returns tool calls; it never runs them.
3. The handler finds `calculate`, checks the arguments, and calls the function, right there. The result `{"sum":7}` is added as a `toolResult` message.
4. The next `kvai.complete` call sees the result, and the model answers in text. The handler returns it.

## Rules a tool still follows

- **Work ends with its job.** A tool that starts a timer or an unawaited promise outlives your handler. Await what it starts, and pass `ctx.job.signal` to anything that can be cancelled.
- **No state between jobs.** Any job may run on any worker, so a tool that remembers something keeps it in `ctx.store`, not in a variable.
- **Bound the loop.** Stop after a fixed number of steps, as the example does, and keep your command's `timeoutMs` in mind (ten minutes by default).
- **A long turn should be an async job.** Start it with `ctx.execAsync`, or let the web app call it with `async: true`, and stream text with the deltas kvai sends through your job's progress ([http-api.md](http-api.md)).
- **Errors for the model are results; errors for you are thrown.** Bad arguments go back to the model as an error result it can correct. A bug should throw, so the job fails and is logged.

## Giving kvman's own agent a tool

kvcoder's agent can't call a function of yours, since it lives in another extension. Give it a **connector** instead: register a public command and name it in `kvcoder.connector.register` ([connectors.md](connectors.md)). The same function can serve both: call it from your own loop, and wrap it in a command for the connector.

## Testing

Load your extension beside kvai in a test kernel, add the testkit's scripted model server as a provider, and script the model's replies ([testing.md](testing.md)):

```ts
fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'calculate', arguments: { a: 3, b: 4 } } }] }, { chunks: [{ text: '7' }] });
expect(await kernel.exec('calc.question.answer', { question: 'add 3 and 4' })).toEqual({ answer: '7' });
```

## Next

- [jobs.md](jobs.md)
- [connectors.md](connectors.md)
- [testing.md](testing.md)
