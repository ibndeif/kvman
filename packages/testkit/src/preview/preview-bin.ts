#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { z } from '@kvman/sdk';
import { BinFailure, printFailure } from '../bin/bin-failure.ts';
import { runPreview } from './preview-run.ts';

// The `kvman-preview` bin (plan 09 §9.3, plan 10, ADR 0010, 2, 7, 21): runs a preview kvman in a terminal's foreground
// for the extension projects in `<folder>…`, on its own home and port. It prints the URL once the preview answers
// and keeps running until SIGINT or SIGTERM. With `--json` it prints `{ "url" }` as one JSON line.

const usage = 'Usage: kvman-preview <folder>… [--preset <file>] [--kvman <entry>] [--name <name>] [--json]';

const optionsSchema = z.object({
  folders: z.array(z.string().min(1)).min(1),
  preset: z.string().min(1).optional(),
  kvman: z.string().min(1).optional(),
  name: z.string().min(1),
  json: z.boolean(),
});

type PreviewOptions = z.output<typeof optionsSchema>;

function parseOptions(argv: string[]): PreviewOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        preset: { type: 'string' },
        kvman: { type: 'string' },
        name: { type: 'string', default: 'preview' },
        json: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BinFailure('VALIDATION_FAILED', `${reason} ${usage}`);
  }
  const checked = optionsSchema.safeParse({
    folders: parsed.positionals,
    preset: parsed.values.preset,
    kvman: parsed.values.kvman,
    name: parsed.values.name ?? 'preview',
    json: parsed.values.json ?? false,
  });
  if (!checked.success) {
    if (parsed.positionals.length === 0) throw new BinFailure('VALIDATION_FAILED', `At least one <folder> argument is required. ${usage}`);
    throw new BinFailure('VALIDATION_FAILED', `${checked.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')} ${usage}`);
  }
  return checked.data;
}

const json = process.argv.includes('--json');
try {
  const options = parseOptions(process.argv.slice(2));
  await runPreview(options, (url) => {
    if (options.json) process.stdout.write(`${JSON.stringify({ url })}\n`);
    else process.stdout.write(`Preview running at ${url}\n`);
  });
} catch (error) {
  printFailure(error, json);
  process.exitCode = 1;
}
