// Installing kvman (plan 15 §15.3, ADR 0099, 19): npm's global install, as the user guide gives it, in a VS Code task.

export function installArguments(update: boolean): string[] {
  return ['i', '-g', update ? 'kvman@latest' : 'kvman', '--no-fund', '--loglevel=error'];
}
