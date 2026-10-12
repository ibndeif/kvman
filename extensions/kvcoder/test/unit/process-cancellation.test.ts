import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runShell } from '../../src/calls/run-shell.ts';
import type { ShellCommand } from '../../src/calls/shell-command.ts';
import type { CommandLine } from '../../src/delegate/programs.ts';
import { runProgram } from '../../src/delegate/run-program.ts';

const spawners = vi.hoisted(() => ({ shell: vi.fn(), program: vi.fn() }));
vi.mock('node:child_process', async (original) => ({ ...(await original<typeof import('node:child_process')>()), spawn: spawners.shell }));
vi.mock('cross-spawn', () => ({ default: spawners.program }));

const timeoutMs = 100;
const cancellation = new Error('The test cancelled the process.');
const startupError = new Error('The test program could not start.');
let child: ChildProcess;
let stdout: PassThrough;
let stderr: PassThrough;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(process, 'kill').mockReturnValue(true);
  child = new ChildProcess();
  Object.defineProperty(child, 'pid', { value: 42, configurable: true });
  stdout = new PassThrough();
  stderr = new PassThrough();
  child.stdout = stdout;
  child.stderr = stderr;
  spawners.shell.mockReset().mockReturnValue(child);
  spawners.program.mockReset().mockReturnValue(child);
});

