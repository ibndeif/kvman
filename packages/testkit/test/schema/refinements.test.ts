import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { command, problemOf } from '../adapters/http-client.ts';
import { bootFixture, type DaemonFixture } from '../daemon/harness.ts';
import { workerTests } from '../hosts/harness.ts';

let fixture: DaemonFixture;
beforeEach(async () => {
  fixture = await bootFixture();
});
afterEach(async () => {
  await fixture.close();
});

describe('refinements are enforced by the host (plan 05 §5.12, 06 §6.3)', workerTests, () => {
  it('M2.1-H3 a .refine() rule rejects a payload the kernel\'s JSON Schema check admitted', async () => {
    const answer = await command(fixture.port, 'notes.add', { text: 'forbidden' });
    expect(answer.status).toBe(400);
    expect(problemOf(answer)).toMatchObject({ code: 'VALIDATION_FAILED', issues: [expect.objectContaining({ path: 'text', message: 'this text is not allowed' })] });
    const rows = fixture.kernel.connection.prepare("SELECT state FROM messages WHERE type = 'notes.add'").all();
    expect(rows).toEqual([{ state: 'failed' }]);
  });
});
