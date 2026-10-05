import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { builtinCommands } from '../../src/connectors/builtin-connectors.ts';
import { builtinConnectors } from '../../src/connector-call.ts';

const extensions = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const kvcoder = path.join(extensions, 'kvcoder', 'src', 'connectors');
const kvcustomizer = path.join(extensions, 'kvcustomizer', 'src', 'connectors');

describe('every connector lives in its own file (ADR 0011, 28)', () => {
  it("QA18-H27 each of kvcoder's connectors, the binary connector, and each of kvcustomizer's is one file that holds its commands", () => {
    for (const name of [...builtinConnectors, 'binary']) expect(existsSync(path.join(kvcoder, `${name}.ts`)), name).toBe(true);
    for (const name of builtinConnectors) {
      const source = readFileSync(path.join(kvcoder, `${name}.ts`), 'utf8');
      for (const command of Object.values(builtinCommands[name])) {
        expect(source, `${name} holds ${command.registration}`).toContain(`'${command.registration}'`);
        for (const other of builtinConnectors.filter((candidate) => candidate !== name)) expect(readFileSync(path.join(kvcoder, `${other}.ts`), 'utf8'), `${other} has no ${command.registration}`).not.toContain(`'${command.registration}'`);
      }
    }
    const customizerFiles = readdirSync(kvcustomizer).sort();
    expect(customizerFiles).toEqual(['docs.ts', 'ext.ts', 'kvman.ts', 'preset.ts', 'preview.ts']);
    for (const file of customizerFiles) {
      const source = readFileSync(path.join(kvcustomizer, file), 'utf8');
      expect(source.match(/^export const \w+Connector = \{$/gm), file).toHaveLength(1);
      expect(source, file).toContain(`name: '${path.basename(file, '.ts')}',`);
    }
    expect(readFileSync(path.join(kvcustomizer, '..', 'register-with-kvcoder.ts'), 'utf8')).toContain("ctx.exec('kvcoder.connector.register', { connectors: [");
  });
});
