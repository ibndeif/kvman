import type { Ctx } from '@kvman/sdk';
import type { McpServer } from './servers.ts';

// A server's secret values (plan 08 §8.5, ADR 0020, 6): kvcoder's secrets `mcp.<server>.env.<VARIABLE>` and
// `mcp.<server>.header.<Header>`. They go to the server and nowhere else.

/** The values a server is given, by variable or header name; a name without a secret is left out. */
export async function serverSecrets(ctx: Ctx, server: McpServer): Promise<Record<string, string>> {
  const [kind, names] = 'command' in server ? (['env', server.env] as const) : (['header', server.headers] as const);
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = await ctx.secrets.get(`mcp.${server.name}.${kind}.${name}`);
    if (value !== undefined) values[name] = value;
  }
  return values;
}

/** A text with every one of the values replaced by `***`, so a server's failure can't carry a secret out. */
export function withoutSecrets(text: string, values: Readonly<Record<string, string>>): string {
  return Object.values(values)
    .filter((value) => value !== '')
    .reduce((cleaned, value) => cleaned.replaceAll(value, '***'), text);
}
