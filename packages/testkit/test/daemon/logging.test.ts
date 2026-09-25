import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinoKernelLogger, RotatingLogFile, type DaemonLogger } from '@kvman/kernel';
import { describe, expect, it } from 'vitest';
import { acceptedOf, command, send } from '../adapters/http-client.ts';
import { eventually, workerTests } from '../hosts/harness.ts';
import { bootFixture, type DaemonFixture } from './harness.ts';

function fileLogger(home: string): DaemonLogger {
  const file = new RotatingLogFile({ folder: join(home, 'logs'), now: Date.now });
  const logger = pinoKernelLogger(file);
  return { write: (record) => logger.write(record), close: () => file.close() };
}

function lines(fixture: DaemonFixture): Array<Record<string, unknown>> {
  return readFileSync(join(fixture.home, 'logs', 'kernel.log'), 'utf8').trim().split('\n').map((line): Record<string, unknown> => JSON.parse(line));
}

function text(fixture: DaemonFixture): string {
  return readFileSync(join(fixture.home, 'logs', 'kernel.log'), 'utf8');
}

describe('logging (plan 13 §13.3, ADRs 0073, 0093)', workerTests, () => {
  it('M1.8-E64 log lines are JSON with attributes and no payload', async () => {
    const fixture = await bootFixture({ openLogger: fileLogger });
    expect((await command(fixture.port, 'notes.log', {})).status).toBe(200);
    const id = fixture.kernel.connection.prepare("SELECT id FROM messages WHERE type = 'notes.log'").get()?.['id'];
    await eventually(() => expect(lines(fixture).filter((line) => line['messageId'] === id)).toHaveLength(2));
    const [fetched, warned] = lines(fixture).filter((line) => line['messageId'] === id);
    expect(fetched).toMatchObject({
      level: 'info', msg: 'fetched', correlationId: id, messageId: id, type: 'notes.log', extension: '@acme/notes', workspaceId: 'a'.repeat(64), count: 2,
      apiKey: '[redacted]', nested: { password: '[redacted]' }, url: 'https://[redacted]@h/x',
    });
    expect(warned).toMatchObject({ level: 'warn', msg: 'Bearer [redacted]' });
    expect(text(fixture)).not.toContain('u:p@');
    await fixture.close();
  });

  it('M1.8-E65 requests are logged without query, headers, or body', async () => {
    const fixture = await bootFixture({ openLogger: fileLogger });
    const accepted = acceptedOf(await command(fixture.port, 'notes.add', { text: 'body-text-e65' }, { wait: 0 }, { 'x-kvman-client': 'client-e65' }));
    expect((await send(fixture.port, 'GET', `/api/v1/messages/${accepted.id}?secret=value-e65`)).status).toBe(200);
    const requests = lines(fixture).filter((line) => line['msg'] === 'request');
    expect(requests).toEqual([
      expect.objectContaining({ method: 'POST', route: '/api/v1/commands/:type', status: 202, durationMs: expect.any(Number) }),
      expect.objectContaining({ method: 'GET', route: '/api/v1/messages/:id', status: 200, durationMs: expect.any(Number) }),
    ]);
    for (const hidden of ['body-text-e65', 'client-e65', 'value-e65', accepted.id]) expect(text(fixture)).not.toContain(hidden);
    await fixture.close();
  });
});
