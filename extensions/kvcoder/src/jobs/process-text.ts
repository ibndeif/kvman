// What the model and the person read of a background process's output (ADR 0009, 150 and 152).

/** The last `count` lines of a log. */
export function lastLines(text: string, count: number): string {
  return text.replace(/[\r\n]+$/, '').split(/\r?\n/).slice(-count).join('\n');
}

const localUrl = /http:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s"'`<>()[\]{}]*/g;

/** The `http://127.0.0.1:<port>` and `http://localhost:<port>` URLs in a text, each once, without trailing punctuation. */
export function localLinks(text: string): string[] {
  return [...new Set((text.match(localUrl) ?? []).map((url) => url.replace(/[.,;:!?]+$/, '')))];
}
