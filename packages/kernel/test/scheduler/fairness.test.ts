import { describe, expect, it } from 'vitest';
import { claimOf, complete, openSchedulerFixture, submit, workspaceA, workspaceB, type SchedulerFixture } from './harness.ts';

// One slot: each claim is completed before the next pick.
async function drain(fixture: SchedulerFixture, count: number): Promise<string[]> {
  fixture.dispatcher.setCommandSlots('@acme/pdf', 1);
  fixture.scheduler.pump();
  const order: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const claimed = fixture.dispatcher.claimedIds()[index];
    if (claimed === undefined) throw new Error(`only ${index} claims`);
    order.push(claimed);
    await complete(fixture, claimed);
  }
  return order;
}

describe('fairness (plan 03 §3.4, ADR 0064)', () => {
  it('M1.5-H2 a flood in one workspace does not starve another', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 4);
    await Promise.all(Array.from({ length: 200 }, () => submit(fixture, 'pdf.render', {}, { priority: 'normal' })));
    const inB = await submit(fixture, 'pdf.render', {}, { workspaceId: workspaceB, priority: 'normal' });
    expect(fixture.dispatcher.claims).toHaveLength(4);
    const before = fixture.dispatcher.claims.length;
    for (const claimed of fixture.dispatcher.claimedIds().slice(0, 2)) await complete(fixture, claimed);
    expect(fixture.dispatcher.claimedIds().slice(before, before + 2)).toContain(inB);
    const pendingInA = fixture.connection.prepare("SELECT COUNT(*) AS count FROM messages WHERE state = 'pending' AND workspace_id = ?").get(workspaceA);
    expect(Number(pendingInA?.['count'])).toBeGreaterThan(190);
  });

  it('M1.5-E3 claims rotate between workspaces and the no-workspace participant', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 0);
    for (let index = 0; index < 3; index += 1) {
      await submit(fixture, 'pdf.render', {}, { workspaceId: workspaceA });
      await submit(fixture, 'pdf.render', {}, { workspaceId: workspaceB });
      await submit(fixture, 'pdf.index.rebuild');
    }
    const order = await drain(fixture, 9);
    const participants = order.map((id) => claimOf(fixture, id).workspaceId ?? 'none');
    expect(participants).toEqual(['none', workspaceA, workspaceB, 'none', workspaceA, workspaceB, 'none', workspaceA, workspaceB]);
  });

  it('M1.5-E4 lanes and keyless queues of one workspace take turns', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 0);
    for (let index = 0; index < 2; index += 1) {
      await submit(fixture, 'pdf.translate', { fileId: 'f1' });
      await submit(fixture, 'pdf.translate', { fileId: 'f2' });
      await submit(fixture, 'pdf.render');
    }
    const order = await drain(fixture, 6);
    const queues = order.map((id) => {
      const message = claimOf(fixture, id);
      return message.lane ?? message.type;
    });
    expect(queues.slice(0, 3).sort()).toEqual(['file:f1', 'file:f2', 'pdf.render']);
    expect(queues.slice(3).sort()).toEqual(['file:f1', 'file:f2', 'pdf.render']);
  });
});
