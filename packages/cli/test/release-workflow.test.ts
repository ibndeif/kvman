import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The release workflow (ADR 0026, 8 and 9): a pushed version tag publishes, after the tag check and the gates.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
const tagCheck = `test "$GITHUB_REF_NAME" = "v$(node -p "require('./package.json').version")"`;

const position = (text: string): number => {
  const index = workflow.indexOf(text);
  expect(index, text).toBeGreaterThan(-1);
  return index;
};

describe('the release workflow (ADR 0026)', () => {
  it('QA38-H6 it runs on a version tag only, may ask npm for an identity, and publishes after the gates', () => {
    expect(workflow).toContain("on:\n  push:\n    tags:\n      - 'v*'\n");
    expect(workflow).not.toMatch(/branches:|pull_request|schedule:|workflow_dispatch/);
    expect(workflow).toContain('permissions:\n  contents: read\n  id-token: write\n');

    const steps = [tagCheck, 'pnpm install --frozen-lockfile', 'pnpm typecheck', 'pnpm lint', 'pnpm test', 'pnpm build', 'pnpm changeset publish'].map(position);
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
});
