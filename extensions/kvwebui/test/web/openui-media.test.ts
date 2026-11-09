import { describe, expect, it, vi } from 'vitest';
import { ProblemError, type Json } from '@kvman/sdk';
import { click, mountApp, settle } from './support/mount-app.ts';
import { openuiPage } from './support/openui-page.ts';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';
const pathOf = (input: Json): string => (typeof input === 'object' && input !== null && !Array.isArray(input) ? String(input['path']) : '');
const images = [
  'root = Stack([local, inline, remote, refused, avatar])',
  'local = Image("A screenshot", "shots/home.png")',
  `inline = ImageBlock("${pixel}", "A dot")`,
  'remote = Image("A web photo", "https://example.com/photo.png")',
  'refused = Image("Outside", "../secret.png")',
  'avatar = ImageText("shots/me.png", "Me", "Ada")',
].join('\n');

const gallery = `root = Stack([pictures])\npictures = ImageGallery([{src: "${pixel}", alt: "First"}, {src: "${pixel}", alt: "Second", details: "Taken at noon"}, {src: "${pixel}", alt: "Third"}])`;

async function mounted(source: string) {
  const { api, components } = openuiPage(source);
  const read = vi.fn((input: Json) => {
    const path = pathOf(input);
    if (path === '../secret.png') throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Outside the workspace.' });
    return { type: 'image/png', data: `${path}-bytes` };
  });
  api.handlers.set('kvwebui.image.get', read);
  const app = await mountApp(api, '/notes/custom', components);
  await settle();
  return { app, read };
}

describe('OpenUI images (06 §6.1 and §6.8, ADR 0124, 7 and 19)', () => {
  it('M5.20-H4 a workspace image draws through kvwebui.image.get, a data: image draws, and anything else is a placeholder', async () => {
    const { app, read } = await mounted(images);
    expect(read.mock.calls.map(([input]) => pathOf(input)).sort()).toEqual(['../secret.png', 'shots/home.png', 'shots/me.png']);
    const sources = [...app.root.querySelectorAll('img')].map((image) => [image.getAttribute('alt'), image.getAttribute('src')]);
    expect(sources).toEqual([
      ['A screenshot', 'data:image/png;base64,shots/home.png-bytes'],
      ['A dot', pixel],
      ['Me', 'data:image/png;base64,shots/me.png-bytes'],
    ]);
    expect(app.findAll('[data-test="openui-image-placeholder"]').map((placeholder) => placeholder.textContent.trim())).toEqual(['A web photo (https://example.com/photo.png)', 'Outside (../secret.png)']);
    expect(app.text()).toContain('Ada');
  });

  it('M5.20-H5 a gallery image opens larger in a dialog with its details, and Escape closes it', async () => {
    const { app } = await mounted(gallery);
    await click(app.find('button[aria-label="Second"]'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Second');
    expect(dialog?.textContent).toContain('Taken at noon');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('M5.20-E6 an argument skipped with null is left out', async () => {
    const { app } = await mounted('root = Stack([cards, photo])\ncards = VisualCardBlock([v1, v2])\nv1 = VisualCardItem(BoldText("text", "Room"), "v1", null, Tag("New"))\nv2 = VisualCardItem(BoldText("text", "Hall"))\nphoto = Image("A photo", null)');
    expect(app.text()).toContain('Room');
    expect(app.text()).toContain('New');
    expect(app.findAll('[data-test="openui-image-placeholder"]').map((placeholder) => placeholder.textContent.trim())).toEqual(['A photo']);
  });
});
