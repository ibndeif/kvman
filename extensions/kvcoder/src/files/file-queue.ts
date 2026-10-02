// Runs the changes to one file one after another (plan 08 §8.5, ADR 0009, 160): the calls of a reply start together, and
// two edits that each read the original would lose the first one's write. The queue lives as long as its callers wait.

const tails = new Map<string, Promise<void>>();

/** Runs `run` after every earlier call with the same key has finished, whether it succeeded or not. */
export async function inOrder<Result>(key: string, run: () => Promise<Result>): Promise<Result> {
  const turn = (tails.get(key) ?? Promise.resolve()).then(run);
  const tail = turn.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  try {
    return await turn;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
