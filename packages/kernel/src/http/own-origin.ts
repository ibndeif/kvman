// kvman answers only its own pages and local programs (plan 04 §4.2, ADR 0009, 36): the Host is 127.0.0.1 or localhost
// on kvman's port, and an Origin, when a browser sends one, is exactly that same Host over http. This keeps websites
// out, including through DNS rebinding.
export function isOwnOrigin(host: string | undefined, origin: string | undefined, port: number): boolean {
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  return origin === undefined || origin === `http://${host}`;
}
