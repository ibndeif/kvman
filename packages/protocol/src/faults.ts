import { z } from 'zod';

// 14 §14.3: the named fault points of test runs. ADR 0100 places the ones M1 code reaches.
export const faultPointNames = [
  'admit.before-commit', 'admit.after-commit', 'claim.after', 'invoke.before', 'step.after-begin', 'step.before-record',
  'command.after-send', 'uow.before-commit', 'uow.after-commit-before-notify', 'defer.before-reply',
  'process.after-spawn-before-release', 'process.after-release', 'process.after-exit-before-onexit', 'reload.after-drain',
  'reload.after-migrate-before-swap', 'preset.apply.after-stage', 'preset.apply.after-version-switch', 'migration.mid',
  'live.after-publish-before-commit', 'blob.put.after-file-before-ref', 'secrets.after-commit-before-file',
  'workspace.forget.after-cancel', 'guard.after-created-before-review', 'dev.build.after-bundle',
] as const;

export const faultPointSchema = z.enum(faultPointNames);

export type FaultPoint = z.infer<typeof faultPointSchema>;

export type FaultSetting = { point: FaultPoint; hit: number };

function escaped(name: string): string {
  return name.replaceAll('.', String.raw`\.`);
}

// ADR 0100: `KVMAN_FAULTS=<point>[@<hit>]` kills the kernel the <hit>-th time (default the first) it reaches <point>.
export const faultSettingSchema = z
  .string()
  .regex(new RegExp(`^(?:${faultPointNames.map(escaped).join('|')})(?:@[1-9]\\d*)?$`), {
    message: 'expected a fault point of plan 14 §14.3, optionally followed by @<hit> with a hit from 1',
  });

// A setting that faultSettingSchema accepted, split into its point and hit.
export function faultSettingOf(setting: string): FaultSetting {
  const [name = '', hit = '1'] = faultSettingSchema.parse(setting).split('@');
  return { point: faultPointSchema.parse(name), hit: Number(hit) };
}
