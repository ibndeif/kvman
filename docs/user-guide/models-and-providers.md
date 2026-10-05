# Models and providers

This page is for connecting AI services to kvman and choosing the default model. When you finish, your agent can actually answer, and you know how to switch models or point kvman at your own server.

A **provider** is a service or server that runs models (Anthropic, ChatGPT, Google, …). A **model** is one of those services' models, named `<provider>/<model>`.

## The Models page

Open **Models** in the sidebar. It shows:

- **Default model** — the model kvman uses when a call doesn't name one, with a **Change model** button.
- **Connected** — the providers you connected, each with **Manage**.
- **Connect a provider** — tiles: Claude, ChatGPT, and GitHub Copilot to sign in with a plan; Anthropic, Google, xAI, and **Your own server** for a key or a local server.
- **All providers** — the rest, A–Z, with search and **Show 25 more**.

## Connecting with an API key

1. Open **Models** and find your provider (or click it under **All providers**, or use **Add a provider** for a server kvman doesn't list).
2. On the provider's page, choose **An API key** and paste your key.
3. Click **Save key**. The key is stored in `secrets.json` on this computer and never shown again.

## Signing in with a plan

Claude (Pro or Max), ChatGPT (Plus or Pro), and GitHub Copilot can be connected with the account you already pay for:

1. Open **Models** and click the provider's tile.
2. Choose **Your plan**. kvman shows a link and often a device code.
3. Finish signing in in the browser tab that opens. This page updates by itself.
4. If the sign-in page can't reach this computer, paste the address it ends on back into kvman.

A provider is connected by an API key **or** a sign-in, never both: saving a key replaces the sign-in, and signing in replaces the key. kvman refreshes a plan sign-in by itself; if the provider ever rejects it, you'll see `kvai/SIGNIN_EXPIRED` and you sign in again.

Using a plan through another app may go against the provider's terms of use — kvman tells you this at sign-in.

## Disconnecting

On the provider's page, click **Disconnect**. kvman deletes the key and the sign-in; calls to its models stop working until you connect it again. **Remove provider** deletes a custom provider and its models. A secret can also be deleted from the **Secrets** section of the Settings page.

## Choosing the default model

- On **Models**, click **Change model** and pick any model of a connected provider. The list is searchable: type any words of a model's name.
- Or open **Extensions**, then **Models**, and pick it from the same list. There the switch at the top of the page says whether you set it for all workspaces or only for this one.
- Or, on a provider's page, click **Make default** next to a model.
- In a chat, picking a model in the send box sets it as the default for new chats too.

The default model is the `kvai.defaultModel` setting; it applies per workspace, falling back to the global value, then the preset, then nothing (unset means no default). The bundled `coder` preset sets it to `anthropic/claude-sonnet-5-5`.

## Your own server (Ollama, LM Studio, …)

A local server that speaks one of the wire APIs kvman knows can be added as a custom provider:

1. Open **Models**, click **Add a provider**, and fill in a name, the wire API (`openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, or `mistral-conversations`), and the base URL (for example `http://127.0.0.1:11434/v1` for Ollama).
2. Add its models with **Add a model** (its id, name, context window, …), if they aren't listed automatically.
3. A local server usually needs no key; kvman then sends the placeholder `none`, which local servers ignore.

Custom providers appear with **Manage** under **Connected**, and their models can be made the default like any other.

## Usage

The status bar shows the current workspace's tokens and cost (`Workspace total, with cached: … tokens · $…`), from kvai's usage totals. Usage is per workspace and per model. This number is larger than the tokens a chat shows in its header: a chat counts what went in and what came out, while the workspace total also counts the cached tokens, the part of the conversation the model reads again at every step. The cost is the real cost in both places.

## Next

- [coding-app.md](coding-app.md)
- [settings-and-secrets.md](settings-and-secrets.md)
