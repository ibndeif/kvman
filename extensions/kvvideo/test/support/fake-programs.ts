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
