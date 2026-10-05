import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { fixtureServer } from './mcp-fixture-server.ts';

// An MCP server that needs a sign-in, with its authorization server, on 127.0.0.1: metadata, registration, an
// authorization address that sends the browser straight back with a code, and a token endpoint that checks the PKCE
// verifier and refreshes. It records what it was asked, so a test can say what kvman did and didn't do.

export type OAuthFixture = {
  url: string;
  /** Every request's method and path, in order. */
  requests: string[];
  /** The `Authorization` headers the MCP endpoint received. */
  bearers: string[];
  /** What visiting an authorization address does: records its challenge and gives the code. */
  approve(authorizationUrl: string): string;
  /** Makes the server stop taking the current access token; `refresh: false` makes it refuse the refresh token too. */
  expire(options?: { refresh: boolean }): void;
  close(): Promise<void>;
};

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const json = (response: ServerResponse, status: number, value: unknown): void => void response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));

export async function startOAuthFixture(options: { registration?: boolean } = {}): Promise<OAuthFixture> {
  const requests: string[] = [];
  const bearers: string[] = [];
  const challenges = new Map<string, string>();
  let issued = 0;
  let access = '';
  let refresh = '';
  let refreshable = true;
  let origin = '';

  const approve = (authorizationUrl: string): string => {
    const code = `code-${challenges.size + 1}`;
    challenges.set(code, new URL(authorizationUrl).searchParams.get('code_challenge') ?? '');
    return code;
  };

  const issue = (response: ServerResponse): void => {
    issued += 1;
    access = `access-${issued}-SECRET`;
    refresh = `refresh-${issued}-SECRET`;
    json(response, 200, { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh });
  };

  async function token(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const form = new URLSearchParams(await body(request));
    if (form.get('grant_type') === 'refresh_token') return refreshable && form.get('refresh_token') === refresh ? issue(response) : json(response, 400, { error: 'invalid_grant' });
    const challenge = challenges.get(form.get('code') ?? '');
    const verified = challenge !== undefined && createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === challenge;
    challenges.delete(form.get('code') ?? '');
    return verified ? issue(response) : json(response, 400, { error: 'invalid_grant' });
  }

  const metadata = () => ({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    ...(options.registration === false ? {} : { registration_endpoint: `${origin}/register` }),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', origin);
    requests.push(`${request.method ?? ''} ${url.pathname}`);
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json(response, 200, { resource: `${origin}/mcp`, authorization_servers: [origin] });
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) return json(response, 200, metadata());
    if (url.pathname === '/register') return void body(request).then((sent) => json(response, 201, { ...(JSON.parse(sent) as object), client_id: 'client-1' }));
    if (url.pathname === '/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri') ?? '');
      back.searchParams.set('code', approve(url.href));
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      return void response.writeHead(302, { location: back.href }).end();
    }
    if (url.pathname === '/token') return void token(request, response);
    if (url.pathname !== '/mcp') return json(response, 404, {});
    bearers.push(request.headers.authorization ?? '');
    if (access === '' || request.headers.authorization !== `Bearer ${access}`) {
      return void response.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` }).end();
    }
    const transport = new StreamableHTTPServerTransport({});
    response.on('close', () => void transport.close());
    return void fixtureServer()
      .connect(transport as Transport)
      .then(() => transport.handleRequest(request, response));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: `${origin}/mcp`,
    requests,
    bearers,
    approve,
    expire: (expiry = { refresh: true }) => {
      access = 'expired';
      refreshable = expiry.refresh;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
