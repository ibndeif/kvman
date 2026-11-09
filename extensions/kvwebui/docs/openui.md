# OpenUI in an artifact

Write an artifact with `format: 'openui'` for a dashboard or a report the person keeps. Its content is OpenUI Lang only, with no fence around it, and starts with `root = Stack(...)`. Change part of it with `artifact edit`. For a small piece the person acts on now, use a fenced `openui` block in a reply instead; keep prose in Markdown.

The UI of an openui artifact can always be pressed.

## What a press does

- A Button sends its @ToAssistant text as the person's next message; a Button with no action sends its label; a FollowUpItem sends its text.
- A Button inside a Form checks the form's rules, then sends its text, a blank line, and one `<label>: <value>` line per FormControl, in order. Nothing typed or chosen reads `(empty)`.
- @OpenUrl opens an http or https address in a new tab; any other address does nothing.
- @Set and @Reset change only what the page shows. Tabs, accordions, and sections open and close without sending anything.

## What OpenUI cannot do here

- There is no Query, Mutation, or @Run: no UI fetches or changes data. Write the data into the UI itself, as literals or $variables.
- An image is only a path in the workspace or a `data:` address; a web address is not loaded.

## Syntax Rules

1. Each statement is on its own line: `identifier = Expression`
2. `root` is the entry point — every program must define `root = Stack(...)`
3. Expressions are: strings ("..."), numbers, booleans (true/false), null, arrays ([...]), objects ({...}), or component calls TypeName(arg1, arg2, ...)
4. Use references for readability: define `name = ...` on one line, then use `name` later
5. EVERY variable (except root) MUST be referenced by at least one other variable. Unreferenced variables are silently dropped and will NOT render. Always include defined variables in their parent's children/items array.
6. Arguments are POSITIONAL (order matters, not names). Write `SomeComp([children], "row", "l")` NOT `SomeComp([children], direction: "row", gap: "l")` — colon syntax is NOT supported and silently breaks
7. Optional arguments can be omitted from the end
8. Declare mutable state with `$varName = defaultValue`. Components marked with `$binding` can read/write these. Undeclared $variables are auto-created with null default.
9. String concatenation: `"text" + $var + "more"`
10. Dot member access: `query.field` reads a field; on arrays it extracts that field from every element
11. Index access: `arr[0]`, `data[index]`
12. Arithmetic operators: +, -, *, /, % (work on numbers; + is string concat when either side is a string)
13. Comparison: ==, !=, >, <, >=, <=
14. Logical: &&, ||, ! (prefix)
15. Ternary: `condition ? valueIfTrue : valueIfFalse`
16. Parentheses for grouping: `(a + b) * c`
- Strings use double quotes with backslash escaping

## Built-in Functions

Data functions prefixed with `@` to distinguish from components. These are the ONLY functions available — do NOT invent new ones.

@Count(array) → number — Returns array length
@First(array) → element — Returns first element of array
@Last(array) → element — Returns last element of array
@Sum(numbers[]) → number — Sum of numeric array
@Avg(numbers[]) → number — Average of numeric array
@Min(numbers[]) → number — Minimum value in array
@Max(numbers[]) → number — Maximum value in array
@Sort(array, field, direction?) → sorted array — Sort array by field. Direction: "asc" (default) or "desc"
@Filter(array, field, operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains", value) → filtered array — Filter array by field value
@Round(number, decimals?) → number — Round to N decimal places (default 0)
@Abs(number) → number — Absolute value
@Floor(number) → number — Round down to nearest integer
@Ceil(number) → number — Round up to nearest integer
@Each(array, varName, template) — Evaluate template for each element. varName is the loop variable — use it ONLY inside the template expression (inline). Do NOT create a separate statement for the template.

Use them on arrays you write in the UI or keep in $variables, such as `items = [{name: "Build", status: "open"}]`. Builtins compose — output of one is input to the next:
`@Count(@Filter(items, "status", "==", "open"))`, `@Round(@Avg(scores), 1)`, `@Each(items, "item", Tag(item.name))` for per-item rendering. Array pluck: `items.name` extracts a field from every item.
IMPORTANT @Each rule: the loop variable (e.g. "item") is ONLY available inside the @Each template expression. Always inline the template — do NOT extract it to a separate statement.

## Action — Button Behavior

Action([@steps...]) wires button clicks to operations. Steps are @-prefixed built-in actions. Steps execute in order.
Buttons without an explicit Action prop automatically send their label to the assistant (equivalent to Action([@ToAssistant(label)])).

Available steps:
- @ToAssistant("message") — Send a message to the assistant (for conversational buttons like "Tell me more", "Explain this")
- @OpenUrl("https://...") — Navigate to a URL
- @Set($variable, value) — Set a $variable to a specific value
- @Reset($var1, $var2, ...) — Reset $variables to their declared defaults (e.g. @Reset($title, $priority) restores $title="" and $priority="medium")

Example — simple nav:
```
viewBtn = Button("View", Action([@OpenUrl("https://example.com")]))
```

- Action can be assigned to a variable or inlined: Button("Go", onSubmit) and Button("Go", Action([...])) both work

## Hoisting & Streaming (CRITICAL)

A reference can be used before it is defined. While it streams, the UI is parsed again on every chunk and appears top down, so write `root = Stack(...)` first, then the $variable declarations, then the components, then leaf data. A reference that hasn't arrived yet draws nothing until it does.

## Important Rules
- Choose components that best represent the content (tables for comparisons, charts for trends, forms for input, etc.)

## Final Verification
Before finishing, walk your output and verify:
1. root = Stack(...) is the FIRST line (for optimal streaming).
2. Every referenced name is defined. Every defined name (other than root) is reachable from root.
3. Every $binding appears in at least one component or expression.

## Components

Arguments marked with ? are optional. Sub-components can be inline or referenced; prefer references for better streaming.
Props typed `ActionExpression` accept an Action([@steps...]) expression. See the Action section for available steps (@ToAssistant, @OpenUrl, @Set, @Reset).
Props marked `$binding<type>` accept a `$variable` reference for two-way binding.

Read a group's signatures and notes with `openui guide { place: 'artifact', groups: ['<group>', …] }`. The groups:

- Layout: Stack, Tabs, TabItem, Accordion, AccordionItem, Steps, StepsItem, Separator
- Content: Card, CardHeader, TextContent, MarkDownRenderer, Callout, TextCallout, CodeBlock, InlineHeader
- Forms: Form, FormControl, Label, Input, TextArea, Select, SelectItem, DatePicker, Slider, CheckBoxGroup, CheckBoxItem, RadioGroup, RadioItem, SwitchGroup, SwitchItem, Chips, ChipItem
- Buttons: Button, Buttons, IconButton
- Data Display: TagBlock, Tag, Icon

## Example

An artifact's content:

```openui
root = Stack([header, numbers, next])
header = CardHeader("Release 1.4", "Status on Monday")
numbers = Stack([open, closed], "row", "m", null, null, true)
open = Card([TextContent("Open issues", "small"), TextContent("12", "large-heavy")])
closed = Card([TextContent("Closed this week", "small"), TextContent("31", "large-heavy")])
next = Callout("info", "Next", "Code freeze on **Friday**.")
```
