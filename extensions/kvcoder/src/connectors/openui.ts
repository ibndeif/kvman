import { z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `openui` connector (plan 08 §8.5, ADR 0124, 5, 12, 13): UI the agent draws for the person in a reply or an
// artifact. Its one command reads kvwebui's OpenUI reference, by place and by group, so the reference is in a chat's
// context only once the agent wants it.

/** What the prompt's index says the connector is for. */
export const openuiDescription =
  "Draw UI for the person: cards, choices, follow-up suggestions, forms, and buttons, in a reply (a fenced openui block) or in an artifact (format openui). A press sends its text as the person's next message. Before the chat's first one, read `openui guide` for the place, then the groups you will use.";

const payloads = {
  guide: z.strictObject({
    place: z.enum(['reply', 'artifact']).describe('Where the UI goes: a fenced openui block in a reply, or an artifact with format openui.'),
    groups: z.array(z.string().min(1)).min(1).max(13).describe('Component groups to read in full, such as "Forms" or "Buttons"; left out, the index: the rules and every group with its components.').exactOptional(),
  }),
};

export const openuiCommands = {
  guide: { registration: 'kvcoder.openui.guide.get', description: "Reads kvman's OpenUI reference: the index of a place, or the signatures and notes of some of its groups.", payload: payloads.guide, asks: false, bounded: true },
} satisfies Record<string, ConnectorCommand>;

const indexTopics = { reply: 'openui-chat', artifact: 'openui' } as const;
const pageSchema = z.object({ topic: z.string(), title: z.string(), markdown: z.string() });
const listSchema = z.array(z.object({ topic: z.string(), title: z.string() }));

// A place's group pages, by group name: kvwebui's pages `<index>-<group>`; the chat library's pages also start with
// `openui-`, so the full library's leave them out.
function groupPages(place: 'reply' | 'artifact', pages: readonly { topic: string; title: string }[]): Map<string, string> {
  const index = indexTopics[place];
  const own = pages.filter((page) => page.topic.startsWith(`${index}-`) && (place === 'reply' || !page.topic.startsWith('openui-chat')));
  return new Map(own.map((page) => [page.title, page.topic]));
}

async function guide(ctx: Ctx, place: 'reply' | 'artifact', groups: readonly string[] | undefined): Promise<{ guide: string }> {
  const read = async (topic: string): Promise<string> => pageSchema.parse(await ctx.exec('kvwebui.docs.get', { topic })).markdown;
  if (groups === undefined) return { guide: await read(indexTopics[place]) };
  const pages = groupPages(place, listSchema.parse(await ctx.exec('kvwebui.docs.list', {})));
  const unknown = groups.find((group) => !pages.has(group));
  if (unknown !== undefined) throw invalid(`There is no group ${unknown} for ${place === 'reply' ? 'a reply' : 'an artifact'}. The groups are: ${[...pages.keys()].join(', ')}.`);
  const markdown = await Promise.all(groups.map((group) => read(pages.get(group) ?? '')));
  return { guide: markdown.join('\n') };
}

export function registerOpenuiConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.openui.guide.get', {
    description: openuiCommands.guide.description,
    input: callInput(payloads.guide),
    output: z.object({ guide: z.string() }),
    handle: ({ payload }) => guide(ctx, payload.place, payload.groups),
  });
}
