import { z, type Ctx } from '@kvman/sdk';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

// kvman as an OAuth client of one MCP server (plan 08 §8.5, ADR 0020, 8 and 16), over kvcoder's secrets: the client
// registration with the address it was made for, the code verifier of a sign-in under way, and the tokens. A tool
// call refreshes tokens but never sends the person to a browser: that is what a sign-in from the server's row does.

/** A server's sign-in secrets; each started sign-in keeps its own code verifier, under its state (ADR 0056, 7). */
export const oauthSecrets = (server: string) => ({ client: `mcp.${server}.oauth.client`, tokens: `mcp.${server}.oauth.tokens`, verifier: (state: string) => `mcp.${server}.oauth.verifier.${state}` });

// The registration and the tokens carry the server's URL they were made for, and are used only with it (ADR 0056, 6).
const clientSchema = z.object({ redirectUrl: z.string(), serverUrl: z.string(), information: z.looseObject({ client_id: z.string() }) });
const tokensSchema = z.object({ serverUrl: z.string(), tokens: z.looseObject({ access_token: z.string(), token_type: z.string(), refresh_token: z.string().optional() }) });

// What was stored for another URL, or before a URL was kept with it, is as good as absent.
async function stored<Schema extends z.ZodType<{ serverUrl: string }>>(ctx: Ctx, name: string, schema: Schema, serverUrl: string): Promise<z.output<Schema> | undefined> {
  const value = await ctx.secrets.get(name);
  const parsed = value === undefined ? undefined : schema.safeParse(JSON.parse(value));
  return parsed?.success === true && parsed.data.serverUrl === serverUrl ? parsed.data : undefined;
}

/** The redirect address the server's client registration was made for, when there is one for this URL. */
export async function registeredRedirect(ctx: Ctx, server: string, serverUrl: string): Promise<string | undefined> {
  return (await stored(ctx, oauthSecrets(server).client, clientSchema, serverUrl))?.redirectUrl;
}

/** The server's sign-in tokens for this URL: the values a tool's result must never carry out. */
export async function tokenValues(ctx: Ctx, server: string, serverUrl: string): Promise<string[]> {
  const tokens = (await stored(ctx, oauthSecrets(server).tokens, tokensSchema, serverUrl))?.tokens;
  return tokens === undefined ? [] : [tokens.access_token, ...(tokens.refresh_token === undefined ? [] : [tokens.refresh_token])];
}

/** What the client is used for: starting a sign-in, exchanging its code, or a call that may only refresh tokens. */
export type SignIn =
  | { redirectUrl: string; step: 'start'; state: string; open(authorizationUrl: URL): void }
  | { redirectUrl: string; step: 'finish'; state: string }
  | { redirectUrl: string; step: 'call' };

export function oauthProvider(ctx: Ctx, server: string, serverUrl: string, signIn: SignIn): OAuthClientProvider {
  const names = oauthSecrets(server);
  const verifier = signIn.step === 'call' ? undefined : names.verifier(signIn.state);
  return {
    redirectUrl: signIn.redirectUrl,
    clientMetadata: { client_name: 'kvman', redirect_uris: [signIn.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    ...(signIn.step === 'start' ? { state: () => signIn.state } : {}),
    // A registration made for another address (kvman on another port) can't be used with this one.
    clientInformation: async () => {
      const client = await stored(ctx, names.client, clientSchema, serverUrl);
      return client?.redirectUrl === signIn.redirectUrl ? (client.information as OAuthClientInformationMixed) : undefined;
    },
    // A call never registers kvman with a server: only a sign-in the person started does.
    ...(signIn.step === 'call' ? {} : { saveClientInformation: (information: OAuthClientInformationMixed) => ctx.secrets.set(names.client, JSON.stringify({ redirectUrl: signIn.redirectUrl, serverUrl, information })) }),
    tokens: async () => (await stored(ctx, names.tokens, tokensSchema, serverUrl))?.tokens as OAuthTokens | undefined,
    saveTokens: (tokens: OAuthTokens) => ctx.secrets.set(names.tokens, JSON.stringify({ serverUrl, tokens })),
    saveCodeVerifier: async (value) => {
      if (signIn.step === 'start' && verifier !== undefined) await ctx.secrets.set(verifier, value);
    },
    codeVerifier: async () => {
      const value = verifier === undefined ? undefined : await ctx.secrets.get(verifier);
      if (value === undefined) throw new UnauthorizedError('No sign-in is under way.');
      return value;
    },
    redirectToAuthorization: (authorizationUrl) => {
      if (signIn.step !== 'start') throw new UnauthorizedError('The person must sign in.');
      signIn.open(authorizationUrl);
    },
    // What the server no longer takes is forgotten, so the next attempt doesn't offer it again.
    invalidateCredentials: async (scope) => {
      if (scope === 'all' || scope === 'tokens') await ctx.secrets.delete(names.tokens);
      if (scope === 'all' || scope === 'client') await ctx.secrets.delete(names.client);
      if ((scope === 'all' || scope === 'verifier') && verifier !== undefined) await ctx.secrets.delete(verifier);
    },
  };
}
