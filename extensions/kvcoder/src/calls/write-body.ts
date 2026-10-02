import { errorOutput, type CallResult } from '../connector-line.ts';

// `write '<json>'` with a heredoc (plan 08 §8.5, ADR 0009, 187): the body is the `content` the JSON leaves out, raw and
// unescaped, as `cat > file <<'EOF'` would write it. Models that must JSON-escape a large file inside a heredoc inside
// a call often lose the call, so a whole file or document is better given as the body.

const invalid = (message: string): CallResult => errorOutput({ code: 'VALIDATION_FAILED', message });

export type CallWords = { words: readonly string[]; stdin: string | null };

/** The call as one JSON input: a `write` with a JSON argument and a body gets the body as its `content`. */
export function withBody(words: readonly string[], stdin: string | null): CallWords | CallResult {
  const [command, json, ...extra] = words;
  if (command !== 'write' || json === undefined || stdin === null || extra.length > 0) return { words, stdin };
  let given: unknown;
  try {
    given = JSON.parse(json);
  } catch (error) {
    return invalid(`The input isn't JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof given !== 'object' || given === null || Array.isArray(given)) return invalid('The input must be a JSON object.');
  if ('content' in given) return invalid('Give the content once: in the JSON, or as the heredoc body.');
  return { words: ['write'], stdin: JSON.stringify({ ...given, content: stdin === '' ? '' : `${stdin}\n` }) };
}
