import { describe, expect, it } from 'vitest';
import ProviderAvatar from '../../web/src/ProviderAvatar.vue';
import { avatarOf, avatarPalette } from '../../web/src/avatar.ts';
import { createFakeKvman, mounted } from './support/fake-kvman.ts';

describe('the provider avatar (07 §7.3, ADR 0009, 243)', () => {
  it('QA16-H6 the letter is upper-cased and the colour is stable from the id', async () => {
    expect(avatarPalette).toEqual(['#a8472a', '#10624a', '#2b2f6b', '#4b3a8c', '#1a56a8', '#8a2f5a', '#1f5f7a', '#5a4a2a']);
    expect(avatarOf('openai', 'OpenAI')).toEqual({ letter: 'O', color: '#1a56a8' });
    expect(avatarOf('anthropic', 'Anthropic')).toEqual({ letter: 'A', color: '#a8472a' });
    expect(avatarOf('openai', 'openai').letter).toBe('O');
    expect(avatarOf('openai', 'OpenAI').color).toBe(avatarOf('openai', 'Other').color);
    expect(avatarOf('openai', 'OpenAI').color).not.toBe(avatarOf('anthropic', 'Anthropic').color);
    expect(avatarOf('openai', '').letter).toBe('?');

    const fake = createFakeKvman();
    const wrapper = await mounted(ProviderAvatar, fake, { providerId: 'openai', title: 'OpenAI' });
    const avatar = wrapper.find('[data-test="avatar"]');
    expect(avatar.text()).toBe('O');
    expect(avatar.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});
