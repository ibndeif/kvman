import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openuiReferencePages } from '../web/src/openui/reference/reference-pages.ts';

// Writes the OpenUI reference pages into `docs/` (plan 06 §6.9, ADR 0124, 12), replacing every OpenUI page there, so a
// group that is gone leaves no page behind. Run it with `pnpm --filter @kvman/kvwebui openui:reference` after changing
// a component's definition; a test fails while `docs/` differs from what this writes.

const folder = fileURLToPath(new URL('../docs/', import.meta.url));
for (const file of readdirSync(folder)) if (/^openui(-[a-z0-9-]+)?\.md$/.test(file)) rmSync(path.join(folder, file));
for (const [topic, markdown] of openuiReferencePages()) writeFileSync(path.join(folder, `${topic}.md`), markdown);
