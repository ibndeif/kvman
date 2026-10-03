#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { BinFailure, printFailure } from '../bin/bin-failure.ts';
import { listDocsPages, type DocsListing } from './docs-list.ts';
import { readDocsPage } from './docs-get.ts';
import { findRunningKvman } from '../running/running-kvman.ts';

// The `kvman-docs` bin (plan 09 §9.5, plan 10, ADR 0010, 17): reads the docs of the extensions a running kvman has
// loaded over HTTP, plus the three built-in guides with no kvman running. With `--json` it prints the data as one
// JSON line.

const usage = 'Usage: kvman-docs list [--json] [--home <dir>] [--url <url>]\nUsage: kvman-docs get <extension> <topic> [--json] [--home <dir>] [--url <url>]';

type DocsFlags = { json: boolean; home: string | undefined; url: string | undefined };

type DocsCommand = ({ kind: 'list' } | { kind: 'get'; extension: string; topic: string }) & DocsFlags;

function parseOptions(argv: string[]): DocsCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: 'boolean', default: false },
        home: { type: 'string' },
        url: { type: 'string' },
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BinFailure('VALIDATION_FAILED', `${reason} ${usage}`);
  }
  const flags: DocsFlags = {
    json: parsed.values.json ?? false,
    home: typeof parsed.values.home === 'string' ? parsed.values.home : undefined,
    url: typeof parsed.values.url === 'string' ? parsed.values.url : undefined,
  };
  const [subcommand, ...rest] = parsed.positionals;
  if (subcommand === 'list' && rest.length === 0) return { kind: 'list', ...flags };
  if (subcommand === 'get' && rest.length === 2 && rest[0] !== undefined && rest[1] !== undefined) {
    return { kind: 'get', extension: rest[0], topic: rest[1], ...flags };
  }
  if (subcommand === undefined) throw new BinFailure('VALIDATION_FAILED', `A subcommand is required. ${usage}`);
  if (subcommand !== 'list' && subcommand !== 'get') throw new BinFailure('VALIDATION_FAILED', `Unknown subcommand ${JSON.stringify(subcommand)}; give list or get. ${usage}`);
  if (subcommand === 'list') throw new BinFailure('VALIDATION_FAILED', `list takes no arguments. ${usage}`);
  throw new BinFailure('VALIDATION_FAILED', `get takes <extension> and <topic>. ${usage}`);
}

function readableListing(listing: DocsListing): string {
  const lines: string[] = [];
  let current: string | undefined;
  for (const page of listing.pages) {
    if (page.extension !== current) {
      current = page.extension;
      lines.push(current);
    }
    lines.push(`  ${page.topic}: ${page.title}`);
  }
  if (listing.problems.length > 0) {
    lines.push('Problems:');
    for (const problem of listing.problems) lines.push(`${problem.extension}: ${problem.problem.message}`);
  }
  return `${lines.join('\n')}\n`;
}

const json = process.argv.includes('--json');
try {
  const command = parseOptions(process.argv.slice(2));
  const locate: { home?: string; url?: string } = {};
  if (command.home !== undefined) locate.home = command.home;
  if (command.url !== undefined) locate.url = command.url;
  const running = findRunningKvman(locate);
  if (command.kind === 'list') {
    const listing = await listDocsPages(running);
    if (command.json) {
      process.stdout.write(`${JSON.stringify({ pages: listing.pages, problems: listing.problems })}\n`);
    } else {
      process.stdout.write(readableListing(listing));
    }
    if (!listing.running) process.stderr.write("kvman isn't running; start it to read the extensions' docs.\n");
  } else {
    const page = await readDocsPage(running, command.extension, command.topic);
    if (command.json) {
      process.stdout.write(`${JSON.stringify({ extension: page.extension, topic: page.topic, title: page.title, markdown: page.markdown })}\n`);
    } else {
      process.stdout.write(`${page.markdown}\n`);
    }
  }
} catch (error) {
  printFailure(error, json);
  process.exitCode = 1;
}
