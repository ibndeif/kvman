import { describe, expect, it } from 'vitest';
import { translator, type Language } from '../../src/catalog.ts';
import type { View } from '../../src/session.ts';
import { viewHtml, type PageView } from '../../src/view-html.ts';

const context = (language: Language = 'en') => ({ language, translate: translator(language), place: 'view' as const, cspSource: 'https://web.source', nonce: 'n0nce', scriptUri: 'https://web.source/page/relay.js', styleUri: 'https://web.source/page.css', logFile: '/home/p/.kvman/logs/kvman.log' });
// The page as an inert template, which loads nothing; its <html> and <body> attributes are read from its text.
function page(view: PageView, language: Language = 'en'): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = viewHtml(view, context(language));
  return template.content;
}
const opening = (view: PageView, tag: string, language: Language = 'en') => new RegExp(`<${tag}([^>]*)>`).exec(viewHtml(view, context(language)))?.[1] ?? '';
const policyOf = (shown: DocumentFragment) => shown.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');
const actions = (shown: DocumentFragment) => [...shown.querySelectorAll('button')].map((button) => [button.dataset['action'], button.textContent]);
const failed = (code: string, message = 'the message'): View => ({ kind: 'failed', problem: { code, message } });

describe("the view's page (15 §15.4, ADR 0099, 22)", () => {
  it("M4.2-H16 the frame's policy allows only kvman's origin, and the frame may use the clipboard", () => {
    const frameView: PageView = { kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&open=parent', port: 3737 };
    const shown = page(frameView);
    expect(policyOf(shown)).toBe("default-src 'none'; frame-src http://127.0.0.1:3737; script-src 'nonce-n0nce'; style-src https://web.source");
    const frame = shown.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('http://127.0.0.1:3737/?workspace=w1&open=parent');
    expect(frame?.getAttribute('allow')).toBe('clipboard-read; clipboard-write');
    expect(frame?.hasAttribute('sandbox')).toBe(false);
    expect(opening(frameView, 'body')).toBe(' data-place="view" data-origin="http://127.0.0.1:3737"');
    expect(shown.querySelector('script')?.getAttribute('nonce')).toBe('n0nce');
    expect(policyOf(page({ kind: 'stopped' }))).toBe("default-src 'none'; script-src 'nonce-n0nce'; style-src https://web.source");
  });

  it('M4.2-H9 a failed start shows its code, message, and hint, or the log for another code', () => {
    const port = page(failed('PORT_IN_USE'));
    expect(port.querySelector('h1')?.textContent).toBe('kvman could not start');
    expect(port.querySelector('.code')?.textContent).toBe('PORT_IN_USE: the message');
    expect(port.textContent).toContain("Another program uses kvman's port.");
    expect(actions(port)).toEqual([['start', 'Try again'], ['showLog', 'Show the log']]);
    expect(page(failed('INTERNAL')).textContent).toContain('Details are in /home/p/.kvman/logs/kvman.log.');
  });

  it("M4.2-H4 M4.2-H5 M4.2-H6 M4.2-H14 M4.8-H6 each state's text and buttons", () => {
    const cases: [View, string, (string | undefined)[][]][] = [
      [{ kind: 'missing' }, "kvman isn't installed.", [['install', 'Install kvman']]],
      [{ kind: 'installing' }, 'Installing kvman… The terminal shows its progress.', []],
      [{ kind: 'npmMissing', update: false }, "npm wasn't found. Install Node.js 24, then try again.", [['nodejs', 'Get Node.js'], ['install', 'Try again']]],
      [{ kind: 'installFailed', update: true }, "kvman couldn't be installed. The terminal shows why.", [['update', 'Try again']]],
      [{ kind: 'tooOld', version: '0.3.9', minimum: '0.4.7' }, 'kvman 0.3.9 is older than this extension needs (0.4.7).', [['update', 'Update kvman']]],
      [{ kind: 'oldRunning', version: '0.4.6', minimum: '0.4.8' }, 'kvman 0.4.6 is already running, and this extension needs 0.4.8. Quit it, then start again.', [['start', 'Start again'], ['openAnyway', 'Open anyway']]],
      [{ kind: 'stopped' }, 'kvman stopped unexpectedly.', [['start', 'Start again'], ['showLog', 'Show the log']]],
      [{ kind: 'remote' }, 'kvman works on local folders only for now.', []],
      [{ kind: 'starting' }, 'Starting kvman…', []],
    ];
    for (const [view, text, buttons] of cases) {
      const shown = page(view);
      expect(shown.textContent, view.kind).toContain(text);
      expect(actions(shown), view.kind).toEqual(buttons);
    }
    expect(page({ kind: 'starting' }).querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('M4.2-H17 Arabic pages are right to left, English ones left to right', () => {
    expect(opening({ kind: 'stopped' }, 'html', 'ar')).toBe(' lang="ar" dir="rtl"');
    expect(page({ kind: 'stopped' }, 'ar').textContent).toContain('توقف kvman على نحو غير متوقع.');
    expect(page({ kind: 'oldRunning', version: '0.4.6', minimum: '0.4.8' }, 'ar').textContent).toContain('يعمل الإصدار 0.4.6 من kvman بالفعل، وتحتاج هذه الإضافة إلى 0.4.8.');
    expect(opening({ kind: 'stopped' }, 'html')).toBe(' lang="en" dir="ltr"');
  });

  it('M4.2-E7 the text of a Problem is escaped', () => {
    const html = viewHtml(failed('INTERNAL', '<img src=x onerror=alert(1)>'), context());
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });
});
