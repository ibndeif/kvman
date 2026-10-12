import type { Ctx } from '@kvman/sdk';
import { tokenValues } from './oauth-provider.ts';
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

/** Every secret value kvman holds for a server: what it is given, and its sign-in tokens (ADR 0056, 9). */
export async function knownSecrets(ctx: Ctx, server: McpServer): Promise<Record<string, string>> {
  const tokens = 'url' in server ? await tokenValues(ctx, server.name, server.url) : [];
  return { ...(await serverSecrets(ctx, server)), ...Object.fromEntries(tokens.map((value, index) => [`token ${String(index)}`, value])) };
}

/** A text with every one of the values replaced by `***`, so a server's failure can't carry a secret out. */
export function withoutSecrets(text: string, values: Readonly<Record<string, string>>): string {
  return Object.values(values)
    .filter((value) => value !== '')
    .reduce((cleaned, value) => cleaned.replaceAll(value, '***'), text);
}
