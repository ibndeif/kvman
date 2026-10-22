import { describe, expect, it, vi } from 'vitest';
import { runVersion, startCommand, startKvman, type ProgramPlace } from '../src/kvman-process.ts';
import { fakeProgram, type FakeProgram } from './support/fake-program.ts';

const place = (fake: FakeProgram): ProgramPlace => ({ program: fake.program, folder: fake.folder, platform: process.platform, comSpec: process.env['ComSpec'] });

function started(fake: FakeProgram) {
  const lines: string[] = [];
  const exited = vi.fn();
  const kvman = startKvman(place(fake), { line: (text) => lines.push(text), exited });
  return { lines, exited, kvman };
}

describe('the kvman program (15 §15.3 and §15.5, ADR 0099, 16 and 25)', () => {
  it('M4.2-H7 kvman starts directly on Linux and macOS, and through cmd.exe on Windows', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(startCommand({ program: 'kvman', folder: '/w', platform, comSpec: undefined }, ['--pipe', '--no-open'])).toEqual({ file: 'kvman', args: ['--pipe', '--no-open'], windowsVerbatimArguments: false });
    }
    const windows = startCommand({ program: 'C:\\Program Files\\nodejs\\kvman.cmd', folder: 'C:\\w', platform: 'win32', comSpec: 'C:\\Windows\\system32\\cmd.exe' }, ['--pipe', '--no-open']);
    expect(windows).toEqual({ file: 'C:\\Windows\\system32\\cmd.exe', args: ['/d', '/s', '/c', '""C:\\Program Files\\nodejs\\kvman.cmd" --pipe --no-open"'], windowsVerbatimArguments: true });
    expect(startCommand({ program: 'kvman', folder: 'C:\\w', platform: 'win32', comSpec: undefined }, ['--version']).file).toBe('cmd.exe');
  });

  it('M4.2-H1 kvman runs with --pipe --no-open in the folder, its lines are read, and an answer is written', async () => {
    const fake = fakeProgram('running');
    const { lines, kvman } = started(fake);
    await vi.waitFor(() => expect(lines).toEqual(['{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}']));
    kvman.write('{"trust":true}');
    await vi.waitFor(() => expect(fake.recorded()).toHaveLength(2));
    expect(JSON.parse(fake.recorded()[0] ?? '')).toEqual({ args: ['--pipe', '--no-open'], folder: fake.folder });
    expect(fake.recorded()[1]).toBe('{"trust":true}');
    kvman.closeInput();
  });

  it('M4.2-H11 closing the input stops kvman, which ends by itself', async () => {
    const { lines, exited, kvman } = started(fakeProgram('running'));
    await vi.waitFor(() => expect(lines).toHaveLength(1));
    kvman.closeInput();
    await vi.waitFor(() => expect(exited).toHaveBeenCalledTimes(1));
    kvman.write('{"trust":false}');
    expect(exited).toHaveBeenCalledTimes(1);
  });

  it('M4.2-E6 a line that arrives in pieces is read whole', async () => {
    const { lines, kvman } = started(fakeProgram('chunked'));
    await vi.waitFor(() => expect(lines).toEqual(['{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}']));
    kvman.closeInput();
  });

  it('M4.2-H14 a program that ends by itself is reported once', async () => {
    const { exited } = started(fakeProgram('fails'));
    await vi.waitFor(() => expect(exited).toHaveBeenCalledTimes(1));
  });

  it('M4.2-H4 M4.2-H6 --version gives the output, and nothing for a program that fails or is missing', async () => {
    const fake = fakeProgram('running');
    expect(await runVersion(place(fake))).toBe('0.4.7\n');
    expect(JSON.parse(fake.recorded()[0] ?? '').args).toEqual(['--version']);
    expect(await runVersion(place(fakeProgram('fails')))).toBeUndefined();
    expect(await runVersion({ ...place(fake), program: `${fake.folder}/no-such-kvman` })).toBeUndefined();
  });
});
