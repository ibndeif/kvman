import type { Ctx } from '@kvman/sdk';
import { onPath, shellCommand, type ShellCommand } from './shell-command.ts';
import { settingSchemas } from '../register-settings.ts';

/** The shell this run uses: `kvcoder.shell.path`, or the one found for the OS (plan 08 §8.3). */
export async function shellFor(ctx: Ctx): Promise<ShellCommand> {
  const configured = settingSchemas.shellPath.parse(await ctx.settings.get('kvcoder.shell.path'));
  return shellCommand(process.platform, configured, () => onPath('pwsh', process.env, process.platform));
}
