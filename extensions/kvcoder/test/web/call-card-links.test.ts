import { describe, expect, it } from 'vitest';
import CallCard from '../../web/src/CallCard.vue';
import { callView } from '../../web/src/call-view.ts';
import { outputParts } from '../../web/src/output-links.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

describe('links in result cards (08 §8.7, ADR 0009, 120)', () => {
  it('M2.5-E38 local URLs in the output open in a new tab; other text and other URLs stay plain', async () => {
    const output = '{\n  "url": "http://127.0.0.1:3738/"\n}\nalso http://localhost:5173/x?y=1, not https://example.com or http://10.0.0.1:80/\n[exit code 0]';
    const card = await mounted(CallCard, createFakeKvman(), { view: callView({ description: 'Starting the preview.', connector: 'preview', command: 'start' }), output });
    await card.find('button').trigger('click');
    const links = card.findAll('[data-test="call-output"] a');
    expect(links.map((link) => link.attributes())).toEqual([
      expect.objectContaining({ href: 'http://127.0.0.1:3738/', target: '_blank', rel: 'noopener noreferrer' }),
      expect.objectContaining({ href: 'http://localhost:5173/x?y=1', target: '_blank', rel: 'noopener noreferrer' }),
    ]);
    expect(card.find('[data-test="call-output"]').text()).toBe(output);
  });

  it('M2.5-E38 the output splits into text and local links in order', () => {
    expect(outputParts('see http://127.0.0.1:3738/notes/hello.')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: 'http://127.0.0.1:3738/notes/hello' },
      { kind: 'text', text: '.' },
    ]);
    expect(outputParts('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
  });

  it("QA48-E14 local links stay links in a line's output, a text output, and a field's text", async () => {
    const href = 'http://localhost:5173/';
    const link = expect.objectContaining({ href, target: '_blank', rel: 'noopener noreferrer' });
    const line = await mounted(CallCard, createFakeKvman(), { view: callView({ description: 'Starting the app.', connector: 'shell', command: 'exec', payload: { line: 'npm run dev' } }), output: `ready at ${href}` });
    await line.find('button').trigger('click');
    expect(line.findAll('[data-test="call-output"] a').map((found) => found.attributes())).toEqual([link]);
    const text = await mounted(CallCard, createFakeKvman(), { view: callView({ description: 'Starting the preview.', connector: 'preview', command: 'start' }), output: `Open ${href}` });
    await text.find('button').trigger('click');
    expect(text.findAll('[data-test="call-output"] a').map((found) => found.attributes())).toEqual([link]);
    const field = await mounted(CallCard, createFakeKvman(), { view: callView({ description: 'Starting the preview.', connector: 'preview', command: 'start' }), output: JSON.stringify({ url: href, port: 5173 }) });
    await field.find('button').trigger('click');
    expect(field.findAll('[data-test="call-result-fields"] a').map((found) => found.attributes())).toEqual([link]);
  });
});
