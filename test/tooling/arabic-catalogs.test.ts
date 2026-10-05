import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const owners = ['packages/kernel', 'extensions/kvai', 'extensions/kvwebui', 'extensions/kvcoder', 'extensions/kvcustomizer'];

function arabicTexts(): [key: string, text: string][] {
  return owners.flatMap((owner) => {
    const catalog: unknown = JSON.parse(readFileSync(`${root}/${owner}/locales/ar.json`, 'utf8'));
    return typeof catalog === 'object' && catalog !== null ? Object.entries(catalog).map(([key, text]): [string, string] => [key, String(text)]) : [];
  });
}

// The terms ADR 0013 (10) replaced, each as it was written.
const replaced = ['الصدفة', 'موجّه', 'مستند', 'خطة', 'خطت', 'واجهة برمجية', 'امتداد', 'لسان', 'المتصل ', 'المنزل', 'العمّال', ' رمز'];

describe('the Arabic catalogs (ADR 0013, 10)', () => {
  it('QA20-E11 hold no replaced term, no Eastern Arabic digit, and no Latin letter right after و', () => {
    const texts = arabicTexts();
    expect(texts.length).toBeGreaterThan(500);
    expect(texts.filter(([, text]) => replaced.some((term) => text.includes(term))).map(([key]) => key)).toEqual([]);
    expect(texts.filter(([, text]) => /[٠-٩]/u.test(text)).map(([key]) => key)).toEqual([]);
    expect(texts.filter(([, text]) => /(^|\s)و[A-Za-z]/u.test(text)).map(([key]) => key)).toEqual([]);
  });
});
