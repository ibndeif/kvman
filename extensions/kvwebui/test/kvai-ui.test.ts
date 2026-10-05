import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { checkAnswer, knownCalls } from '../web/src/contributions/registry.ts';

const kvaiFolder = fileURLToPath(new URL('../../kvai', import.meta.url));
const iconsFolder = fileURLToPath(new URL('../node_modules/@lucide/vue/dist/esm/icons', import.meta.url));
const icons = new Set(readdirSync(iconsFolder).filter((name) => name.endsWith('.mjs') && name !== 'index.mjs').map((name) => name.slice(0, -'.mjs'.length)));
const kernels: TestKernel[] = [];

afterEach(async () => {
  for (const kernel of kernels.splice(0)) await kernel.close();
});

describe("kvai's pages in kvwebui (07 §7.3, ADR 0009, 79)", () => {
  it("M2.2-E21 kvwebui's check accepts kvai.ui.get's answer: Models, Provider, and Add, with no tabs", async () => {
    const kernel = await createTestKernel({ extensions: [kvaiFolder] });
    kernels.push(kernel);
    const answer = await kernel.exec('kvai.ui.get', {});
    const extensions = await kernel.exec('kernel.extensions.list', {});
    const ownSettings = new Set(extensions.flatMap((extension) => (extension.namespace === 'kvai' ? extension.settings.map((setting) => setting.key) : [])));
    const result = checkAnswer(answer, knownCalls(extensions, icons), ownSettings);
    expect(result).not.toHaveProperty('problem');
    const pages = 'contributions' in result ? result.contributions.pages : [];
    expect(pages.map((page) => [page.id, page.params ?? []])).toEqual([['models', []], ['provider', ['providerId']], ['provider-add', []]]);
    expect(JSON.stringify(answer)).not.toContain('"tabs"');
  });

  it("QA21-H10 kvai.ui.get gives a configuration with its default model, which kvwebui's check accepts", async () => {
    const kernel = await createTestKernel({ extensions: [kvaiFolder] });
    kernels.push(kernel);
    const extensions = await kernel.exec('kernel.extensions.list', {});
    const result = checkAnswer(await kernel.exec('kvai.ui.get', {}), knownCalls(extensions, icons), new Set(['kvai.defaultModel']));
    expect('contributions' in result ? result.contributions.configuration : undefined).toEqual({
      type: 'card',
      children: [{ type: 'setting', key: 'kvai.defaultModel' }, { type: 'link', text: 'kvai.config.models', to: { page: 'kvai.models' } }],
    });
    expect(checkAnswer(await kernel.exec('kvai.ui.get', {}), knownCalls(extensions, icons), new Set())).toHaveProperty('problem');
  });
});
