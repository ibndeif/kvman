import { describe, expectTypeOf, it } from 'vitest';
import type { SessionDoc } from '../../src/schemas/records.ts';
import type { Session } from '../../src/sessions/session-view.ts';

type IntentFields = { stepGeneration: number; stepIntentId: string | null };

describe('step intent types (ADR0041)', () => {
  it('M2.4-E88 internal fields are typed without broadening the public session DTO', () => {
    expectTypeOf<Pick<SessionDoc, keyof IntentFields>>().toEqualTypeOf<IntentFields>();
    expectTypeOf<Extract<keyof Session, keyof IntentFields>>().toEqualTypeOf<never>();
  });
});
