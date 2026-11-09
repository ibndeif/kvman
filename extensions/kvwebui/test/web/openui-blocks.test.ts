import { describe, expect, it } from 'vitest';
import { computed, defineComponent, h, provide, ref } from 'vue';
import type { Scope } from '../../web/src/contributions/references.ts';
import { viewScopeKey } from '../../web/src/contributions/references.ts';
import { custom, customApi, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { mountApp, settle } from './support/mount-app.ts';
import { mountOpenui } from './support/openui-page.ts';

// A Markdown view whose text grows one line at a time, the way a streamed reply does: the component gives the view a
// reactive scope param, and the catalog key prints it as the Markdown source.
function streamer() {
  const text = ref('');
  const scope = computed<Scope>(() => ({ params: { body: text.value } }));
  const components = createFakeComponents();
  components.define(
    'notes.streamer',
    defineComponent({
      setup: () => {
        provide(viewScopeKey, scope);
        const kvman = useKvman();
        return () => h(kvman.View, { view: { type: 'markdown', text: 'notes.streamed', params: { body: { $param: 'body' } } } });
      },
    }),
  );
  const api = customApi(custom('notes.streamer'));
  api.catalogs['en'] = { ...api.catalogs['en'], 'notes.streamed': '{body}' };
  return { text, api, components };
}

function markdownApi(source: string, key = 'notes.md') {
  const api = customApi({ type: 'markdown', text: key });
  api.catalogs['en'] = { ...api.catalogs['en'], [key]: source };
  return api;
}

describe('OpenUI blocks in Markdown (06 §6.1, ADR 0124)', () => {
  it('M5.18-H1 a fenced `openui` block draws its components between its paragraphs', async () => {
    const source = [
      'Before **bold** text.',
      '',
      '```openui',
      'root = Card([header, body])',
      'header = CardHeader("Title")',
      'body = TextContent("Body text")',
      '```',
      '',
      'After paragraph.',
    ].join('\n');
    const app = await mountApp(markdownApi(source), '/notes/custom');
    const block = app.find('[data-test="openui"]');
    expect(block).not.toBeNull();
    expect(block?.querySelector('h2')?.textContent).toBe('Title');
    expect(block?.textContent).toContain('Body text');
    expect(app.find('strong')?.textContent).toBe('bold');
    expect(app.text()).toContain('Before');
    expect(app.text()).toContain('After paragraph.');
    expect(block?.querySelector('pre')).toBeNull();
    expect(app.find('[data-test="openui-source"]')).toBeNull();
  });

  it('M5.18-H2 a block streamed line by line draws as it arrives', async () => {
    const opening = '```openui\n';
    const root = 'root = Card([header, body])\n';
    const header = 'header = CardHeader("Streamed title")\n';
    const body = 'body = TextContent("Streamed body")\n';
    const closing = '```\n';
    const { text, api, components } = streamer();
    const app = await mountApp(api, '/notes/custom', components);
    text.value = opening + root;
    await settle();
    expect(app.text()).not.toContain('Streamed title');
    expect(app.text()).not.toContain('Streamed body');
    text.value += header;
    await settle();
    expect(app.text()).toContain('Streamed title');
    expect(app.text()).not.toContain('Streamed body');
    text.value += body;
    await settle();
    expect(app.text()).toContain('Streamed title');
    expect(app.text()).toContain('Streamed body');
    text.value += closing;
    await settle();
    const full = await mountApp(markdownApi(opening + root + header + body + closing, 'notes.full'), '/notes/custom');
    expect(app.find('[data-test="openui"]')?.innerHTML).toBe(full.find('[data-test="openui"]')?.innerHTML);
  });

  it("M5.18-E1 a block that draws nothing shows its source under the failure text", async () => {
    const source = ['```openui', 'hello world', '```', '', '```openui', 'root = Chart3D([1, 2])', '```'].join('\n');
    const app = await mountApp(markdownApi(source), '/notes/custom');
    const shown = app.findAll('[data-test="openui-source"]');
    expect(shown).toHaveLength(2);
    expect(shown.map((pre) => pre.textContent?.trim())).toEqual(['hello world', 'root = Chart3D([1, 2])']);
    expect(app.text()).toContain("Couldn't draw this UI");
    for (const pre of shown) expect(pre.parentElement?.querySelector('p')?.textContent).toBe("Couldn't draw this UI");
  });

  it('M5.18-E2 an unknown component or a missing required field leaves out that part', async () => {
    const source = [
      '```openui',
      'root = Card([text, chart, callout])',
      'text = TextContent("Kept text")',
      'chart = Chart3D("nope")',
      'callout = Callout("info", "Callout body")',
      '```',
    ].join('\n');
    const app = await mountApp(markdownApi(source), '/notes/custom');
    expect(app.text()).toContain('Kept text');
    expect(app.text()).not.toContain('Callout body');
    expect(app.find('[data-test="openui-source"]')).toBeNull();
    expect(app.find('[data-test="view-invalid"]')).toBeNull();
  });

  it('M5.18-E3 a block still streaming never shows its source', async () => {
    const app = await mountApp(markdownApi('```openui\nroot = Card([later])\n'), '/notes/custom');
    expect(app.find('[data-test="openui"]')).not.toBeNull();
    expect(app.findAll('[data-test="openui-source"]')).toHaveLength(0);
    expect(app.text()).not.toContain("Couldn't draw this UI");
  });

  it("M5.18-E10 an image in an OpenUI component's Markdown is a placeholder unless it is a data: image", async () => {
    const pixel = 'data:image/png;base64,iVBORw0KGgo=';
    const { app } = await mountOpenui(`root = Stack([remote, local])\nremote = TextContent("![chart](https://example.com/chart.png)")\nlocal = TextContent("![dot](${pixel})")`);
    expect(app.find('[data-test="openui-image-placeholder"]')?.textContent).toBe('chart (https://example.com/chart.png)');
    expect(app.findAll('[data-test="openui"] img').map((image) => image.getAttribute('src'))).toEqual([pixel]);
  });
});
