import { z, type SpawnOptions } from '@kvman/sdk';

// Spawn options as a test sends them: loose here, so ctx.process.spawn is what checks them (ADR 0139).
export const spawnInput = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().optional(),
  stdin: z.string().optional(),
  logCapBytes: z.number().optional(),
  live: z.string().optional(),
  token: z.object({ calls: z.array(z.string()), context: z.record(z.string(), z.string()).optional(), delegate: z.boolean().optional() }).optional(),
  detached: z.boolean().optional(),
  onExit: z.string().optional(),
});

export type SpawnInput = z.infer<typeof spawnInput>;

function tokenOf(token: NonNullable<SpawnInput['token']>): NonNullable<SpawnOptions['token']> {
  return { calls: token.calls, ...(token.context === undefined ? {} : { context: token.context }), ...(token.delegate === undefined ? {} : { delegate: token.delegate }) };
}

export function optionsOf(input: SpawnInput): SpawnOptions {
  return {
    command: input.command,
    ...(input.args === undefined ? {} : { args: input.args }),
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.stdin === undefined ? {} : { stdin: input.stdin }),
    ...(input.logCapBytes === undefined ? {} : { logCapBytes: input.logCapBytes }),
    ...(input.live === undefined ? {} : { live: input.live }),
    ...(input.token === undefined ? {} : { token: tokenOf(input.token) }),
    ...(input.detached === undefined ? {} : { detached: input.detached }),
    ...(input.onExit === undefined ? {} : { onExit: input.onExit }),
  };
}
