import type { Candidate } from './run-queues.ts';

function nextAfter(keys: readonly string[], last: string | undefined): string | undefined {
  const sorted = [...keys].sort();
  return (last === undefined ? undefined : sorted.find((key) => key > last)) ?? sorted[0];
}

// 03 §3.4: the best class first, then round-robin across participants (workspaces, and one slot for messages
// without a workspace), then round-robin across the participant's queues (lanes and keyless handler queues).
export class Rotation {
  #lastParticipant: string | undefined;
  readonly #lastQueue = new Map<string, string>();

  choose(candidates: readonly Candidate[]): Candidate | undefined {
    const best = Math.min(...candidates.map((candidate) => candidate.rank));
    const ranked = candidates.filter((candidate) => candidate.rank === best);
    const participant = nextAfter([...new Set(ranked.map((candidate) => candidate.participant))], this.#lastParticipant);
    const inParticipant = ranked.filter((candidate) => candidate.participant === participant);
    const queueKey = nextAfter(inParticipant.map((candidate) => candidate.queueKey), participant === undefined ? undefined : this.#lastQueue.get(participant));
    return inParticipant.find((candidate) => candidate.queueKey === queueKey);
  }

  served(candidate: Candidate): void {
    this.#lastParticipant = candidate.participant;
    this.#lastQueue.set(candidate.participant, candidate.queueKey);
  }
}
