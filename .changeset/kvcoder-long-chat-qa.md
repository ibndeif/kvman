---
'@kvman/kvcoder': minor
---

A new chat has the header of a chat, with the model and thinking pickers at the top, and says when the model's provider needs an API key (with a link to add one) instead of failing the first message. A call's card always says what the call is: its title, or the start of its description when the model left the title out, with the command on one line and the whole command and the output, on dark blocks in both themes, when opened. A long chat scrolls inside its own column, follows the newest message unless the person scrolled up, and offers "Jump to latest". New workspaces no longer get a welcome chat (`kvcoder.welcome` defaults to `null`), and the prompt tells the model not to make a call that does nothing.
