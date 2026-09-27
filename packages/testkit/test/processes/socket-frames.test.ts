import { createConnection } from 'node:net';
import { socketLimits } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { frame, objectOf, openProcessesFixture, processTests, socketRequest, tokenProcess, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

// Everything a connection receives until the kernel closes it.
function received(socket: string, write: (connection: ReturnType<typeof createConnection>) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket);
    const chunks: Buffer[] = [];
    connection.on('data', (chunk: Buffer) => chunks.push(chunk));
    connection.on('error', reject);
    connection.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    write(connection);
  });
}

describe('kernel.sock frames (plan 12 §12.4, ADR 0140)', () => {
  it('M2.6-E25 a malformed or oversized frame is answered once and the connection closed', processTests, async () => {
    fixture = await openProcessesFixture();
    const { token } = await tokenProcess(fixture, { calls: ['runner.*'] });
    expect(objectOf((await socketRequest(fixture.socket, 'not json'))['problem'])['code']).toBe('VALIDATION_FAILED');
    expect(objectOf((await socketRequest(fixture.socket, frame(token, { op: 'publish', type: 'runner.echo', payload: {} })))['problem'])['code']).toBe('VALIDATION_FAILED');
    const oversized = await received(fixture.socket, (connection) => connection.write(Buffer.alloc(socketLimits.requestBytes + 1, 'a')));
    expect(objectOf(objectOf(JSON.parse(oversized))['problem'])['code']).toBe('PAYLOAD_TOO_LARGE');
    const first = frame(token, { op: 'query', type: 'runner.status.get', payload: {} });
    const both = await received(fixture.socket, (connection) => connection.end(`${first}\n${first}\n`));
    expect(both.trim().split('\n')).toEqual([JSON.stringify({ ok: true, data: { running: true } })]);
  });
});
