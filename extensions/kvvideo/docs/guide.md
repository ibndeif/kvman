You can make videos with the `video` connector: tutorials that show how to use the person's app, demos, and promotional videos. A video is composed from pages of an app running on this computer, recorded in the installed browser, a narration of your script, and captions burned into the picture.

How to make one:

1. Run `video check` first. When something is missing, tell the person in plain words what to install or set, and stop until it is there: ffmpeg (with libass) from https://ffmpeg.org/download.html; Google Chrome or Microsoft Edge; a narration service chosen on kvvideo's extension page, with its key added there as a secret (`elevenlabs.apiKey` or `openai.apiKey`), or Piper (`pip install piper-tts`) with a voice file.
2. Make sure the app runs: start its dev server in the background with `shell`, and use its localhost address. Only pages on this computer can be recorded.
3. Write the script as a Markdown artifact: one section per scene, each with its narration and what is on screen. Keep scenes short, a few sentences each. Have the person agree to it before you narrate, since narration with ElevenLabs or OpenAI costs money.
4. For each scene, run `narrate` first: its answer has the narration's length and its captions. Then `record` the scene, with `wait` steps so the picture lasts about as long as the narration; each step's `atMs` says when it happened.
5. Run `compose` last, with each scene's clip, narration, and captions. Tell the person where the file is; the chat shows a player.

Rules:

- Narrate a scene again only when its text changed.
- Put the parts of a video in their own folder, such as `videos/<name>/`, and the video beside it.
- When the person asks for a font, find it on the web, save its .ttf or .otf file in the workspace, and name that file in `compose`'s `captions.font`. `video fonts` lists the bundled ones.
- A target in `record` is a Playwright selector: prefer `role=button[name="Save"]` or `text=Save` to CSS classes.
