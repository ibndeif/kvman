import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import { runs, says } from '../support/model-script.ts';
import { kvmanWorld, until, useFakeModel, type Kvman, type KvmanWorld } from '../support/kvman-child.ts';
import { z } from '@kvman/sdk';
let world: KvmanWorld | undefined;
let fake: FakeOpenAI | undefined;
afterEach(async () => {
  await world?.close();
  await fake?.close();
  world = undefined;
  fake = undefined;
});

const healthSchema = z.object({ preset: z.string() });
const extensionsSchema = z.array(z.object({ name: z.string(), source: z.string() }));
const settingsSchema = z.array(z.object({ key: z.string(), value: z.unknown(), source: z.string() }));

async function presetSettings(call: (route: 'queries', name: string, input: unknown) => Promise<unknown>, keys: readonly string[]) {
  const settings = settingsSchema.parse(await call('queries', 'kernel.settings.list', {}));
  return Object.fromEntries(keys.map((key) => [key, settings.find((setting) => setting.key === key)]));
}

const chatSchema = z.object({ id: z.string() });
const turnSchema = z.array(z.object({ pending: z.array(z.object({ questionId: z.string(), kind: z.string() })), outcome: z.string().optional() }));
const resultSchema = z.object({ messages: z.array(z.object({ kind: z.string(), content: z.unknown() })) });

async function approvedCall(kvman: Kvman, model: FakeOpenAI, command: string, payload: Record<string, unknown>): Promise<string> {
  const { id } = chatSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Preset change' }));
  await kvman.call('commands', 'kvbuilder.build.start', { sessionId: id, argument: '' });
  model.reply(runs('kvman', command, payload), says('Done.'));
  await kvman.call('commands', 'kvcoder.message.send', { sessionId: id, text: 'Please change my app' });
  const pending = await until(() => kvman.call('queries', 'kvcoder.turn.list', { sessionId: id, limit: 1 }), turnSchema, (turns) => turns[0]?.pending.some((question) => question.kind === 'approval') ?? false);
  const questionId = pending[0]?.pending[0]?.questionId;
  expect(questionId).toBeDefined();
  await kvman.call('commands', 'kvcoder.question.answer', { questionId: String(questionId), answer: { confirmed: true } });
  await until(() => kvman.call('queries', 'kvcoder.turn.list', { sessionId: id, limit: 1 }), turnSchema, (turns) => turns[0]?.outcome === 'done');
  const messages = resultSchema.parse(await kvman.call('queries', 'kvcoder.message.list', { sessionId: id, limit: 50 }));
  expect(messages.messages.some((message) => message.kind === 'assistant')).toBe(true);
  const request = model.requests().at(-1);
  expect(request).toBeDefined();
  return JSON.stringify(request?.body);
}

describe('the bundled presets (11)', () => {
  it('M2.5-H3, QA4-H13 and QA17-H18 kvman with no preset flag starts the coder preset, with kvbuilder, and its shell approval is the default auto', async () => {
    world = kvmanWorld();
    const kvman = await world.start([]);
    expect(healthSchema.parse(await kvman.call('queries', 'kernel.health.get', {})).preset).toBe('coder');
    expect(extensionsSchema.parse(await kvman.call('queries', 'kernel.extensions.list', {})).map((extension) => [extension.name, extension.source])).toEqual([
      ['@kvman/kvai', 'bundled'],
      ['@kvman/kvwebui', 'bundled'],
      ['@kvman/kvcoder', 'bundled'],
      ['@kvman/kvbuilder', 'bundled'],
    ]);
    expect(await presetSettings(kvman.call, ['kvwebui.title', 'kvwebui.home', 'kvai.defaultModel', 'kvcoder.shell.approval'])).toEqual({
      'kvwebui.title': expect.objectContaining({ value: 'kvcoder.app.title', source: 'preset' }),
      'kvwebui.home': expect.objectContaining({ value: 'kvcoder.chat', source: 'preset' }),
      'kvai.defaultModel': expect.objectContaining({ value: 'anthropic/claude-sonnet-5-5', source: 'preset' }),
      'kvcoder.shell.approval': expect.objectContaining({ value: 'auto', source: 'default' }),
    });
    const connectors = z.array(z.object({ name: z.string(), owner: z.string() })).parse(await kvman.call('queries', 'kvcoder.connector.list', {}));
    expect(connectors.filter((connector) => connector.owner === '@kvman/kvbuilder').map((connector) => connector.name).sort()).toEqual(['docs', 'ext', 'kvman', 'preset', 'preview']);
  });

  it('QA42-H23 an approved model call changes the running preset home page', async () => {
    world = kvmanWorld();
    fake = await startFakeOpenAI();
    const kvman = await world.start(['--preset', 'coder']);
    await useFakeModel(kvman, fake);
    const result = await approvedCall(kvman, fake, 'preset-set', { key: 'kvwebui.home', value: 'kvwebui.extensions' });
    expect(result).toContain('restartRequired');
    expect(result).toContain('true');
    const stored = z.object({ settings: z.record(z.string(), z.unknown()) }).parse(await kvman.call('queries', 'kernel.preset.get', {}));
    expect(stored.settings['kvwebui.home']).toBe('kvwebui.extensions');
  });

  it('QA42-H24 an approved preset-save makes a new preset startable by name', async () => {
    world = kvmanWorld();
    fake = await startFakeOpenAI();
    const kvman = await world.start(['--preset', 'coder']);
    await useFakeModel(kvman, fake);
    expect(await kvman.call('commands', 'kvbuilder.preset.new', { name: 'notes-app', file: 'notes-app.json' })).toEqual({ file: 'notes-app.json' });
    const sourceFile = path.join(world.project, 'notes-app.json');
    const preset = z.object({ name: z.string(), extensions: z.record(z.string(), z.string()), settings: z.record(z.string(), z.unknown()) }).parse(JSON.parse(readFileSync(sourceFile, 'utf8')));
    writeFileSync(sourceFile, JSON.stringify({ ...preset, settings: { ...preset.settings, 'kvwebui.home': 'kvwebui.extensions' } }));
    const result = await approvedCall(kvman, fake, 'preset-save', { file: 'notes-app.json' });
    const saved = path.join(world.root, 'home', 'presets', 'notes-app.json');
    expect(result).toContain(saved);
    expect(readFileSync(saved, 'utf8')).toContain('"name": "notes-app"');
    await kvman.stop();
    const second = await world.start(['--preset', 'notes-app']);
    expect(healthSchema.parse(await second.call('queries', 'kernel.health.get', {})).preset).toBe('notes-app');
  });
});
