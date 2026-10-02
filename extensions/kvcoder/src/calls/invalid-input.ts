import { builtinHelp, errorOutput, type builtinConnectors, type CallResult } from '../connector-line.ts';

/**
 * A built-in call's invalid input as the model reads it: each problem, then the input the command takes, from its help,
 * so one correction is enough (ADR 0009, 213).
 */
export function invalidInput(connector: (typeof builtinConnectors)[number], command: string, issues: readonly { path: readonly PropertyKey[]; message: string }[]): CallResult {
  const problems = issues.map((issue) => `${issue.path.map(String).join('.') || 'input'}: ${issue.message}`).join('; ');
  const line = builtinHelp[connector].split('\n').map((text) => text.trim()).find((text) => text.startsWith(`${command} `));
  const input = line?.slice(command.length).trim();
  return errorOutput({ code: 'VALIDATION_FAILED', message: input === undefined ? problems : `${problems}. \`${connector} ${command}\` takes ${input}` });
}
