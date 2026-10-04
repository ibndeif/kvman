# Building an extension with the agent

This page is for people who haven't written an extension before. When you finish, you will have asked the agent to build one, tried it in a preview, and know where to go when you want to write the code yourself.

## What you are building

An extension adds something to kvman: a page, a tool, a connection to another service. kvman is made of extensions, so what you build sits beside the chat and the Settings page, with the same look and the same language support.

## Ask the agent

Open the **Chat** page in a workspace folder you don't mind adding files to, and describe what you want in plain words:

> Build me a notes extension: a page that lists my notes and a form to add one.

The agent creates a project in a new folder, checks it, runs its tests, and starts a preview. It does this with its `ext` and `preview` tools, and it reads the guides first (`docs list`). You see each step in the chat.

## Try it

When the agent says the preview is ready, open the link it gives. The preview is a separate kvman on a temporary home, with your extension on its **Extensions** page. If something looks wrong, tell the agent, and it edits the files; the preview reloads as it saves. Say "stop the preview" when you are done.

## Keep it

The project is just a folder in your workspace, with its own tests (`npm test`) and checks (`npm run check`). To use it in your everyday kvman:

1. Open the **Extensions** page.
2. Under **Add an extension**, type the package name from the project's `package.json` (for example `@me/notes`) and the source `path:` followed by the project's absolute folder.
3. Press **Install**, restart kvman, and trust the extension when the terminal asks.

Because it is added as a `path:` extension, kvman reloads it whenever you edit its files.

## What the agent can't see

The agent works inside the workspace folder you opened. It can't read your secrets, and a model call sends only the conversation, never your API keys or kvman's database.

## When you want to write the code yourself

The developer documentation starts with a 15-minute tutorial that works with or without an AI: [../developers/README.md](../developers/README.md). It covers the same project the agent builds: its files, how to test it, and how to preview it.

## Next

- [customizing-with-the-agent.md](customizing-with-the-agent.md)
- [extensions.md](extensions.md)
- [../developers/README.md](../developers/README.md)
