# Privacy and security

This page is for anyone who wants to know what kvman keeps on their computer, what leaves it, and what protects it. When you finish, you can say where your data is, what is sent to a model provider, and why other programs and web pages can't reach kvman.

## Local only

kvman runs on your computer, in the terminal you started it in. Its web server listens on `127.0.0.1` (the loopback address) and nowhere else, so other computers on your network can't connect to it. Your data is in one folder, your kvman home (`~/.kvman` by default), and nothing is uploaded to a kvman server: there isn't one.

Two checks protect the web server, and they can't be turned off:

- A request is accepted only if its `Host` is `127.0.0.1:<port>` or `localhost:<port>`.
- A request that carries an `Origin` is accepted only if it is exactly kvman's own address. A web page you happen to have open elsewhere can't call kvman, and a request that fails the check gets `FORBIDDEN_ORIGIN`.

There is no password in this phase: any program running as you, on this computer, can call kvman's API. Don't run untrusted programs on the same account, and don't forward the port to another machine.

## What leaves your computer

- **Model calls.** When the agent or an extension asks a model, kvman sends the conversation, the tool descriptions, and the files or text the conversation includes to the provider you connected (Anthropic, OpenAI, your own server, and so on), over your connection and under that provider's terms. Nothing is sent until you connect a provider and send a message.
- **Installing extensions and updating kvman** use npm and your network.
- **Signing in with a plan** opens the provider's own sign-in page in your browser, and keeps the result as a secret.

Nothing else leaves: kvman has no telemetry, no analytics, and no remote logging.

## Extensions and trust

An extension is code that runs with your permissions, and in this phase there is **no sandbox**. kvman therefore asks before it runs any extension that doesn't ship with it:

- At start, kvman lists the name, version, and source of each extension version you haven't accepted, and asks `y` or `N` in the terminal. `--yes` accepts them all without asking.
- Accepted versions are remembered. A new version asks again, and a `path:` extension is remembered by its folder.
- Without a terminal and without `--yes`, kvman refuses to start rather than run code you haven't accepted.

Only add extensions from authors you trust. Adding one on the **Extensions** page only changes your preset; it runs only after you restart and accept it.

## Secrets

API keys and sign-ins live only in `secrets.json` in your home folder, readable only by you. They are never written to the database, the settings, the logs, or any answer to the browser, so the app can't show them back, and they are not sent to a model. See [Settings and secrets](settings-and-secrets.md).

## Logs

`logs/kvman.log` in your home folder records what happened: starts, stops, failures, and warnings. It never contains the content of requests, the values of your settings, or secrets. `--log-level` changes how much is recorded.

## The agent's reach

The agent works through connectors, and every call it makes is a card you can read in the chat. It runs shell lines inside the workspace you opened, asks before risky ones (see the `kvcoder.shell.approval` setting), and reads and edits files only inside that folder. It can change kvman's own model, settings, extensions, and preset through the `kvman` connector, but it can't read or change a secret.

## Next

- [settings-and-secrets.md](settings-and-secrets.md)
- [extensions.md](extensions.md)
- [troubleshooting.md](troubleshooting.md)
