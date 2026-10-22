import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The release workflow (ADR 0026, 8 and 9; ADR 0099, 36 and 48): a pushed version tag publishes, after the tag check
// and the gates, and its `vscode` job publishes the VS Code extension.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
const tagCheck = `test "$GITHUB_REF_NAME" = "v$(node -p "require('./package.json').version")"`;
const vscodeJob = workflow.slice(workflow.indexOf('\n  vscode:\n'));

const position = (text: string): number => {
  const index = workflow.indexOf(text);
  expect(index, text).toBeGreaterThan(-1);
  return index;
};

describe('the release workflow (ADR 0026)', () => {
  it('QA38-H6 it runs on a version tag only, may ask npm for an identity, and publishes after the build, typecheck, and lint, without the tests', () => {
    expect(workflow).toContain("on:\n  push:\n    tags:\n      - 'v*'\n");
    expect(workflow).not.toMatch(/branches:|pull_request|schedule:|workflow_dispatch/);
    expect(workflow).toContain('permissions:\n  contents: read\n  id-token: write\n');

    expect(workflow).not.toMatch(/pnpm test|playwright/);

    const steps = [tagCheck, 'pnpm install --frozen-lockfile', 'pnpm build', 'pnpm typecheck', 'pnpm lint', 'pnpm changeset publish'].map(position);
    expect(steps).toEqual([...steps].sort((left, right) => left - right));
  });

  it('QA38-E4 the tag is compared with the root version before anything is installed or published', () => {
    expect(position(tagCheck)).toBeGreaterThan(position('actions/checkout@'));
    expect(position(tagCheck)).toBeLessThan(position('pnpm/action-setup@'));
  });

  it('QA38-E5 the token comes from the repository secret only, and no tracked file holds one', () => {
    expect(workflow.match(/NPM_TOKEN: .*/g)).toEqual(['NPM_TOKEN: ${{ secrets.NPM_TOKEN }}']);
    const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n');
    for (const file of tracked.filter((name) => path.basename(name) === '.npmrc')) {
      expect(readFileSync(path.join(root, file), 'utf8'), file).not.toContain('_authToken');
    }
  });

  it('QA38-E6 every action is pinned to a commit, with its version as a comment', () => {
    const uses = workflow.match(/uses: .*/g) ?? [];
    expect(uses).toHaveLength(6);
    for (const line of uses) expect(line).toMatch(/^uses: [\w-]+\/[\w-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });

  it('M4.3-H2 the vscode job checks the tag, packages, attaches to the tag draft release, and publishes to both stores', () => {
    expect(vscodeJob.length).toBeGreaterThan(100);
    expect(vscodeJob).toContain('    permissions:\n      contents: write\n');
    expect(workflow.match(/contents: write/g)).toHaveLength(1);
    const order = (text: string): number => {
      const index = vscodeJob.indexOf(text);
      expect(index, text).toBeGreaterThan(-1);
      return index;
    };
    const steps = [
      'actions/checkout@',
      tagCheck,
      'pnpm install --frozen-lockfile',
      'pnpm vscode:package',
      'gh release view "$GITHUB_REF_NAME" > /dev/null 2>&1 || gh release create "$GITHUB_REF_NAME" --draft',
      'gh release upload "$GITHUB_REF_NAME" packages/vscode/dist/kvman.vsix --clobber',
      'vsce publish --packagePath dist/kvman.vsix',
      'ovsx publish dist/kvman.vsix',
    ].map(order);
    expect(steps).toEqual([...steps].sort((left, right) => left - right));
  });

  it('M4.3-E1 packaging, the upload, and each publish are steps of their own, so a failed packaging publishes nothing', () => {
    const steps = ['      - run: pnpm vscode:package\n', "      - name: Attach the extension to the tag's draft release\n", '      - name: Publish to the VS Code Marketplace\n', '      - name: Publish to Open VSX\n'];
    for (const step of steps) expect(vscodeJob).toContain(step);
    expect(vscodeJob).not.toContain('continue-on-error');
  });

  it('M4.3-E2 the store tokens come from repository secrets only', () => {
    expect(workflow.match(/VSCE_PAT: .*/g)).toEqual(['VSCE_PAT: ${{ secrets.VSCE_PAT }}']);
    expect(workflow.match(/OVSX_PAT: .*/g)).toEqual(['OVSX_PAT: ${{ secrets.OVSX_PAT }}']);
    const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter((file) => file !== '' && !file.endsWith('.png'));
    for (const file of tracked.filter((name) => !name.startsWith('.github/') && !name.startsWith('plan/') && !name.startsWith('milestones/') && !name.endsWith('.test.ts'))) {
      expect(readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(/(VSCE|OVSX)_PAT\s*[:=]\s*\S/);
    }
  });
});
