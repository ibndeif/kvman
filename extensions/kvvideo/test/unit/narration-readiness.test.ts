import { describe, expect, it } from 'vitest';
import { narrationReadiness, type NarrationChoice } from '../../src/setup/narration-readiness.ts';

const probe = (secrets: readonly string[], piperRuns: boolean) => ({ hasSecret: async (name: string) => secrets.includes(name), piperRuns: async () => piperRuns });

describe('the narration part of check (16 §16.4)', () => {
  it('M5.1-E5 the first missing piece, then ready', async () => {
    const cases: [NarrationChoice, ReturnType<typeof probe>, string | null][] = [
      [{ service: null, voice: null }, probe([], true), 'kvvideo.narration.service'],
      [{ service: 'elevenlabs', voice: null }, probe(['openai.apiKey'], true), 'elevenlabs.apiKey'],
      [{ service: 'openai', voice: 'nova' }, probe(['elevenlabs.apiKey'], true), 'openai.apiKey'],
      [{ service: 'piper', voice: null }, probe([], false), 'piper'],
      [{ service: 'piper', voice: null }, probe([], true), 'kvvideo.narration.voice'],
      [{ service: 'elevenlabs', voice: null }, probe(['elevenlabs.apiKey'], false), null],
    ];
    for (const [choice, given, missing] of cases) {
      expect(await narrationReadiness(choice, given)).toEqual({ service: choice.service, ready: missing === null, missing });
    }
  });
});
