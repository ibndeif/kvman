import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { kernelVersion, npmRegistryFrom, packBuiltins } from '@kvman/kernel';

// 06 §6.9, ADR 0115: `pnpm build` packs every extensions/* package into packages/kernel/builtin/ with digests.json.
// Tests pass --extensions and --out to pack fixture folders.

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { extensions: { type: 'string' }, presets: { type: 'string' }, out: { type: 'string' } }, strict: true });

const digests = await packBuiltins(values.extensions ?? join(repositoryRoot, 'extensions'), values.out ?? join(repositoryRoot, 'packages', 'kernel', 'builtin'), {
  registry: npmRegistryFrom(process.env),
  environment: process.env,
  presets: values.presets ?? join(repositoryRoot, 'presets'),
  kvmanVersion: kernelVersion(),
});
process.stdout.write(`packed ${Object.keys(digests).length} builtin extension(s)\n`);
