#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { namespaceSchema, packageNameSchema } from '@kvman/sdk';
import { BinFailure, printFailure } from '../bin/bin-failure.ts';
import { newProject } from './new-project.ts';

// The `kvman-new` bin (plan 09 §9.2, plan 10, ADR 0010, 2): scaffolds an extension project and runs `npm install`
// in it, for any harness or none. With `--json` it prints the created project as one JSON line.

const usage = 'Usage: kvman-new <folder> --name <name> --namespace <namespace> [--web] [--json]';

const namespaceInput = namespaceSchema.refine((namespace) => namespace !== 'kernel', "kernel is the kernel's own namespace.");

type NewOptions = { folder: string; name: string; namespace: string; web: boolean; json: boolean };

function parseOptions(argv: string[]): NewOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        namespace: { type: 'string' },
        web: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BinFailure('VALIDATION_FAILED', `${reason} ${usage}`);
  }
  const [folder, ...rest] = parsed.positionals;
  if (folder === undefined || rest.length > 0) throw new BinFailure('VALIDATION_FAILED', `A single <folder> argument is required. ${usage}`);
  if (parsed.values.name === undefined) throw new BinFailure('VALIDATION_FAILED', `--name is required. ${usage}`);
  if (parsed.values.namespace === undefined) throw new BinFailure('VALIDATION_FAILED', `--namespace is required. ${usage}`);
  const name = packageNameSchema.safeParse(parsed.values.name);
  if (!name.success) throw new BinFailure('VALIDATION_FAILED', `Invalid --name ${JSON.stringify(parsed.values.name)}: use a lowercase npm package name, with an optional @scope/.`);
  const namespace = namespaceInput.safeParse(parsed.values.namespace);
  if (!namespace.success) {
    const reason = parsed.values.namespace === 'kernel' ? "kernel is the kernel's own namespace." : 'use a lowercase kebab-case namespace.';
    throw new BinFailure('VALIDATION_FAILED', `Invalid --namespace ${JSON.stringify(parsed.values.namespace)}: ${reason}`);
  }
  return { folder, name: name.data, namespace: namespace.data, web: parsed.values.web ?? false, json: parsed.values.json ?? false };
}

const json = process.argv.includes('--json');
try {
  const options = parseOptions(process.argv.slice(2));
  const created = await newProject({ folder: options.folder, name: options.name, namespace: options.namespace, web: options.web });
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ folder: created.folder, name: created.name, namespace: created.namespace, web: created.web })}\n`);
  } else {
    process.stdout.write(
      [`Created ${created.name} (namespace ${created.namespace}) in ${created.folder}.`, 'Next steps:', `  cd ${options.folder}`, '  npm test', '  npm run check', '  kvman-preview'].join('\n') + '\n',
    );
  }
} catch (error) {
  printFailure(error, json);
  process.exitCode = 1;
}
