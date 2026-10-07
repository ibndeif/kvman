import { rm } from 'node:fs/promises';
import { kvmanHome, type UninstallArguments } from '../arguments.ts';
import { liveLock } from '../lock-file.ts';
import type { Terminal } from '../trust-prompt.ts';
import { checkInstalled } from './installed-check.ts';
import { stopRunning, type StopServices } from './stop-running.ts';
import { askWhatToRemove } from './uninstall-questions.ts';

// `kvman uninstall` (plan 01 §1.2, ADR 0031): everything is asked and checked before anything changes. In order: the
// questions, the check that this kvman is npm's global one, the stop of a kvman running on the home, npm, and then
// the data, only when its deletion was agreed and npm succeeded. It exits 0 when kvman was removed or the person said
// no, and 1 when it couldn't go on.

export type UninstallEnvironment = StopServices & {
  variables: NodeJS.ProcessEnv;
  userFolder: string;
  terminal: Terminal;
  errors: NodeJS.WritableStream;
  packageFolder: string;
};

const notGlobal = "This kvman wasn't installed with `npm i -g kvman`, so npm can't remove it. Remove it the way it was installed.\nNothing was removed.\n";
const noNpm = "npm wasn't found, so kvman can't remove itself.\nNothing was removed.\n";
const notStopped = "kvman didn't stop within 15 seconds.\nNothing was removed.\n";
const npmFailed = 'npm could not remove kvman, and your data was left alone. Run this yourself:\n  npm uninstall -g kvman\n';

export async function runUninstall(args: UninstallArguments, environment: UninstallEnvironment): Promise<number> {
  const { terminal, errors } = environment;
  const home = kvmanHome(args.home, environment.variables, environment.userFolder);
  const running = liveLock(home, (pid) => environment.isAlive(pid));
  terminal.output.write(`This removes kvman from this computer.\n${running === undefined ? '' : 'kvman is running and will be stopped.\n'}`);
  const answers = await askWhatToRemove(args, home, terminal);
  if (answers.kind === 'unanswered') {
    errors.write(`There is no terminal to ask in. Answer with ${answers.flag}.\nNothing was removed.\n`);
    return 1;
  }
  if (answers.kind === 'declined') {
    terminal.output.write('Nothing was removed.\n');
    return 0;
  }
  const installed = await checkInstalled(environment.packageFolder, environment.runProgram);
  if (installed !== 'global') {
    errors.write(installed === 'no-npm' ? noNpm : notGlobal);
    return 1;
  }
  if (running !== undefined && !(await stopRunning(running.pid, environment))) {
    errors.write(notStopped);
    return 1;
  }
  const removed = await environment.runProgram('npm', ['uninstall', '-g', 'kvman'], 'shown');
  if (!removed.started || removed.code !== 0) {
    errors.write(npmFailed);
    return 1;
  }
  if (!answers.deleteData) {
    terminal.output.write(`kvman was removed. Your data was kept in ${home}\n`);
    return 0;
  }
  await rm(home, { recursive: true, force: true });
  terminal.output.write('kvman and its data were removed.\n');
  return 0;
}
