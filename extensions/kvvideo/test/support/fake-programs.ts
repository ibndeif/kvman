import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

// Stand-in ffmpeg, ffprobe, and piper programs (plan 16 §16.10): small Node scripts that the `kvvideo.programs.*`
// settings name. Each test writes the behavior its scenario needs as the script's body, which sees `args`, the
// program's arguments, and may print, write files, and exit.

export function useFakePrograms(): { program(name: string, body: string): string } {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });
  return {
    program: (name, body) => {
      const folder = mkdtempSync(path.join(tmpdir(), 'kvvideo-program-'));
      folders.push(folder);
      const file = path.join(folder, name);
      writeFileSync(file, `#!${process.execPath}\nconst args = process.argv.slice(2);\nconst fs = require('node:fs');\n${body}\n`);
      chmodSync(file, 0o755);
      return file;
    },
  };
}

/** A body that answers ffmpeg's listings: its version, the encoders, and the filters, each with the given names. */
export function ffmpegListings(options: { encoders: readonly string[]; filters: readonly string[] }): string {
  const rows = (names: readonly string[]) => names.map((name) => ` V....D ${name}  ${name} codec`).join('\\n');
  return [
    `if (args.includes('-version')) { console.log('ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers'); process.exit(0); }`,
    `if (args.includes('-encoders')) { console.log('Encoders:\\n ------\\n${rows(options.encoders)}'); process.exit(0); }`,
    `if (args.includes('-filters')) { console.log('Filters:\\n${rows(options.filters)}'); process.exit(0); }`,
    'process.exit(1);',
  ].join('\n');
}

/** A body that prints a version and exits 0. */
export const answersVersion = `console.log('version 7.1'); process.exit(0);`;

/**
 * A body for an ffmpeg that encodes a recording: it reads JPEG frames from stdin and writes, as JSON at its last
 * argument, how many came, the first one's size, and its arguments. Its pid goes to `<its own file>.pid` at start.
 */
export const countsFrames = [
  "const output = args[args.length - 1];",
  "fs.writeFileSync(__filename + '.pid', String(process.pid));",
  'const chunks = [];',
  "process.stdin.on('data', (chunk) => chunks.push(chunk));",
  "process.stdin.on('end', () => {",
  '  const data = Buffer.concat(chunks);',
  '  let frames = 0; let width = 0; let height = 0;',
  '  for (let at = 0; at + 2 < data.length; at += 1) if (data[at] === 0xff && data[at + 1] === 0xd8 && data[at + 2] === 0xff) frames += 1;',
  '  for (let at = 0; at + 8 < data.length; at += 1) if (data[at] === 0xff && (data[at + 1] === 0xc0 || data[at + 1] === 0xc2)) { height = data.readUInt16BE(at + 5); width = data.readUInt16BE(at + 7); break; }',
  '  fs.writeFileSync(output, JSON.stringify({ frames, width, height, args }));',
  '});',
].join('\n');

/**
 * A body for an ffprobe that gives each file a length: 4.0 s for videos, 2.5 s for audio. A file whose name has
 * `unreadable` fails.
 */
export const probesLengths = [
  'const file = args[args.length - 1];',
  "if (file.includes('unreadable')) { console.error('Invalid data found when processing input'); process.exit(1); }",
  "console.log(/\\.(mp3|wav|m4a)$/i.test(file) ? '2.5' : '4.0');",
].join('\n');

/**
 * A body for an ffmpeg that composes: a scene's part holds its arguments, the join holds the parts' contents in the
 * list's order. Each run adds a JSON line to `<its own file>.log` with its arguments, its working folder's files, and
 * the scene's ASS file. `fail` is a part name or `join` that exits 1.
 */
export function composes(fail = ''): string {
  return [
    'const path = require("node:path");',
    'const output = args[args.length - 1];',
    'const joining = args.includes("concat");',
    'const ass = (args.find((arg) => arg.includes("subtitles=")) || "").match(/filename=([^:]+):/);',
    'fs.appendFileSync(__filename + ".log", JSON.stringify({ args, cwd: process.cwd(), files: fs.readdirSync("."), fonts: fs.existsSync("fonts") ? fs.readdirSync("fonts") : [], ass: ass ? fs.readFileSync(ass[1], "utf8") : null }) + "\\n");',
    `if (${JSON.stringify(fail)} !== '' && (output === ${JSON.stringify(fail)} || (joining && ${JSON.stringify(fail)} === 'join'))) { console.error('Conversion failed!'); process.exit(1); }`,
    'if (!joining) { fs.writeFileSync(output, "PART " + output + "\\n"); process.exit(0); }',
    'const list = fs.readFileSync(args[args.indexOf("-i") + 1], "utf8").split("\\n").filter(Boolean).map((line) => line.slice(6, -1));',
    'fs.writeFileSync(output, list.map((part) => fs.readFileSync(part, "utf8")).join(""));',
  ].join('\n');
}
