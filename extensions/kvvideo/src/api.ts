import type { z } from '@kvman/sdk';
import type { composeInputSchema, composeOutputSchema } from './compose/compose-input.ts';
import type { narrateInputSchema, narrateOutputSchema } from './narration/register-narration.ts';
import type { recordInputSchema, recordOutputSchema } from './record/steps.ts';
import type { BrowserChoice, NarrationService } from './settings.ts';

// kvvideo's public names and settings for typed calls (plan 03 §3.2): a caller gets them after
// `import type {} from '@kvman/kvvideo'`.

type Empty = Record<string, never>;
type Channel = 'chrome' | 'msedge';

declare module '@kvman/sdk' {
  interface Commands {
    'kvvideo.video.start': { input: { sessionId: string; argument: string }; output: Empty };
    'kvvideo.video.compose': { input: z.input<typeof composeInputSchema>; output: z.output<typeof composeOutputSchema> };
    'kvvideo.narration.make': { input: z.input<typeof narrateInputSchema>; output: z.output<typeof narrateOutputSchema> };
    'kvvideo.clip.record': { input: z.input<typeof recordInputSchema>; output: z.output<typeof recordOutputSchema> };
  }
  interface Queries {
    'kvvideo.setup.get': {
      input: Empty;
      output: {
        ffmpeg: { ready: boolean; version: string | null; missing: string[] };
        browser: { ready: boolean; channel: Channel | null };
        narration: { service: NarrationService | null; ready: boolean; missing: string | null };
      };
    };
    'kvvideo.ui.get': { input: Empty; output: { pages: unknown[]; nav: unknown[]; panels: unknown[]; status: unknown[]; configuration: unknown } };
    'kvvideo.font.list': { input: Empty; output: { name: string; scripts: ('latin' | 'arabic')[] }[] };
  }
  interface Settings {
    'kvvideo.narration.service': NarrationService | null;
    'kvvideo.narration.voice': string | null;
    'kvvideo.narration.model': string | null;
    'kvvideo.browser': BrowserChoice;
    'kvvideo.programs.ffmpeg': string;
    'kvvideo.programs.ffprobe': string;
    'kvvideo.programs.piper': string;
  }
}
