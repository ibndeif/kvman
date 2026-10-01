import { lastLines, runProgram, type ProgramRun } from '../run-program.ts';
import { checkFindings, outputTail, typeScriptFindings, type Finding } from './findings.ts';

// `ext check` and `ext test` (plan 09 §9.1, ADR 0009, 117, 126): the project's own toolchain, run in its folder.

function checkFailed(run: ProgramRun): Finding {
  return {
    message: `npm run check failed with exit code ${String(run.exitCode)}:\n${lastLines(run.output)}`,
    hint: 'Run npm install in the project, and keep its check script as kvman-check.',
  };
}

function typeScriptFailed(run: ProgramRun): Finding {
  return { message: `npx tsc failed with exit code ${String(run.exitCode)}:\n${lastLines(run.output)}`, hint: 'Run npm install in the project, so its own TypeScript is there.' };
}

export async function checkProject(folder: string, signal: AbortSignal): Promise<Finding[]> {
  const typeScript = await runProgram('npx', ['tsc', '--noEmit', '--pretty', 'false'], folder, signal);
  const typeFindings = typeScriptFindings(typeScript.stdout);
  const check = await runProgram('npm', ['run', 'check', '--', '--json'], folder, signal);
  return [
    ...(typeScript.exitCode !== 0 && typeFindings.length === 0 ? [typeScriptFailed(typeScript)] : typeFindings),
    ...(checkFindings(check.stdout) ?? [checkFailed(check)]),
  ];
}

export async function testProject(folder: string, signal: AbortSignal): Promise<{ passed: boolean; exitCode: number; output: string }> {
  const run = await runProgram('npm', ['test'], folder, signal);
  return { passed: run.exitCode === 0, exitCode: run.exitCode, output: outputTail(run.output) };
}
