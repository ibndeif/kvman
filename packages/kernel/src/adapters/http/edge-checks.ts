// What the edge checks read from a request (12 §12.3, §12.8).
export type EdgeRequest = {
  method: string;
  host: string | undefined;
  origin: string | undefined;
  fetchSite: string | undefined;
  eventStream: boolean;
};

function servedOrigins(port: number): string[] {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

function isRead(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

// 12 §12.8: the Host must be served (no DNS rebinding); a request that changes something must name a served Origin
// when it has one (browsers always do; the CLI sends none); Sec-Fetch-Site, when present, must be same-origin, or none
// for a read; the event stream accepts only same-origin fetches (12 §12.3). Returns why a request is refused.
export function edgeRefusal(request: EdgeRequest, port: number): string | undefined {
  if (request.host !== `127.0.0.1:${port}` && request.host !== `localhost:${port}`) return 'the Host header does not name this kernel';
  if (!isRead(request.method) && request.origin !== undefined && !servedOrigins(port).includes(request.origin)) {
    return 'the Origin header does not name this kernel';
  }
  if (request.fetchSite === undefined || request.fetchSite === 'same-origin') return undefined;
  if (request.fetchSite === 'none' && isRead(request.method) && !request.eventStream) return undefined;
  return `Sec-Fetch-Site ${request.fetchSite} is not allowed here`;
}
