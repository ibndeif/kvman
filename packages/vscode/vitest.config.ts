import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

// The extension's tests (plan 12 §12.1, ADR 0099, 35): Node, with `vscode` replaced by a fake of the parts it uses.
export default defineProject({
  resolve: { alias: { vscode: fileURLToPath(new URL('test/support/fake-vscode.ts', import.meta.url)) } },
  test: {
    name: 'vscode',
    include: ['test/**/*.test.ts'],
    exclude: ['test/web/**'],
  },
});
