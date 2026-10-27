import { z, type Ctx } from '@kvman/sdk';

// kvvideo's configuration on its extension page (plan 16 §16.2): three cards of setting rows, and nothing else. The
// keys' secrets are added in the page's own Secrets section (plan 06 §6.6).

const settings = (keys: readonly string[]) => keys.map((key) => ({ type: 'setting', key }));

const configuration = {
  type: 'stack',
  direction: 'vertical',
  gap: 'md',
  children: [
    { type: 'card', title: 'kvvideo.config.narration', children: settings(['kvvideo.narration.service', 'kvvideo.narration.voice', 'kvvideo.narration.model']) },
    { type: 'card', title: 'kvvideo.config.recording', children: settings(['kvvideo.browser']) },
    { type: 'card', title: 'kvvideo.config.programs', children: settings(['kvvideo.programs.ffmpeg', 'kvvideo.programs.ffprobe', 'kvvideo.programs.piper']) },
  ],
};

const contributionsSchema = z.object({ pages: z.array(z.json()), nav: z.array(z.json()), panels: z.array(z.json()), status: z.array(z.json()), configuration: z.json() });

export function registerUi(ctx: Ctx): void {
  ctx.registerQuery('kvvideo.ui.get', {
    description: "Gives kvvideo's UI: its configuration on its extension page.",
    input: z.object({}),
    output: contributionsSchema,
    public: true,
    handle: () => ({ pages: [], nav: [], panels: [], status: [], configuration }),
  });
}
