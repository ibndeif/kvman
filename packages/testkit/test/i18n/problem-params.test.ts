import { afterEach, describe, expect, it } from 'vitest';
import { command, problemOf } from '../adapters/http-client.ts';
import { temporaryHome } from '../daemon/harness.ts';
import { bootHome, type BootedHome } from '../first-run/builtins.ts';
import { workspaceA } from '../hosts/harness.ts';
import { i18nTests, prepareLingoHome } from './harness.ts';

let fixture: BootedHome | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('Problem parameters over HTTP', i18nTests, () => {
  it('M2.11-E43 returns registered Problem.params with its HTTP status', async () => {
    const home = temporaryHome();
    await prepareLingoHome(home);
    fixture = await bootHome(home);
    const answer = await command(fixture.kernel.identity.port, 'lingo.fail', { itemId: 'i1' }, { workspaceId: workspaceA });
    expect(answer.status).toBe(422);
    expect(problemOf(answer)).toMatchObject({ code: 'lingo/MISSING', title: 'No such item', params: { itemId: 'i1' }, retryable: false });
  });
});
