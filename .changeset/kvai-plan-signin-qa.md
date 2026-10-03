---
'@kvman/kvai': minor
---

A provider can be disconnected (`kvai.provider.disconnect`), and a built-in provider that has an OAuth flow in pi-ai (ChatGPT Plus/Pro, Claude Pro/Max, GitHub Copilot, and others) can be signed in to with the person's plan (`kvai.provider.signin.start`, `signin.answer`, `signin.cancel`). Provider rows gain `connection`, `signIn`, and `apiKey`, a sign-in is kept as the secret `<provider>.oauth` and refreshed by calls one worker at a time, and the Provider page's connection card is the new `kvai.connection` component.
