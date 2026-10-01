// Local links in a result's output (ADR 0009, 120): `http://127.0.0.1:<port>…` and `http://localhost:<port>…` become
// links, so a URL such as a preview's is one click away; other text, other URLs included, stays plain.

export type OutputPart = { kind: 'text'; text: string } | { kind: 'link'; href: string };

const localUrl = /http:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s"'`<>()[\]{}]*/g;
// Sentence punctuation right after a URL ends the sentence, not the URL.
const trailingPunctuation = /[.,;:!?]+$/;

export function outputParts(output: string): OutputPart[] {
  const parts: OutputPart[] = [];
  let last = 0;
  for (const match of output.matchAll(localUrl)) {
    const href = match[0].replace(trailingPunctuation, '');
    if (match.index > last) parts.push({ kind: 'text', text: output.slice(last, match.index) });
    parts.push({ kind: 'link', href });
    last = match.index + href.length;
  }
  if (last < output.length) parts.push({ kind: 'text', text: output.slice(last) });
  return parts;
}
