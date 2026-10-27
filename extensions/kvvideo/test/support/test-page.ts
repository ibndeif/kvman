import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach } from 'vitest';

// A local app to record (M5.2): a page with a link, a field, a Save button that posts what was typed, a long list, and
// a box that appears late; a second page; a page that fetches from another port when it loads; and a server that
// counts the requests it gets. Every server closes after its test.

const home = `<!doctype html><html><body style="font:16px sans-serif">
<a id="next" href="/second">Next</a>
<input id="name" aria-label="Name">
<button id="save" onclick="fetch('/saved', { method: 'POST', body: document.getElementById('name').value }).then(() => { document.getElementById('status').textContent = 'Saved'; })">Save</button>
<p id="status"></p>
<ul>${Array.from({ length: 80 }, (_, index) => `<li>Row ${String(index + 1)}</li>`).join('')}</ul>
<div id="late" hidden>Late</div>
<script>setTimeout(() => { document.getElementById('late').hidden = false; }, 300);</script>
</body></html>`;

const second = '<!doctype html><html><body><h1>Second</h1></body></html>';

const fetching = (port: string): string => `<!doctype html><html><body><p id="answer">waiting</p>
<script>fetch('http://127.0.0.1:${port}/ping').then(() => { document.getElementById('answer').textContent = 'reached'; }, () => { document.getElementById('answer').textContent = 'blocked'; });</script>
</body></html>`;

export type TestServer = { url: string; port: number; saved: string[]; requests: string[] };

async function listen(server: Server, servers: Server[]): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

export function useTestPages(): { app(): Promise<TestServer>; counter(): Promise<TestServer>; closedPort(): Promise<number> } {
  const servers: Server[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const serve = async (answer: (path: string, body: string, world: TestServer) => string): Promise<TestServer> => {
    const world: TestServer = { url: '', port: 0, saved: [], requests: [] };
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        world.requests.push(request.url ?? '');
        response.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
        response.end(answer(request.url ?? '/', body, world));
      });
    });
    world.port = await listen(server, servers);
    world.url = `http://127.0.0.1:${String(world.port)}/`;
    return world;
  };
  return {
    app: () =>
      serve((path, body, world) => {
        if (path === '/saved') world.saved.push(body);
        if (path === '/second') return second;
        if (path.startsWith('/fetch/')) return fetching(path.slice('/fetch/'.length));
        return home;
      }),
    counter: () => serve(() => 'pong'),
    closedPort: async () => {
      const server = createServer();
      const port = await listen(server, []);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return port;
    },
  };
}
