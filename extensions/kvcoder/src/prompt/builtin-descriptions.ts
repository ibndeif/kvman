import type { BuiltinConnector } from '../connector-call.ts';

// What the prompt's connector index and `help` say each built-in connector is for (plan 08 §8.2, ADR 0009, 164).

/** The built-in connectors' descriptions; `shell` names the shell this run uses. */
export function builtinDescriptions(shell: 'bash' | 'powershell'): Record<BuiltinConnector, string> {
  return {
    shell: `Run a line in the real shell (${shell === 'bash' ? 'bash' : 'PowerShell'}) in the workspace folder: build, test, install, or anything no other connector covers. Set background to true for a server or any command that keeps running.`,
    fs: 'Read, list, search, create, and change files in the workspace folder. Use it instead of cat, ls, grep, or shell redirection: read a file before you edit it, write for a new file or a full rewrite, one file per call, and edit for exact text replacements in an existing file.',
    artifact:
      'Show the person something to read or see: a plan, a report, a design, an HTML page, or the localhost address of an app you are running (format url). Use it for anything longer than a few lines instead of pasting it into a reply, and keep your plan in the artifact `plan`. The panel runs the page of an HTML artifact in a sandbox where localStorage, sessionStorage, cookies, and indexedDB throw, so a page you show that way must work without them, keeping its state in memory or wrapping each use in try/catch; a url artifact is a normal page on its own address and can use them.',
    background: 'Follow up on what you started with background set to true: a server or other long-running shell line, or a background subagent. Use it to see its status or output, or to stop it.',
    ask: 'Put a question to the person and wait for the answer. Use it when you need a decision, a missing detail, or a go-ahead before a risky step, instead of guessing.',
    subagent: 'Hand a self-contained task to a helper agent. Use it to research or build a separate part in parallel, or with background set to true while you go on.',
  };
}
