import { describe, it, test } from 'vitest';

describe.only('focused suite', () => {});
it.skip('skipped test', () => {});
test.todo('placeholder test');
it.skipIf(true)('conditionally skipped test', () => {});
test.runIf(false)('conditionally run test', () => {});
