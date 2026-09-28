import { canonicalJson, type LlmRequest } from '@kvman/protocol';

// ADR 0154: ceil(characters / 4) over the system prompt, the text of every message, and the canonical JSON of the
// tools and tool calls; image parts count 0.
export function estimateTokens(request: LlmRequest): number {
  let characters = request.system?.length ?? 0;
  if (request.tools !== undefined) characters += canonicalJson(request.tools).length;
  for (const message of request.messages) {
    if (message.role === 'user') {
      if (typeof message.content === 'string') characters += message.content.length;
      else for (const part of message.content) if (part.type === 'text') characters += part.text.length;
    } else if (message.role === 'assistant') {
      characters += message.content.length;
      if (message.thinking !== undefined) characters += message.thinking.length;
      if (message.toolCalls !== undefined) characters += canonicalJson(message.toolCalls).length;
    } else {
      characters += message.content.length;
    }
  }
  return Math.ceil(characters / 4);
}
