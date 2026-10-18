// The thinking levels (ADR 0087, 11): all of them in order, and the one a model uses for a level it lacks, by pi-ai's
// rule. The server and the web app share this module, so it imports nothing.

/** Every thinking level, from none to the most. */
export const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ThinkingLevel = (typeof thinkingLevels)[number];

/** The level a model whose levels are `levels` uses for `wanted`: itself, else the next higher it has, else the next lower. */
export function nearestLevel(levels: readonly ThinkingLevel[], wanted: ThinkingLevel): ThinkingLevel {
  if (levels.includes(wanted)) return wanted;
  const index = thinkingLevels.indexOf(wanted);
  const higher = thinkingLevels.slice(index + 1).find((level) => levels.includes(level));
  return higher ?? thinkingLevels.slice(0, index).findLast((level) => levels.includes(level)) ?? wanted;
}
