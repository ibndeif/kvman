import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let k: TestKernel;

beforeEach(async () => {
  k = await createTestKernel({ extensions: [new URL('../src/extension.ts', import.meta.url)] });
});

afterEach(async () => {
  await k.close();
});

describe('hello, the first extension of the guide', { timeout: 60_000 }, () => {
  it('M2.13-E48 greets in the person\'s language and counts the greetings', async () => {
    expect(await k.asUser().command('hello.greet', { name: 'Sara' })).toEqual({ greeting: 'Hello, Sara!' });
    expect(await k.asUser().command('hello.greet', { name: 'Sara' })).toEqual({ greeting: 'Hello, Sara!' });
    expect(await k.asUser({ locale: 'ar' }).command('hello.greet', { name: 'Sara' })).toEqual({ greeting: 'مرحبا يا Sara!' });
    expect(await k.query('hello.greetings.count')).toEqual({ count: 3 });
  });
});
