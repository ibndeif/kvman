import { describe, expect, it } from 'vitest';
import { crashAndRecover, faultTests } from './crash-harness.ts';
import { messageOf, steps } from './ledger-database.ts';

describe('crashes inside steps (plan 04 §4.5, 14 §14.3, ADR 0100)', faultTests, () => {
  it('M1.9-H5 step.after-begin: a started step that is not retry-safe surfaces EFFECT_INDETERMINATE', async () => {
    const run = await crashAndRecover('step.after-begin', { atCrash: steps });
    expect(run.crashed).toMatchObject([{ name: 'charge', state: 'started', retrySafe: false }]);
    const charge = run.read((connection) => messageOf(connection, run.crashed[0]?.messageId ?? ''));
    expect(charge).toMatchObject({ type: 'ledger.charge', state: 'failed', result: { ok: false, problem: { code: 'EFFECT_INDETERMINATE', params: { step: 'charge' } } } });
  });

  it('M1.9-H6 step.before-record: an effect that ran without its record surfaces EFFECT_INDETERMINATE', async () => {
    const run = await crashAndRecover('step.before-record', { atCrash: steps });
    expect(run.crashed).toMatchObject([{ name: 'charge', state: 'started', retrySafe: false }]);
    const charge = run.read((connection) => messageOf(connection, run.crashed[0]?.messageId ?? ''));
    expect(charge).toMatchObject({ state: 'failed', result: { ok: false, problem: { code: 'EFFECT_INDETERMINATE' } } });
  });

  it('M1.9-E5 step.after-begin in a retry-safe step runs the step again', async () => {
    const run = await crashAndRecover('step.after-begin@2', { atCrash: steps });
    const refund = run.crashed.find((step) => step.name === 'refund');
    expect(refund).toMatchObject({ state: 'started', retrySafe: true });
    expect(run.read(steps).find((step) => step.name === 'refund')).toMatchObject({ state: 'done' });
    expect(run.read((connection) => messageOf(connection, refund?.messageId ?? ''))).toMatchObject({ state: 'done', result: { ok: true, value: { refunded: 'r' } } });
  });
});
