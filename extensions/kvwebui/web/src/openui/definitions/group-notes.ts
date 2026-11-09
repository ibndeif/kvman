// OpenUI's notes for its component groups (plan 06 §6.1, ADR 0124, 12), from `@openuidev/react-ui` 0.18.5, as the
// reference pages give them. A note is left out while it names a component kvman hasn't built, and for good when it
// uses `Query`, `Mutation`, `@Run`, or a query's result (there is no tool provider, ADR 0124, 3) or tells the model to
// load images from the web (ADR 0124, 7). A step is always inside `Action([…])`, as OpenUI Lang 0.5 reads it.

const formRules = [
  '- rules is an optional object: {required: true, email: true, minLength: 8, maxLength: 100}',
  '- Available rules: required, email, min, max, minLength, maxLength, pattern, url, numeric',
  '- The renderer shows error messages automatically — do NOT generate error text in the UI',
];

export const fullNotes: Readonly<Record<string, readonly string[]>> = {
  Layout: [
    '- For grid-like layouts, use Stack with direction "row" and wrap set to true.',
    '- Prefer justify "start" (or omit justify) with wrap=true for stable columns instead of uneven gutters.',
    '- Use nested Stacks when you need explicit rows/sections.',
    '- Show/hide sections: $editId != "" ? Card([editForm]) : null',
    '- Use Tabs for alternative views (chart types, data sections) — no $variable needed',
  ],
  Content: [
    '- InlineHeader is a compact heading + description pair for labelling a block (lighter than CardHeader).',
    '- Use Cards to group related KPIs or sections. Stack with direction "row" for side-by-side layouts.',
  ],
  Forms: [
    '- Chips: compact single/multiple selection pills. Use ChipItem references for each option.',
    '- For Form fields, define EACH FormControl as its own reference — do NOT inline all controls in one array. This allows progressive field-by-field streaming.',
    '- NEVER nest Form inside Form — each Form should be a standalone container.',
    '- Form requires explicit buttons. Always pass a Buttons(...) reference as the second Form argument: Form(name, buttons, fields).',
    ...formRules,
    '- Conditional fields: $country == "US" ? stateField : $country == "UK" ? postcodeField : addressField',
  ],
  Buttons: ['- Toggle in @Each: @Each(rows, "t", Button(t.status == "open" ? "Close" : "Reopen", Action([...])))'],
  'Data Display': ['- Color-mapped Tag: Tag(value, null, "sm", value == "high" ? "danger" : value == "medium" ? "warning" : "neutral")'],
};

export const chatNotes: Readonly<Record<string, readonly string[]>> = {
  Content: [
    '- InlineHeader is a compact heading + description pair for labelling a block inside the response (lighter than CardHeader).',
    '- Pass sources on Card ([{ title, sourceName, url }]) when the answer relies on references, and cite them inline in TextContent as [1], [2] (1-based index into sources). A Sources strip renders at the bottom of the card.',
  ],
  Forms: [
    '- Chips: compact single/multiple selection pills. Use ChipItem references for each option.',
    '- Define EACH FormControl as its own reference — do NOT inline all controls in one array.',
    '- NEVER nest Form inside Form.',
    '- Form requires explicit buttons. Always pass a Buttons(...) reference as the second Form argument: Form(name, buttons, fields).',
    '- rules is an optional object: { required: true, email: true, min: 8, maxLength: 100 }',
    '- The renderer shows error messages automatically — do NOT generate error text in the UI',
  ],
  'Lists & Follow-ups': ['- Use FollowUpBlock with FollowUpItem references at the end of a response to suggest next actions.'],
  Sections: [
    '- SectionBlock renders collapsible accordion sections that auto-open as they stream.',
    '- Each section needs a unique `value` id, a `trigger` label, and a `content` array.',
    '- Example: sections = SectionBlock([s1, s2])  s1 = SectionItem("intro", "Introduction", [content1])',
    '- Set isFoldable=false to render sections as flat headers instead of accordion.',
  ],
  Layout: ['- Use Tabs to present alternative views — each TabItem has a value id, trigger label, and content array.'],
};
