import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { command } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { processExited } from '../isolation/harness.ts';
import { faultTests } from './crash-harness.ts';

const whoamiReply = z.object({ reply: z.object({ pid: z.number() }) });

describe('a killed kernel and its sandboxed hosts (plan 03 §3.5, ADR 0129)', faultTests, () => {
  it('M2.4-E30 a killed kernel leaves no sandboxed host running', async () => {
    const kernel = await launchKernel({ home: temporaryHome(), fixture: 'probe' });
    const answer = await command(kernel.port, 'probe.whoami', {}, { wait: 10_000 });
    const { pid } = whoamiReply.parse(answer.json).reply;
    expect(pid).not.toBe(kernel.pid);
    expect(processExited(pid)).toBe(false);
    process.kill(kernel.pid, 'SIGKILL');
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    await vi.waitFor(() => expect(processExited(pid)).toBe(true), { timeout: 10_000, interval: 20 });
  });
});
