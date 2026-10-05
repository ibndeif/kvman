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

/** The server's tool by name, or `NOT_FOUND` naming the tools it has. */
export function toolNamed(server: string, tools: readonly McpTool[], name: string): McpTool {
  const found = tools.find((tool) => tool.name === name);
  if (found !== undefined) return found;
  throw notFound(`${server} has no tool ${name}. Its tools are: ${tools.map((tool) => tool.name).join(', ')}.`, { server, tool: name });
}

const blockSchema = z.looseObject({ type: z.string(), text: z.string().optional() });
const resultSchema = z.looseObject({ content: z.array(blockSchema).default([]), isError: z.boolean().optional() });

/** A tool's result: its text blocks joined by a blank line, a block of another kind as `[<kind> omitted]`, and whether the tool says it failed. */
export function resultText(result: unknown): { text: string; isError: boolean } {
  const { content, isError } = resultSchema.parse(result);
  const text = content.map((block) => (block.type === 'text' && block.text !== undefined ? block.text : `[${block.type} omitted]`)).join('\n\n');
  return { text, isError: isError === true };
}
