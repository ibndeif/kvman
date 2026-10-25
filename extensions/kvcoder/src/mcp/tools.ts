import { z } from '@kvman/sdk';
import { notFound } from '../problems.ts';
import type { Connection } from './connect.ts';

// A server's tools and a call's result as the model reads them (plan 08 §8.5, ADR 0020, 10 and 16).

const toolSchema = z.object({ name: z.string(), description: z.string().optional(), inputSchema: z.json() });

export type McpTool = z.output<typeof toolSchema>;

/** Every tool of the server, through all of its pages. */
export async function listTools({ client, request }: Connection): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor === undefined ? {} : { cursor }, request);
    tools.push(...z.array(toolSchema).parse(page.tools));
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}

const nearLimit = 5;

/** The tools whose names start with, contain, or are contained in the asked name, the closest first (ADR 0102, 8). */
export function nearNames(names: readonly string[], asked: string): string[] {
  const wanted = asked.toLowerCase();
  const rank = (name: string): number => {
    const lower = name.toLowerCase();
    if (lower.startsWith(wanted)) return 0;
    if (lower.includes(wanted)) return 1;
    return wanted.includes(lower) ? 2 : 3;
  };
  return names.filter((name) => rank(name) < 3).sort((first, second) => rank(first) - rank(second)).slice(0, nearLimit);
}

/** The server's tool by name, or `NOT_FOUND` naming first the near ones, then the tools it has. */
export function toolNamed(server: string, tools: readonly McpTool[], name: string): McpTool {
  const found = tools.find((tool) => tool.name === name);
  if (found !== undefined) return found;
  const names = tools.map((tool) => tool.name);
  const near = nearNames(names, name);
  const guess = near.length === 0 ? '' : ` Did you mean ${near.join(', ')}?`;
  throw notFound(`${server} has no tool ${name}.${guess} Its tools are: ${names.join(', ')}.`, { server, tool: name });
}

const blockSchema = z.looseObject({ type: z.string(), text: z.string().optional() });
const resultSchema = z.looseObject({ content: z.array(blockSchema).default([]), isError: z.boolean().optional() });

/** A tool's result: its text blocks joined by a blank line, a block of another kind as `[<kind> omitted]`, and whether the tool says it failed. */
export function resultText(result: unknown): { text: string; isError: boolean } {
  const { content, isError } = resultSchema.parse(result);
  const text = content.map((block) => (block.type === 'text' && block.text !== undefined ? block.text : `[${block.type} omitted]`)).join('\n\n');
  return { text, isError: isError === true };
}
