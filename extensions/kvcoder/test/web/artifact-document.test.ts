import { describe, expect, it } from 'vitest';
import { artifactDocument, artifactPolicy, policedDocument } from '../../web/src/artifact-document.ts';

const meta = `<meta http-equiv="Content-Security-Policy" content="${artifactPolicy}">`;

// What the browser reads out of the inner frame's `srcdoc` attribute.
const innerOf = (outer: string): string => /srcdoc="([^"]*)"/.exec(outer)?.[1]?.replaceAll('&quot;', '"').replaceAll('&amp;', '&') ?? '';

describe("an HTML artifact's document (08 §8.7, ADR 0009, 178 to 180)", () => {
  it('QA6-H19 the policy is the one the plan lists, and it is the first element of the artifact and of its wrapper', () => {
    expect(artifactPolicy).toBe("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'");
    expect(policedDocument('<p>x</p>')).toBe(`${meta}<p>x</p>`);
    const outer = artifactDocument('<p>x</p>');
    expect(outer.startsWith(`<!doctype html>${meta}`)).toBe(true);
    expect(outer).toContain('<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="');
    expect(innerOf(outer)).toBe(`${meta}<p>x</p>`);
  });

  it('QA6-E15 the policy goes after a leading doctype, in any case and after whitespace, and nowhere else', () => {
    for (const doctype of ['<!doctype html>', '<!DOCTYPE html>', '  \n<!DocType HTML PUBLIC "x">']) {
      expect(policedDocument(`${doctype}<html></html>`)).toBe(`${doctype}${meta}<html></html>`);
    }
    expect(policedDocument('<p>a <!doctype html></p>')).toBe(`${meta}<p>a <!doctype html></p>`);
  });

  it('QA6-E26 the artifact reaches its frame whole: quotes and ampersands in it are escaped, and it can not close the attribute', () => {
    const hostile = '"><script>top.location="http://evil"</script><p a="&amp;">&quot;';
    const outer = artifactDocument(hostile);
    expect(innerOf(outer)).toBe(`${meta}${hostile}`);
    expect(outer.slice(outer.indexOf('srcdoc="') + 8).indexOf('"')).toBe(outer.slice(outer.indexOf('srcdoc="') + 8).length - '"></iframe>'.length);
  });
});
