import { describe, expect, it } from 'vitest';
import { checkDottedName, checkErrorCode, checkLiveAddress, checkTypeName, type TypeKind } from '../src/index.ts';
import { planCommands, planEvents, planQueries } from './plan-type-names.ts';

function expectNoFinding(name: string, kind: TypeKind): void {
  expect(checkTypeName(name, kind), `${kind} ${name}`).toEqual([]);
}

function onlyFinding(name: string, kind: TypeKind): { rule: string; message: string; hint?: string } {
  const findings = checkTypeName(name, kind);
  expect(findings, `${kind} ${name}`).toHaveLength(1);
  const [finding] = findings;
  if (finding === undefined) throw new Error(`no finding for ${name}`);
  return finding;
}

describe('naming grammar (plan 02 §2.4, ADR 0010)', () => {
  it('M0.2-H2 every example name of 02 §2.4 passes', () => {
    for (const name of ['pdf.translate', 'agent.session.fork', 'kernel.extension.install', 'agent.tool.record', 'agent.turn.expire', 'agent.session.set-model', 'fs.write', 'fs.edit']) {
      expectNoFinding(name, 'command');
    }
    for (const name of ['agent.sessions.list', 'pdf.files.list', 'kernel.trust.preview', 'fs.file.get', 'fs.dir.list', 'fs.files.search']) {
      expectNoFinding(name, 'query');
    }
    for (const name of ['pdf.translated', 'agent.entry.appended', 'kernel.message.dead-lettered', 'pdf.file.translated']) {
      expectNoFinding(name, 'event');
    }
    for (const address of ['agent.tokens.generated:01JAZ3K4M5N6P7Q8R9S0T1V2W3', 'shell.output.written:job-1', 'pdf.progress.updated:f1']) {
      expect(checkLiveAddress(address), address).toEqual([]);
    }
    expect(checkErrorCode('pdf/NOT_FOUND')).toEqual([]);
    expect(checkDottedName('agent.session')).toEqual([]);
    expect(checkDottedName('agent.chat.sidebar')).toEqual([]);
  });

  it('M0.2-H3 pdf.translated is rejected as a command with the hint', () => {
    expect(onlyFinding('pdf.translated', 'command')).toEqual({
      rule: 'grammar',
      message: 'command names end in an imperative verb',
      hint: 'did you mean "pdf.translate"?',
    });
  });

  it('M0.2-E21 malformed names get a format finding', () => {
    for (const name of ['pdf', 'pdf.Translate', 'pdf.set_model', 'pdf.2files', 'pdf..list', 'p.translate', `${'n'.repeat(33)}.translate`]) {
      const findings = checkTypeName(name, 'command');
      expect(findings.length, name).toBeGreaterThan(0);
      expect(findings.every((finding) => finding.rule === 'format'), name).toBe(true);
    }
    expectNoFinding(`${'n'.repeat(32)}.translate`, 'command');
  });

  it('M0.2-E22 an event that is not a past participle gets the documented hint', () => {
    expect(onlyFinding('pdf.file.translate', 'event')).toEqual({
      rule: 'grammar',
      message: 'event names end in a past participle',
      hint: 'did you mean "pdf.file.translated"?',
    });
  });

  it('M0.2-E23 a query that does not end in a read verb is flagged', () => {
    expect(onlyFinding('pdf.files.fetch', 'query')).toEqual({
      rule: 'grammar',
      message: 'query names end in a read verb (get, list, search, count, preview, validate)',
      hint: 'rename "pdf.files.fetch" to end in one of them',
    });
  });

  it('M0.2-E24 a command named with a read verb or an irregular participle is flagged', () => {
    expect(onlyFinding('pdf.files.list', 'command').message).toBe('command names end in an imperative verb, never a read verb');
    expect(onlyFinding('pdf.written', 'command')).toMatchObject({ hint: 'did you mean "pdf.write"?' });
  });

  it('M0.2-E25 base-form participles and -eed words count as verbs for commands', () => {
    for (const name of ['kernel.config.set', 'kernel.notifications.read-all', 'agent.retention.run', 'demo.data.seed', 'demo.media.embed']) {
      expectNoFinding(name, 'command');
    }
  });

  it('M0.2-E26 irregular participles end events, checked on the last word', () => {
    for (const name of ['shell.output.written', 'kernel.workspace.forgotten', 'kernel.message.dead-lettered']) {
      expectNoFinding(name, 'event');
    }
  });

  it('M0.2-E27 every type name of the plan passes the grammar of its kind', () => {
    for (const name of planCommands) expectNoFinding(name, 'command');
    for (const name of planQueries) expectNoFinding(name, 'query');
    for (const name of planEvents) expectNoFinding(name, 'event');
  });

  it('M0.2-E28 malformed live addresses are flagged', () => {
    expect(checkLiveAddress('agent.tokens.generated')).toHaveLength(1);
    expect(checkLiveAddress('agent.tokens.generated:')).toHaveLength(1);
    expect(checkLiveAddress('agent.tokens.generate:s1')).toMatchObject([{ rule: 'grammar' }]);
    expect(checkLiveAddress('Agent.tokens.generated:s1')).toMatchObject([{ rule: 'format' }]);
  });

  it('M0.2-E29 malformed error codes are flagged', () => {
    for (const code of ['pdf/not_found', 'PDF/NOT_FOUND', 'pdf.NOT_FOUND', 'pdf/NOT-FOUND']) {
      expect(checkErrorCode(code), code).toMatchObject([{ rule: 'format' }]);
    }
  });

  it('M0.2-E30 suggestions inflect common verbs', () => {
    expect(onlyFinding('demo.item.copy', 'event').hint).toBe('did you mean "demo.item.copied"?');
    expect(onlyFinding('demo.file.open', 'event').hint).toBe('did you mean "demo.file.opened"?');
    expect(onlyFinding('demo.items.copied', 'command').hint).toBe('did you mean "demo.items.copy"?');
    expect(onlyFinding('demo.file.written', 'command').hint).toBe('did you mean "demo.file.write"?');
  });
});
