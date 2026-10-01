import type { Ctx } from '@kvman/sdk';
import type { ConnectorRow } from '../registry/register-connectors.ts';
import { runShell } from './run-shell.ts';
import type { ShellCommand } from './shell-command.ts';

// Binary checks (plan 08 §8.4, ADR 0009, 101): at a session's first step, each binary connector's `check` runs in the
// real shell, without approval, for at most 5 s; exit 0 passes.

const checkTimeoutMs = 5_000;

export async function runBinaryChecks(ctx: Ctx, shell: ShellCommand, connectors: readonly ConnectorRow[]): Promise<{ name: string; passed: boolean }[]> {
  const binaries = connectors.flatMap((connector) => (connector.binary === undefined ? [] : [{ name: connector.name, check: connector.binary.check }]));
  return Promise.all(
    binaries.map(async ({ name, check }) => {
      const run = await runShell(shell, check, ctx.job.workspace.path, checkTimeoutMs, ctx.job.signal);
      return { name, passed: run.exitCode === 0 && !run.timedOut };
    }),
  );
}
