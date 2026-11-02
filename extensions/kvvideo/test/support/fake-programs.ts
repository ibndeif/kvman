import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

// Stand-in ffmpeg, ffprobe, and piper programs (plan 16 §16.12): small Node scripts that the `kvvideo.programs.*`
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
 * argument, how many came, how many of them differ, the first one's size, and its arguments. Its pid goes to
 * `<its own file>.pid` at start.
 */
export const countsFrames = [
  "const output = args[args.length - 1];",
  "fs.writeFileSync(__filename + '.pid', String(process.pid));",
  'const chunks = [];',
  "process.stdin.on('data', (chunk) => chunks.push(chunk));",
  "process.stdin.on('end', () => {",
  '  const data = Buffer.concat(chunks);',
  '  let frames = 0; let width = 0; let height = 0; const starts = [];',
  '  for (let at = 0; at + 2 < data.length; at += 1) if (data[at] === 0xff && data[at + 1] === 0xd8 && data[at + 2] === 0xff) { frames += 1; starts.push(at); }',
  '  const distinct = new Set(starts.map((start, index) => data.subarray(start, starts[index + 1] ?? data.length).toString("base64"))).size;',
  '  for (let at = 0; at + 8 < data.length; at += 1) if (data[at] === 0xff && (data[at + 1] === 0xc0 || data[at + 1] === 0xc2)) { height = data.readUInt16BE(at + 5); width = data.readUInt16BE(at + 7); break; }',
  '  fs.writeFileSync(output, JSON.stringify({ frames, distinct, width, height, args }));',
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
 * A body for an ffmpeg that composes (M5.8): a scene's part holds its output's name; the measure prints loudnorm's JSON;
 * the final encode holds its parts' contents in input order; the poster holds `POSTER`. Each run adds a JSON line to
 * `<its own file>.log` with its arguments, its working folder and its files, its filter graph file, and the scene's ASS
 * file. `fail` is a part name, `measure`, or `final`, which exits 1.
 */
export function composes(fail = ''): string {
  return [
    'const output = args[args.length - 1];',
    'const script = args.indexOf("-filter_complex_script");',
    'const graph = script === -1 ? null : fs.readFileSync(args[script + 1], "utf8");',
    'const ass = (graph || "").match(/subtitles=filename=([^:]+):/);',
    'const kind = output === "-" ? "measure" : output.endsWith(".jpg") ? "poster" : output === "video.mp4" ? "final" : "part";',
    'fs.appendFileSync(__filename + ".log", JSON.stringify({ kind, args, cwd: process.cwd(), files: fs.readdirSync("."), fonts: fs.existsSync("fonts") ? fs.readdirSync("fonts") : [], graph, ass: ass ? fs.readFileSync(ass[1], "utf8") : null }) + "\\n");',
    `const fail = ${JSON.stringify(fail)};`,
    "if (fail !== '' && (output === fail || kind === fail)) { console.error('Conversion failed!'); process.exit(1); }",
    'if (kind === "measure") { console.error("[Parsed_loudnorm_0] \\n{\\n\\"input_i\\" : \\"-20.00\\",\\n\\"input_tp\\" : \\"-6.00\\",\\n\\"input_lra\\" : \\"3.00\\",\\n\\"input_thresh\\" : \\"-30.00\\",\\n\\"target_offset\\" : \\"0.10\\"\\n}"); process.exit(0); }',
    'if (kind === "poster") { fs.writeFileSync(output, "POSTER"); process.exit(0); }',
    'if (kind === "part") { fs.writeFileSync(output, "PART " + output + "\\n"); process.exit(0); }',
    'const parts = args.filter((arg, index) => args[index - 1] === "-i" && arg.endsWith(".mkv"));',
    'fs.writeFileSync(output, parts.map((part) => fs.readFileSync(part, "utf8")).join(""));',
  ].join('\n');
}
