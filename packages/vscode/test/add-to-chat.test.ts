import { describe, expect, it, vi } from 'vitest';
import { fileText, lastSelectedLine, selectionText } from '../src/chat-text.ts';

// What "Add to kvman chat" puts in the send box (15 §15.6, ADR 0100, 28).

type Fake = typeof import('./support/fake-vscode.ts');

async function withEditor(setup: (vscode: Fake) => void) {
  vi.resetModules();
  const vscode: Fake = await import('./support/fake-vscode.ts');
  vscode.fake.folders = [{ uri: vscode.Uri.file('/w') }];
  setup(vscode);
  const { chatTextFor } = await import('../src/add-to-chat.ts');
  return { vscode, chatTextFor };
}

function editorOn(vscode: Fake, file: string, from: [number, number], to: [number, number], code: string) {
  const selection = Object.assign(new vscode.Range(from[0], from[1], to[0], to[1]), { isEmpty: from[0] === to[0] && from[1] === to[1] });
  vscode.fake.editor = { selection, document: { uri: vscode.Uri.file(file), languageId: 'typescript', getText: () => code } };
}

describe('Add to kvman chat (15 §15.6, ADR 0100, 28)', () => {
  it('M4.6-H6 a selection gives its path and lines and the code fenced; one line gives one number', async () => {
    const { vscode, chatTextFor } = await withEditor((given) => editorOn(given, '/w/src/a.ts', [2, 0], [5, 0], 'const a = 1;\nconst b = 2;\nconst c = 3;\n'));
    expect(chatTextFor(vscode.Uri.file('/w/src/a.ts'))).toBe('`src/a.ts:3-5`\n```typescript\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```');
    expect(chatTextFor(undefined)).toBe('`src/a.ts:3-5`\n```typescript\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```');
    editorOn(vscode, '/w/src/a.ts', [3, 2], [3, 9], 'b = 2');
    expect(chatTextFor(undefined)).toBe('`src/a.ts:4`\n```typescript\nb = 2\n```');
  });

  it('M4.6-H6 a file from the explorer gives its path; nothing to add gives nothing', async () => {
    const { vscode, chatTextFor } = await withEditor(() => undefined);
    expect(chatTextFor(vscode.Uri.file('/w/README.md'))).toBe('`README.md`');
    expect(chatTextFor(vscode.Uri.parse('untitled:Untitled-1'))).toBeUndefined();
    expect(chatTextFor(undefined)).toBeUndefined();
    editorOn(vscode, '/w/src/a.ts', [1, 0], [1, 0], '');
    expect(chatTextFor(vscode.Uri.file('/w/README.md'))).toBe('`README.md`');
  });

  it('M4.6-H6 the text: lines, fences around code that holds a fence, and a selection ending at a line start', () => {
    expect(selectionText({ path: 'a.md', firstLine: 1, lastLine: 2, language: 'markdown', code: '```js\nx\n```\n' })).toBe('`a.md:1-2`\n````markdown\n```js\nx\n```\n````');
    expect(fileText('docs/a b.md')).toBe('`docs/a b.md`');
    expect(lastSelectedLine({ line: 2 }, { line: 5, character: 0 })).toBe(5);
    expect(lastSelectedLine({ line: 2 }, { line: 5, character: 3 })).toBe(6);
    expect(lastSelectedLine({ line: 2 }, { line: 2, character: 0 })).toBe(3);
  });
});
