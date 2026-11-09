// kvman's own words in the OpenUI reference (plan 06 §6.9, ADR 0124, 3, 7, 12, 13, 14): where the agent writes OpenUI, what
// a press does, what OpenUI can't do here, and an example for each place. The model reads them in English.

export type Place = 'reply' | 'artifact';

const presses = [
  '## What a press does',
  '',
  "- A Button sends its @ToAssistant text as the person's next message (its label when it has no action); a FollowUpItem sends its text.",
  "- A Button in a Form checks the form's rules, then sends its text, a blank line, and a `<label>: <value>` line per FormControl; nothing chosen reads `(empty)`.",
  '- @OpenUrl opens only an http or https address. @Set, @Reset, tabs, accordions, and sections change only the page.',
  '',
  '## What OpenUI cannot do here',
  '',
  '- There is no Query, Mutation, or @Run: write the data into the UI, as literals or $variables.',
  '- An image is only a path in the workspace or a `data:` address; a web address is not loaded.',
].join('\n');

const reply = [
  '# OpenUI in a reply',
  '',
  "Draw UI in a reply when the person has something to act on now: a choice, a short form, numbers, or follow-ups. Write it as a fenced `openui` block in your Markdown reply; each block stands alone, starting with `root = Card(...)` and defining every name it uses. Keep prose in Markdown and diagrams in Mermaid; a dashboard or report the person keeps is an artifact with `format: 'openui'`. Only the newest reply's UI can be pressed.",
  '',
  presses,
].join('\n');

const artifact = [
  '# OpenUI in an artifact',
  '',
  "Write an artifact with `format: 'openui'` for a dashboard or report the person keeps: OpenUI Lang only, with no fence, starting with `root = Stack(...)`; change part of it with `artifact edit`. Its UI can always be pressed. For something to act on now, use a fenced `openui` block in a reply; keep prose in Markdown.",
  '',
  presses,
].join('\n');

/** The opening of the index for `place`: its title and kvman's rules. */
export function placeRules(place: Place): string {
  return place === 'reply' ? reply : artifact;
}

const replyExample = [
  'Two ways forward:',
  '',
  '```openui',
  'root = Card([header, choices, next])',
  'header = CardHeader("Pick a plan", "Both keep your data")',
  'choices = Buttons([quick, full])',
  'quick = Button("Quick fix", Action([@ToAssistant("Do the quick fix")]))',
  'full = Button("Full rewrite", Action([@ToAssistant("Do the full rewrite")]), "secondary")',
  'next = FollowUpBlock([why])',
  'why = FollowUpItem("Why not both?")',
  '```',
].join('\n');

const artifactExample = [
  'root = Stack([header, numbers, next])',
  'header = CardHeader("Release 1.4", "Status on Monday")',
  'numbers = Stack([open, closed], "row", "m", null, null, true)',
  'open = Card([TextContent("Open issues", "small"), TextContent("12", "large-heavy")])',
  'closed = Card([TextContent("Closed this week", "small"), TextContent("31", "large-heavy")])',
  'next = Callout("info", "Next", "Code freeze on **Friday**.")',
].join('\n');

/** An example for `place`, as the agent writes it. */
export function placeExample(place: Place): string {
  return place === 'reply' ? `A reply:\n\n\`\`\`\`markdown\n${replyExample}\n\`\`\`\`` : `An artifact's content:\n\n\`\`\`openui\n${artifactExample}\n\`\`\``;
}

/** How a block streams, in place of lang-core's section, whose order has `Query` statements. */
export function streamingRules(root: string): string {
  return [
    '## Hoisting & Streaming (CRITICAL)',
    '',
    `A reference can be used before it is defined. While it streams, the UI is parsed again on every chunk and appears top down, so write \`root = ${root}(...)\` first, then the $variable declarations, then the components, then leaf data. A reference that hasn't arrived yet draws nothing until it does.`,
  ].join('\n');
}

/** The composition and data lines that replace the generated ones, which speak of `Query` results and tables. */
export const builtinUse = [
  'Use them on arrays the UI holds, such as `items = [{name: "Build", status: "open"}]`; they compose: `@Count(@Filter(items, "status", "==", "open"))`, `@Each(items, "item", Tag(item.name))`. `items.name` plucks a field from every item.',
  "@Each's loop variable exists only inside its template: write the template inline, never as a statement of its own.",
].join('\n');