afterEach(() => {
  child.emit('close', 0, null);
  stdout.destroy();
  stderr.destroy();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function killRequests(): number {
  return process.platform === 'win32'
    ? spawners.shell.mock.calls.filter((call) => call[0] === 'taskkill').length
    : vi.mocked(process.kill).mock.calls.length;
}

function cleaned(controller: AbortController): void {
  expect(vi.getTimerCount()).toBe(0);
  expect(controller.signal.removeEventListener).toHaveBeenCalledTimes(1);
  expect(controller.signal.removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  const previous = killRequests();
  controller.abort(cancellation);
  expect(killRequests()).toBe(previous);
}

describe.each(['shell', 'program'] as const)('%s cancellation boundaries (ADR 0039)', (kind) => {
  const spawner = kind === 'shell' ? spawners.shell : spawners.program;
  const invoke = (signal: AbortSignal, preparing = false) => {
    const shell: ShellCommand = { kind: 'bash', program: 'bash', args: (line) => [line] };
    const program: CommandLine = { command: 'worker', args: [] };
    if (preparing) {
      if (kind === 'shell') shell.args = () => { controller.abort(cancellation); return []; };
      else Object.defineProperty(program, 'args', { get: () => { controller.abort(cancellation); return []; } });
    }
    return kind === 'shell' ? runShell(shell, 'work', process.cwd(), timeoutMs, signal) : runProgram(program, process.cwd(), timeoutMs, signal);
  };
  let controller: AbortController;
  beforeEach(() => {
    controller = new AbortController();
    vi.spyOn(controller.signal, 'removeEventListener');
  });

  it('M2.4-E65 a pre-aborted signal creates no process, timer or listener', async () => {
    const added = vi.spyOn(controller.signal, 'addEventListener');
    controller.abort(cancellation);
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    child.emit('close', 0, null);
    await rejected;
    expect(spawners.shell).not.toHaveBeenCalled();
    expect(spawners.program).not.toHaveBeenCalled();
    expect(added).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('M2.4-E66 cancellation during preparation prevents spawn', async () => {
    const result = invoke(controller.signal, true);
    const rejected = expect(result).rejects.toBe(cancellation);
    child.emit('close', 0, null);
    await rejected;
    expect(spawner).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('M2.4-E67 cancellation during spawn is rechecked after registration', async () => {
    spawner.mockImplementationOnce(() => { controller.abort(cancellation); return child; });
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    const requests = killRequests();
    child.emit('close', null, 'SIGKILL');
    await rejected;
    expect(requests).toBe(1);
    cleaned(controller);
  });

  it('M2.4-E68 active cancellation waits for child shutdown, even after an error with a pid', async () => {
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    let settled = false;
    const tracked = result.then(() => { settled = true; }, () => { settled = true; });
    controller.abort(cancellation);
    child.emit('error', startupError);
    await Promise.resolve();
    const settledBeforeClose = settled;
    child.emit('close', null, 'SIGKILL');
    await rejected;
    await tracked;
    expect(settledBeforeClose).toBe(false);
    expect(killRequests()).toBe(1);
    cleaned(controller);
  });

  it('M2.4-E69 successful output and exit status are unchanged and resources are released', async () => {
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const result = invoke(controller.signal);
    stdout.write('answer');
    stderr.write('warning');
    child.emit('close', 0, null);
    expect(await result).toMatchObject(kind === 'shell'
      ? { output: 'answerwarning', exitCode: 0, timedOut: false, leftoverStopped: false }
      : { stdout: 'answer', stderr: 'warning', exitCode: 0, timedOut: false, startError: null });
    expect(removed).toHaveBeenCalledTimes(1);
    cleaned(controller);
  });

  it('M2.4-E70 startup error and subsequent close settle and clean only once', async () => {
    Object.defineProperty(child, 'pid', { value: undefined });
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const result = invoke(controller.signal);
    const checked = kind === 'shell' ? expect(result).rejects.toBe(startupError) : expect(result).resolves.toMatchObject({ startError: startupError.message, exitCode: null, timedOut: false });
    child.emit('error', startupError);
    child.emit('close', null, null);
    await checked;
    expect(removed).toHaveBeenCalledTimes(1);
    cleaned(controller);
  });

  it('M2.4-E71 timeout is distinct from cancellation and leaves no timer or listener', async () => {
    const result = invoke(controller.signal);
    await vi.advanceTimersByTimeAsync(timeoutMs);
    child.emit('close', null, 'SIGKILL');
    expect(await result).toMatchObject({ timedOut: true, exitCode: kind === 'shell' ? 124 : null });
    expect(killRequests()).toBe(1);
    cleaned(controller);
  });

  it.each(['timeout-first', 'cancel-first'] as const)('M2.4-E68, M2.4-E71 %s before close keeps cancellation and kills once', async (order) => {
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    if (order === 'cancel-first') controller.abort(cancellation);
    await vi.advanceTimersByTimeAsync(timeoutMs);
    if (order === 'timeout-first') controller.abort(cancellation);
    const requests = killRequests();
    child.emit('close', null, 'SIGKILL');
    await rejected;
    expect(requests).toBe(1);
    cleaned(controller);
  });

  it('M2.4-E72 cancellation followed by startup failure propagates cancellation', async () => {
    Object.defineProperty(child, 'pid', { value: undefined });
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    controller.abort(cancellation);
    child.emit('error', startupError);
    child.emit('close', null, null);
    await rejected;
    cleaned(controller);
  });

  it('M2.4-E74 cancellation delivered during listener installation is handled once', async () => {
    const add = controller.signal.addEventListener.bind(controller.signal);
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation((type, listener, options) => {
      add(type, listener, options);
      controller.abort(cancellation);
    });
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    child.emit('close', null, 'SIGKILL');
    await rejected;
    expect(killRequests()).toBe(1);
    cleaned(controller);
  });
});

describe('shell drain cleanup (ADR 0039)', () => {
  const invoke = (signal: AbortSignal) => runShell({ kind: 'bash', program: 'bash', args: () => [] }, 'work', process.cwd(), timeoutMs, signal);

  it('M2.4-E73 close clears the bounded output-drain timer', async () => {
    const controller = new AbortController();
    vi.spyOn(controller.signal, 'removeEventListener');
    const result = invoke(controller.signal);
    child.emit('exit', 0, null);
    expect(vi.getTimerCount()).toBe(2);
    child.emit('close', 0, null);
    await result;
    cleaned(controller);
  });

  it('M2.4-E73 cancellation during drain does not signal an exited shell again', async () => {
    const controller = new AbortController();
    vi.spyOn(controller.signal, 'removeEventListener');
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(cancellation);
    child.emit('exit', 0, null);
    const beforeCancel = killRequests();
    controller.abort(cancellation);
    await vi.advanceTimersByTimeAsync(1_000);
    const afterCancel = killRequests();
    child.emit('close', 0, null);
    await rejected;
    expect(afterCancel).toBe(beforeCancel);
    expect(stdout.destroyed).toBe(true);
    expect(stderr.destroyed).toBe(true);
    cleaned(controller);
  });

  it('M2.4-E73 exit after a settled startup error cannot create a drain timer', async () => {
    Object.defineProperty(child, 'pid', { value: undefined });
    const controller = new AbortController();
    vi.spyOn(controller.signal, 'removeEventListener');
    const result = invoke(controller.signal);
    const rejected = expect(result).rejects.toBe(startupError);
    child.emit('error', startupError);
    await rejected;
    child.emit('exit', null, null);
    expect(vi.getTimerCount()).toBe(0);
    child.emit('close', null, null);
    cleaned(controller);
  });
});
