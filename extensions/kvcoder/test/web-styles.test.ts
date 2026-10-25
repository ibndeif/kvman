import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe("kvcoder's stylesheet (08 §8.7, ADR 0062, 1)", () => {
  it('M2.4-E211 a button of an actions row never shrinks and keeps its label on one line', async () => {
    const styles = await readFile(new URL('../web/styles/kvcoder.css', import.meta.url), 'utf8');
    const rule = /^\.kvc-actions > \.kvc-button \{([^}]*)\}/m.exec(styles)?.[1] ?? '';
    expect(rule).toContain('flex: 0 0 auto');
    expect(rule).toContain('white-space: nowrap');
  });

  it('QA67-H26 a narrow send box shows its pickers as icons, and an open panel takes the chat list away', async () => {
    const styles = await readFile(new URL('../web/styles/kvcoder.css', import.meta.url), 'utf8');
    expect(styles).toContain('.kvc-composer { container: kvc-composer / inline-size; }');
    const narrow = /@container kvc-composer \(max-inline-size: 36rem\) \{([\s\S]*?)\n\}/.exec(styles)?.[1] ?? '';
    expect(narrow).toContain('.kvc-composer-row .kvc-picker-icon { display: block; }');
    expect(narrow).toContain('.kvc-composer-row .kvc-picker-label { display: none; }');
    expect(styles).toContain(':root:has(.kvc-artifact-panel) .kvc-sessions { display: none; }');
    expect(styles).toContain(':root:has(.kvc-artifact-panel) .kvc-chats-bar, :root:has(.kvc-artifact-panel) .kvc-new-chat { display: flex; align-items: center; }');
  });
});

