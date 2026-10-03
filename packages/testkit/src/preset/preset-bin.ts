#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { BinFailure, printFailure } from '../bin/bin-failure.ts';
import { findRunningKvman } from '../running/running-kvman.ts';
import { checkPreset } from './preset-check.ts';
import { writePresetFile } from './preset-new.ts';

// The `kvman-preset` bin (plan 09 §9.1, plan 10, ADR 0010, 2): writes a starting preset (`new`) and validates a
// preset's schema and references (`check`), for any harness or none. `check` asks the running kvman for its
// extensions, settings, and pages; with none running it checks the schema and the `path:` folders only. With
// `--json` each prints its output as one JSON line.

const usage = 'Usage: kvman-preset new <file> --name <name> [--json]\nUsage: kvman-preset check <file> [--json] [--home <dir>] [--url <url>]';

type PresetCommand = { kind: 'new'; file: string; name: string; json: boolean } | { kind: 'check'; file: string; json: boolean; home: string | undefined; url: string | undefined };

function parseOptions(argv: string[]): PresetCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        json: { type: 'boolean', default: false },
        home: { type: 'string' },
        url: { type: 'string' },
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BinFailure('VALIDATION_FAILED', `${reason} ${usage}`);
  }
  const [subcommand, ...rest] = parsed.positionals;
  if (subcommand === 'new') {
    if (parsed.values.home !== undefined || parsed.values.url !== undefined) throw new BinFailure('VALIDATION_FAILED', `new takes no --home or --url. ${usage}`);
    const [file, ...extra] = rest;
    if (file === undefined || extra.length > 0) throw new BinFailure('VALIDATION_FAILED', `new takes a single <file> argument. ${usage}`);
    if (parsed.values.name === undefined) throw new BinFailure('VALIDATION_FAILED', `--name is required. ${usage}`);
    if (parsed.values.name === '') throw new BinFailure('VALIDATION_FAILED', `--name must not be empty. ${usage}`);
    return { kind: 'new', file, name: parsed.values.name, json: parsed.values.json ?? false };
  }
  if (subcommand === 'check') {
    if (parsed.values.name !== undefined) throw new BinFailure('VALIDATION_FAILED', `check takes no --name. ${usage}`);
    const [file, ...extra] = rest;
    if (file === undefined || extra.length > 0) throw new BinFailure('VALIDATION_FAILED', `check takes a single <file> argument. ${usage}`);
    return { kind: 'check', file, json: parsed.values.json ?? false, home: parsed.values.home, url: parsed.values.url };
  }
  if (subcommand === undefined) throw new BinFailure('VALIDATION_FAILED', `A subcommand is required. ${usage}`);
  throw new BinFailure('VALIDATION_FAILED', `Unknown subcommand ${JSON.stringify(subcommand)}; give new or check. ${usage}`);
}

function readableFindings(findings: { file: string; message: string; hint: string }[]): string {
  if (findings.length === 0) return 'No findings.\n';
  return `${findings.map((finding) => `${finding.file}: ${finding.message}\n  ${finding.hint}`).join('\n')}\n`;
}

const json = process.argv.includes('--json');
try {
  const command = parseOptions(process.argv.slice(2));
  if (command.kind === 'new') {
    const created = writePresetFile(command.file, command.name);
    if (command.json) process.stdout.write(`${JSON.stringify({ file: created.file })}\n`);
    else process.stdout.write(`Wrote ${command.file}.\n`);
  } else {
    const locate: { home?: string; url?: string } = {};
    if (command.home !== undefined) locate.home = command.home;
    if (command.url !== undefined) locate.url = command.url;
    const checked = await checkPreset(command.file, findRunningKvman(locate));
    if (command.json) process.stdout.write(`${JSON.stringify(checked.findings)}\n`);
    else process.stdout.write(readableFindings(checked.findings));
    if (!checked.running) process.stderr.write("kvman isn't running; only the preset's schema and path: folders were checked.\n");
    if (checked.findings.length > 0) process.exitCode = 1;
  }
} catch (error) {
  printFailure(error, json);
  process.exitCode = 1;
}
