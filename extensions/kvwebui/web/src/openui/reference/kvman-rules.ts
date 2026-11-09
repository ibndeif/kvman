// kvman's own words in the OpenUI reference (plan 06 §6.9, ADR 0124, 3, 7, 12, 13, 14): where the agent writes OpenUI, what
// a press does, what OpenUI can't do here, and an example for each place. The model reads them in English.

export type Place = 'reply' | 'artifact';

const presses = [
  '## What a press does',
  '',
  "- A Button sends its @ToAssistant text as the person's next message; a Button with no action sends its label; a FollowUpItem sends its text.",
  '- A Button inside a Form checks the form\'s rules, then sends its text, a blank line, and one `<label>: <value>` line per FormControl, in order. Nothing typed or chosen reads `(empty)`.',
  '- @OpenUrl opens an http or https address in a new tab; any other address does nothing.',
  '- @Set and @Reset change only what the page shows. Tabs, accordions, and sections open and close without sending anything.',
  '',
  '## What OpenUI cannot do here',
  '',
  '- There is no Query, Mutation, or @Run: no UI fetches or changes data. Write the data into the UI itself, as literals or $variables.',
  '- An image is only a path in the workspace or a `data:` address; a web address is not loaded.',
].join('\n');

const reply = [
  '# OpenUI in a reply',
  '',
  'Draw UI in a reply when the person has something to act on now: a choice, a short form, a summary of numbers, or follow-up suggestions. Write it as a fenced `openui` block inside your Markdown reply; the text around it stays Markdown. Each block stands alone: it starts with `root = Card(...)` and defines every name it uses. Keep prose in Markdown and a diagram in a Mermaid block. For a dashboard or a report the person keeps, write an artifact with `format: \'openui\'` instead.',
  '',
  "Only the newest reply's UI can be pressed; the UI of older replies is shown disabled.",
  '',
  presses,
].join('\n');

const artifact = [
  '# OpenUI in an artifact',
  '',
  "Write an artifact with `format: 'openui'` for a dashboard or a report the person keeps. Its content is OpenUI Lang only, with no fence around it, and starts with `root = Stack(...)`. Change part of it with `artifact edit`. For a small piece the person acts on now, use a fenced `openui` block in a reply instead; keep prose in Markdown.",
  '',
  'The UI of an openui artifact can always be pressed.',
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
  'Use them on arrays you write in the UI or keep in $variables, such as `items = [{name: "Build", status: "open"}]`. Builtins compose — output of one is input to the next:',
  '`@Count(@Filter(items, "status", "==", "open"))`, `@Round(@Avg(scores), 1)`, `@Each(items, "item", Tag(item.name))` for per-item rendering. Array pluck: `items.name` extracts a field from every item.',
  'IMPORTANT @Each rule: the loop variable (e.g. "item") is ONLY available inside the @Each template expression. Always inline the template — do NOT extract it to a separate statement.',
].join('\n');
