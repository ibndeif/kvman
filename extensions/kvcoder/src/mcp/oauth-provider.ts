import { z, type Ctx } from '@kvman/sdk';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

// kvman as an OAuth client of one MCP server (plan 08 §8.5, ADR 0020, 8 and 16), over kvcoder's secrets: the client
// registration with the address it was made for, the code verifier of a sign-in under way, and the tokens. A tool
// call refreshes tokens but never sends the person to a browser: that is what a sign-in from the server's row does.

/** A server's sign-in secrets. */
export const oauthSecrets = (server: string) => ({ client: `mcp.${server}.oauth.client`, verifier: `mcp.${server}.oauth.verifier`, tokens: `mcp.${server}.oauth.tokens` });

const clientSchema = z.object({ redirectUrl: z.string(), information: z.looseObject({ client_id: z.string() }) });
const tokensSchema = z.looseObject({ access_token: z.string(), token_type: z.string() });

async function stored<Schema extends z.ZodType>(ctx: Ctx, name: string, schema: Schema): Promise<z.output<Schema> | undefined> {
  const value = await ctx.secrets.get(name);
  return value === undefined ? undefined : schema.parse(JSON.parse(value));
}

/** The redirect address the server's client registration was made for, when there is one. */
export async function registeredRedirect(ctx: Ctx, server: string): Promise<string | undefined> {
  return (await stored(ctx, oauthSecrets(server).client, clientSchema))?.redirectUrl;
}

/** What the client is used for: starting a sign-in, exchanging its code, or a call that may only refresh tokens. */
export type SignIn =
  | { redirectUrl: string; step: 'start'; state: string; open(authorizationUrl: URL): void }
  | { redirectUrl: string; step: 'finish' }
  | { redirectUrl: string; step: 'call' };

export function oauthProvider(ctx: Ctx, server: string, signIn: SignIn): OAuthClientProvider {
  const names = oauthSecrets(server);
  return {
    redirectUrl: signIn.redirectUrl,
    clientMetadata: { client_name: 'kvman', redirect_uris: [signIn.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    ...(signIn.step === 'start' ? { state: () => signIn.state } : {}),
    // A registration made for another address (kvman on another port) can't be used with this one.
    clientInformation: async () => {
      const client = await stored(ctx, names.client, clientSchema);
      return client?.redirectUrl === signIn.redirectUrl ? (client.information as OAuthClientInformationMixed) : undefined;
    },
    // A call never registers kvman with a server: only a sign-in the person started does.
    ...(signIn.step === 'call' ? {} : { saveClientInformation: (information: OAuthClientInformationMixed) => ctx.secrets.set(names.client, JSON.stringify({ redirectUrl: signIn.redirectUrl, information })) }),
    tokens: async () => (await stored(ctx, names.tokens, tokensSchema)) as OAuthTokens | undefined,
    saveTokens: (tokens) => ctx.secrets.set(names.tokens, JSON.stringify(tokens)),
    saveCodeVerifier: async (verifier) => {
      if (signIn.step === 'start') await ctx.secrets.set(names.verifier, verifier);
    },
    codeVerifier: async () => {
      const verifier = await ctx.secrets.get(names.verifier);
      if (verifier === undefined) throw new UnauthorizedError('No sign-in is under way.');
      return verifier;
    },
    redirectToAuthorization: (authorizationUrl) => {
      if (signIn.step !== 'start') throw new UnauthorizedError('The person must sign in.');
      signIn.open(authorizationUrl);
    },
    // What the server no longer takes is forgotten, so the next attempt doesn't offer it again.
    invalidateCredentials: async (scope) => {
      if (scope === 'all' || scope === 'tokens') await ctx.secrets.delete(names.tokens);
      if (scope === 'all' || scope === 'client') await ctx.secrets.delete(names.client);
      if (scope === 'all' || scope === 'verifier') await ctx.secrets.delete(names.verifier);
    },
  };
}
