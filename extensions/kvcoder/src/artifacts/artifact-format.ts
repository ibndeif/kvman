import { invalid } from '../problems.ts';

// The formats of an artifact (plan 08 §8.5, ADR 0009, 215 and 216): Markdown, an HTML page, or the URL of a page running on
// this machine. A format the agent leaves out is read from the content.

export const artifactFormats = ['markdown', 'html', 'url'] as const;

export type ArtifactFormat = (typeof artifactFormats)[number];

const htmlStart = /^\s*(?:<!doctype\s+html|<html[\s>])/i;
const localHosts = new Set(['localhost', '127.0.0.1']);
const urlLimit = 2048;

/** The URL a `url` artifact holds: one http or https address on `localhost` or `127.0.0.1`, with no credentials, or `undefined`. */
export function localUrl(content: string): string | undefined {
  const text = content.trim();
  if (text === '' || text.length > urlLimit || /\s/.test(text) || !URL.canParse(text)) return undefined;
  const url = new URL(text);
  const local = (url.protocol === 'http:' || url.protocol === 'https:') && localHosts.has(url.hostname) && url.username === '' && url.password === '';
  return local ? text : undefined;
}

/** What a format left out is: `html` for a page that starts like one, `url` for a lone local address, else `markdown`. */
export function detectFormat(content: string): ArtifactFormat {
  if (htmlStart.test(content)) return 'html';
  return localUrl(content) === undefined ? 'markdown' : 'url';
}

/** The content to store for `format`: a `url` artifact's address, trimmed, or a Problem to throw when it isn't one. */
export function contentFor(format: ArtifactFormat, content: string): string {
  if (format !== 'url') return content;
  const url = localUrl(content);
  if (url === undefined) throw invalid('A url artifact holds one http or https address on localhost or 127.0.0.1, with no credentials, such as http://localhost:8080.');
  return url;
}
