// A chat's title until the model writes one (plan 08 §8.1, ADR 0102, 14): the first line of prose of the person's first
// message, with code blocks and lines that read as code, JSON, or a log left out, cut at a word within 60 characters.

const limit = 60;

// A line that starts as JSON, markup, a quote, code, or a stack or log line.
const notProse = /^(?:[{}[\]<>"'`]|at\s|\d{4}-\d{2}-\d{2}|#!)/;

function cut(line: string): string {
  if (line.length <= limit) return line;
  const space = line.lastIndexOf(' ', limit);
  return (space > limit / 2 ? line.slice(0, space) : line.slice(0, limit)).trimEnd();
}

/** The placeholder title of a chat whose first message is `text`. */
export function placeholderTitle(text: string): string {
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, '\n').split('\n').map((line) => line.trim()).find((line) => /\p{L}/u.test(line) && !notProse.test(line));
  if (prose === undefined) return text.trim().slice(0, limit);
  return cut(prose.replace(/[\s:;,-]+$/, ''));
}
