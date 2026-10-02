import { describe, expect, it } from 'vitest';
import type { ProgressChunk } from '@kvman/testkit';
import { kvaiDeltas, useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const bash = { name: 'bash', description: 'Runs a command.', parameters: { type: 'object', properties: { title: { type: 'string' }, command: { type: 'string' } }, required: ['title', 'command'] } };

async function streamed(argumentPieces: readonly string[]): Promise<unknown[]> {
  const { kernel, fake } = await kvai.start();
  fake.reply({ chunks: [{ toolCall: { id: 'call_1', name: 'bash', argumentPieces } }] });
  const chunks: ProgressChunk[] = [];
  await kernel.exec('harness.turn', { model: 'fake/m1', messages: [userSays('go')], tools: [bash] }, { onProgress: (chunk) => chunks.push(chunk) });
  return kvaiDeltas(chunks);
}

describe('kvai.complete streams a tool call as its arguments complete (07 §7.1, ADR 0009, 144)', () => {
  it('QA3-H7 reports the name, then each argument once it is complete, then all of them', async () => {
    const deltas = await streamed(['{"title":"Make the f', 'ile","description":"Writes it', ' now","command":"touch a', '.txt"}']);
    expect(deltas).toEqual([
      { type: 'toolcall', name: 'bash' },
      { type: 'toolcall', name: 'bash', arguments: { title: 'Make the file' } },
      { type: 'toolcall', name: 'bash', arguments: { title: 'Make the file', description: 'Writes it now' } },
      { type: 'toolcall', name: 'bash', arguments: { title: 'Make the file', description: 'Writes it now', command: 'touch a.txt' } },
    ]);
  });

  it('QA3-E8 never reports an argument that is still being written', async () => {
    const deltas = await streamed(['{"title":"Only a ti', 'tle that grows', ' and grows"}']);
    expect(deltas.slice(0, -1)).toEqual([{ type: 'toolcall', name: 'bash' }]);
    expect(deltas.at(-1)).toEqual({ type: 'toolcall', name: 'bash', arguments: { title: 'Only a title that grows and grows' } });
  });
});
