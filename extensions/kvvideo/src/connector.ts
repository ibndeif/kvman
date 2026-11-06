// The `video` connector (plan 16 §16.1 and §16.3; ADR 0107, 11; ADR 0115, 55; ADR 0117, 4; ADR 0120, 26): `optIn`, so a chat has it only after
// `/video`. Each command has one example of what it takes.

export const connectorName = 'video';

export const videoConnector = {
  name: connectorName,
  optIn: true as const,
  description:
    "Make any kind of video: record websites and HTML pages you write, use the person's images and clips and licensed ones from the web, narrate a script or have the person record it, and compose them with camera moves, transitions, captions, and sound into an MP4. Use it when the person asks for a video of any kind.",
  commands: [
    { name: 'check', command: 'kvvideo.setup.get', examples: [{ description: 'See what is ready before making a video', input: {} }] },
    { name: 'fonts', command: 'kvvideo.font.list', examples: [{ description: 'List the bundled caption fonts', input: {} }] },
    { name: 'brand', command: 'kvvideo.brand.get', examples: [{ description: "Read the workspace's brand", input: {} }] },
    {
      name: 'brand-set',
      command: 'kvvideo.brand.set',
      examples: [{ description: 'Save the brand the person agreed to', input: { logo: 'brand/logo.svg', colors: { primary: '#2563EB', background: '#0F172A', text: '#F8FAFC' }, font: 'Poppins' } }],
    },
    {
      name: 'narration-set',
      command: 'kvvideo.narration.set',
      examples: [{ description: 'Use the Piper voice the person agreed to, installed in the tools folder', input: { service: 'piper', voice: '/home/sam/.kvman/kvvideo/voices/ar_JO-kareem-medium.onnx' } }],
    },
    {
      name: 'record',
      command: 'kvvideo.clip.record',
      examples: [
        {
          description: 'Record signing in to an app, each action as the narration says it',
          input: { url: 'http://localhost:5173/', file: 'videos/tour/01.mp4', narration: 'videos/tour/01.mp3', steps: [{ do: 'type', target: 'role=textbox[name="Email"]', text: 'sam@example.com', atLine: 1 }, { do: 'click', target: 'role=button[name="Sign in"]', atLine: 2 }] },
        },
      ],
    },
    {
      name: 'look',
      command: 'kvvideo.frame.capture',
      images: true as const,
      examples: [{ description: "Look at a title scene as its words come in, before recording it", input: { page: 'videos/tour/00-title.html', atMs: [500, 1500, 3000] } }],
    },
    {
      name: 'narrate',
      command: 'kvvideo.narration.make',
      examples: [{ description: "Narrate a scene's script, warm and a little slower", input: { text: 'This is Notes. Sign in with your email to see your notes.', file: 'videos/tour/01.mp3', tone: 'warm and friendly', speed: 0.95 } }],
    },
    {
      name: 'voice',
      command: 'kvvideo.voice.make',
      examples: [{ description: "Make a scene's narration from the person's takes", input: { lines: [{ take: 'videos/tour/voice-1/line-1.webm', text: 'This is Notes.' }, { take: 'videos/tour/voice-1/line-2.webm', text: 'Sign in with your email.' }], file: 'videos/tour/01.mp3' } }],
    },
    {
      name: 'compose',
      command: 'kvvideo.video.compose',
      card: 'kvvideo.player',
      examples: [
        {
          description: 'Compose a title page and a narrated recording, with a callout, a slide, and a phone version',
          input: {
            file: 'videos/tour.mp4',
            extraSizes: [{ width: 1080, height: 1920 }],
            scenes: [
              { clip: 'videos/tour/00-title.mp4', narration: 'videos/tour/00.mp3', transition: { kind: 'slide' } },
              { clip: 'videos/tour/01.mp4', narration: 'videos/tour/01.mp3', overlays: [{ kind: 'callout', step: 2, text: 'Sign in here', fromMs: 1500, toMs: 4000 }] },
            ],
          },
        },
      ],
    },
    {
      name: 'review',
      command: 'kvvideo.video.review',
      images: true as const,
      examples: [{ description: 'Look over a composed video before telling the person it is ready', input: { file: 'videos/tour.mp4' } }],
    },
  ],
};
