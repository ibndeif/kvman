import { describe, expect, it } from 'vitest';
import CallCard from '../../web/src/CallCard.vue';
import { outputParts } from '../../web/src/output-links.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

describe('links in result cards (08 §8.7, ADR 0009, 120)', () => {
  it('M2.5-E38 local URLs in the output open in a new tab; other text and other URLs stay plain', async () => {
    const output = '{\n  "url": "http://127.0.0.1:3738/"\n}\nalso http://localhost:5173/x?y=1, not https://example.com or http://10.0.0.1:80/\n[exit code 0]';
    const card = await mounted(CallCard, createFakeKvman(), { description: 'Starting the preview.', label: 'preview · start', output });
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
});
