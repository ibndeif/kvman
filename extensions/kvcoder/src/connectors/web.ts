import { z, type Ctx } from '@kvman/sdk';
import { fetchPage, networkTransport } from '../web/fetch-page.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `web` connector (plan 08 §8.5, ADR 0095): a page on the web, read as Markdown or text.

/** What the prompt's index says the connector is for. */
export const webDescription =
  "Read a page on the web, such as a library's current documentation, as Markdown or text. Use it instead of curl or wget. It never reaches a private or local address, and the person is asked before the first page from each site.";

const payloads = {
  fetch: z.strictObject({ url: z.string().min(1).describe('The http or https address of the page.') }),
};

export const webCommands = {
  fetch: { registration: 'kvcoder.web.page.get', description: 'Reads a page on the web as Markdown or text.', payload: payloads.fetch, asks: false, bounded: true },
} satisfies Record<string, ConnectorCommand>;

export function registerWebConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.web.page.get', {
    description: webCommands.fetch.description,
    input: callInput(payloads.fetch),
    output: z.object({ url: z.string(), status: z.number().int(), type: z.string(), content: z.string() }),
    timeoutMs: 40_000,
    handle: ({ payload }) => fetchPage(payload.url, networkTransport, ctx.job.signal),
  });
}
