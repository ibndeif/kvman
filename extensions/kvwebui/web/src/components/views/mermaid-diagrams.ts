import DOMPurify from 'dompurify';

// Mermaid diagrams in rendered Markdown (plan 06 §6.4, ADR 0067). The Markdown view marks a fenced `mermaid` block,
// and this draws each one in its place. Mermaid is loaded only when a block is there. It runs in its strict mode with
// no HTML labels, and its SVG is sanitized before it enters the page. A block that isn't a valid diagram stays as its
// source. A drawn diagram is kept by its source and theme, so a view that renders again doesn't draw it again.

const kept = 50;
const drawn = new Map<string, string>();
let drawings = 0;

async function draw(source: string, theme: 'dark' | 'neutral'): Promise<string | undefined> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, htmlLabels: false, flowchart: { htmlLabels: false } });
  if ((await mermaid.parse(source, { suppressErrors: true })) === false) return undefined;
  const { svg } = await mermaid.render(`kvwebui-mermaid-${String((drawings += 1))}`, source);
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

function remember(key: string, svg: string): void {
  drawn.set(key, svg);
  const oldest = drawn.keys().next();
  if (drawn.size > kept && oldest.done !== true) drawn.delete(oldest.value);
}

/** Draws every marked `mermaid` block under `root` that is a valid diagram, in the app's theme. */
export async function drawDiagrams(root: HTMLElement): Promise<void> {
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'neutral';
  for (const block of root.querySelectorAll<HTMLElement>('pre[data-mermaid]')) {
    const source = block.textContent;
    const key = `${theme}\n${source}`;
    const svg = drawn.get(key) ?? (await draw(source, theme));
    if (svg === undefined) continue;
    remember(key, svg);
    // The view may have rendered again while the diagram was drawn: the block is then no longer on the page.
    if (!block.isConnected) continue;
    const figure = document.createElement('div');
    figure.className = 'kvwebui-mermaid';
    figure.dataset['mermaid'] = 'drawn';
    figure.innerHTML = svg;
    block.replaceWith(figure);
  }
}
