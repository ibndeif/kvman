import type { NarrationService } from '../settings.ts';

// What narration still needs (plan 16 §16.4): the first of the service, its key, Piper itself, and Piper's voice. No
// service is called.

export type NarrationChoice = { service: NarrationService | null; voice: string | null };

export type NarrationReadiness = { service: NarrationService | null; ready: boolean; missing: string | null };

/** The secret a paid service's key is kept in (ADR 0107, 21). */
export const keySecrets = { elevenlabs: 'elevenlabs.apiKey', openai: 'openai.apiKey' } as const;

export type NarrationProbe = { hasSecret(name: string): Promise<boolean>; piperRuns(): Promise<boolean> };

async function missingOf(choice: NarrationChoice, probe: NarrationProbe): Promise<string | null> {
  if (choice.service === null) return 'kvvideo.narration.service';
  if (choice.service !== 'piper') {
    const secret = keySecrets[choice.service];
    return (await probe.hasSecret(secret)) ? null : secret;
  }
  if (!(await probe.piperRuns())) return 'piper';
  return choice.voice === null ? 'kvvideo.narration.voice' : null;
}

export async function narrationReadiness(choice: NarrationChoice, probe: NarrationProbe): Promise<NarrationReadiness> {
  const missing = await missingOf(choice, probe);
  return { service: choice.service, ready: missing === null, missing };
}
