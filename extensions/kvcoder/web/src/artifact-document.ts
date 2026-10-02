// The document an HTML artifact is shown as (plan 08 §8.7, ADR 0009, 178 to 180). The artifact lives in a frame of its own
// inside a wrapper that carries the policy too: a frame's own navigation (a link, `location.href`) is judged by its
// parent's `frame-src`, which the policy sets to nothing, so the artifact can't load a page of its own choosing.

/** The policy of an HTML artifact: inline scripts and styles, `data:` images and fonts, and nothing else. */
export const artifactPolicy =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'";

const policyMeta = `<meta http-equiv="Content-Security-Policy" content="${artifactPolicy}">`;

// A doctype is one token that ends at its first `>`, where the browser's tokenizer ends it too.
const leadingDoctype = /^\s*<!doctype[^>]*>/i;

/** The artifact's own document: its content with the policy `<meta>` first, after a leading doctype. */
export function policedDocument(content: string): string {
  const doctype = leadingDoctype.exec(content)?.[0];
  if (doctype === undefined) return policyMeta + content;
  return doctype + policyMeta + content.slice(doctype.length);
}

const escapeAttribute = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

const fillStyle = 'html,body{margin:0;block-size:100%}iframe{display:block;border:0;inline-size:100%;block-size:100%}';

/** The `srcdoc` of an HTML artifact's frame: a wrapper with the policy that holds the artifact in a sandboxed frame. */
export function artifactDocument(content: string): string {
  return `<!doctype html>${policyMeta}<style>${fillStyle}</style><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(policedDocument(content))}"></iframe>`;
}
