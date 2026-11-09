// OpenUI's notes for its component groups (plan 06 §6.1, ADR 0124, 12), from `@openuidev/react-ui` 0.18.5, as the
// reference pages give them. A note is left out when it uses `Query`, `Mutation`, `@Run`, or a query's result (there is
// no tool provider, ADR 0124, 3) or tells the model to load images from the web (ADR 0124, 7). A step is always inside `Action([…])`, as OpenUI Lang 0.5 reads it, and a
// query's rows (`data.rows`) read `items`, an array the UI holds, since there are no queries here.

const editableTableNotes = [
  '- EditableTable lets the user edit cells inline. Give it a unique name, columns of { type, key, header } with type one of text | number | date-single | select | url (select also needs options: [{ value, label }]).',
  '- data is an array of { id, values } rows where values are ordered positionally to match columns. Edited data is submitted when the user clicks Save Changes.',
];

const entityListNote = "- EntityList is a compact two-column list of { left, right } rows (e.g. name / value). size='default' also supports a header and footer row; size='small' does not.";

const cardNotes = [
  '- Card blocks lay out 2+ items in a responsive grid (or carousel where supported). Every item in a block must have the same structure.',
  '- SnippetCardItem: small card with lhs (IconText | ImageText) and optional rhs (Text | BoldText) — good for key/value facts.',
  '- OverviewCardItem: small card with top (IconText | ImageText | Text) and optional bottom MetricIndicatorInline — good for KPIs.',
  '- ContextCardItem: medium card with a title (string or Tag), body text and optional background image — good for summaries.',
  '- CompositeCardItem: rich card with header, body array (Text, BoldText, MetricIndicatorInline, IconText, Image, charts, ListBlock, TagBlock, EntityList) and footer (price + Button) — good for products/offers.',
  '- VisualCardItem: image-first card with a BoldText body and optional Tag.',
  '- Text / BoldText / IconText / ImageText / ImageTextLarge / MetricIndicator* are the inline building blocks used INSIDE card items; do not place them directly in the root Card.',
];

const iconNote = '- Icon renders a lucide icon by kebab-case name; it is also used as the icon of IconButton, IconText and OptionCard.';
const optionCardsNote = '- OptionCards: larger selectable cards with title, subtitle and an optional Icon or Image on top. Use OptionCard references for each option.';

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
    '- Modal: Modal("Title", $showModal, [content]) — $showModal is boolean, X/Escape auto-closes. Put Form with its own buttons inside children.',
    '- Use Tabs for alternative views (chart types, data sections) — no $variable needed',
  ],
  Content: [
    '- InlineHeader is a compact heading + description pair for labelling a block (lighter than CardHeader).',
    '- Use Cards to group related KPIs or sections. Stack with direction "row" for side-by-side layouts.',
    '- KPI card: Card([TextContent("Label", "small"), TextContent("" + @Count(@Filter(items, "field", "==", "value")), "large-heavy")])',
  ],
  Tables: [
    ...editableTableNotes,
    '- Table is COLUMN-oriented: Table([Col("Label", dataArray), Col("Count", countArray, "number")]). Use array pluck for data: items.fieldName',
    '- Col data can be component arrays for styled cells: Col("Status", @Each(items, "item", Tag(item.status, null, "sm", item.status == "open" ? "success" : "danger")))',
    '- Row actions: Col("Actions", @Each(items, "t", Button("Edit", Action([@Set($showEdit, true), @Set($editId, t.id)]))))',
    '- Sortable: sorted = @Sort(items, $sortField, "desc"). Bind $sortField to Select. Use sorted.fieldName for Col data',
    '- Searchable: filtered = @Filter(items, "title", "contains", $search). Bind $search to Input',
    '- Chain sort + filter: filtered = @Filter(...) then sorted = @Sort(filtered, ...) — use sorted for both Table and Charts',
    '- Empty state: @Count(items) > 0 ? Table([...]) : TextContent("No data yet")',
  ],
  'Charts (2D)': [
    '- Charts accept column arrays: LineChart(labels, [Series("Name", values)]). Use array pluck: LineChart(items.day, [Series("Views", items.views)])',
    '- Use Cards to wrap charts with CardHeader for titled sections',
    '- Chart + Table from same source: use @Sort or @Filter result for both LineChart and Table Col data',
    '- Multiple chart views: use Tabs — Tabs([TabItem("line", "Line", [LineChart(...)]), TabItem("bar", "Bar", [BarChart(...)])])',
  ],
  'Charts (1D)': [
    '- PieChart and BarChart need NUMBERS, not objects. For list data, use @Count(@Filter(...)) to aggregate:',
    '- PieChart from list: `PieChart(["Low", "Med", "High"], [@Count(@Filter(items, "priority", "==", "low")), @Count(@Filter(items, "priority", "==", "medium")), @Count(@Filter(items, "priority", "==", "high"))], "donut")`',
    '- KPI from count: `TextContent("" + @Count(@Filter(items, "status", "==", "open")), "large-heavy")`',
  ],
  Forms: [
    '- Chips: compact single/multiple selection pills. Use ChipItem references for each option.',
    optionCardsNote,
    '- For Form fields, define EACH FormControl as its own reference — do NOT inline all controls in one array. This allows progressive field-by-field streaming.',
    '- NEVER nest Form inside Form — each Form should be a standalone container.',
    '- Form requires explicit buttons. Always pass a Buttons(...) reference as the second Form argument: Form(name, buttons, fields).',
    ...formRules,
    '- Conditional fields: $country == "US" ? stateField : $country == "UK" ? postcodeField : addressField',
    '- Edit form in Modal: Modal("Edit", $showEdit, [Form("edit", Buttons([saveBtn, cancelBtn]), [fields...])]). Save button should include @Set($showEdit, false) to close modal.',
  ],
  Buttons: [iconNote, '- Toggle in @Each: @Each(rows, "t", Button(t.status == "open" ? "Close" : "Reopen", Action([...])))'],
  'Data Display': ['- Color-mapped Tag: Tag(value, null, "sm", value == "high" ? "danger" : value == "medium" ? "warning" : "neutral")', entityListNote, '- ListBlock is a numbered or image list of ListItem references. An action on ListItem is optional.'],
  Cards: cardNotes,
};

export const chatNotes: Readonly<Record<string, readonly string[]>> = {
  Tables: editableTableNotes,
  Content: [
    '- InlineHeader is a compact heading + description pair for labelling a block inside the response (lighter than CardHeader).',
    '- Pass sources on Card ([{ title, sourceName, url }]) when the answer relies on references, and cite them inline in TextContent as [1], [2] (1-based index into sources). A Sources strip renders at the bottom of the card.',
  ],
  Forms: [
    '- Chips: compact single/multiple selection pills. Use ChipItem references for each option.',
    optionCardsNote,
    '- Define EACH FormControl as its own reference — do NOT inline all controls in one array.',
    '- NEVER nest Form inside Form.',
    '- Form requires explicit buttons. Always pass a Buttons(...) reference as the second Form argument: Form(name, buttons, fields).',
    '- rules is an optional object: { required: true, email: true, min: 8, maxLength: 100 }',
    '- The renderer shows error messages automatically — do NOT generate error text in the UI',
  ],
  'Lists & Follow-ups': [
    '- Use ListBlock with ListItem references for numbered lists.',
    '- Use FollowUpBlock with FollowUpItem references at the end of a response to suggest next actions.',
    '- A ListItem is clickable ONLY when given an action (5th argument); without one it is plain text.',
    '- Clicking a FollowUpItem, or a ListItem with a @ToAssistant action, sends text to the LLM as a user message.',
    '- Example: list = ListBlock([item1, item2])  item1 = ListItem("Option A", "Details about A", null, null, Action([@ToAssistant("Option A")]))',
  ],
  Sections: [
    '- SectionBlock renders collapsible accordion sections that auto-open as they stream.',
    '- Each section needs a unique `value` id, a `trigger` label, and a `content` array.',
    '- Example: sections = SectionBlock([s1, s2])  s1 = SectionItem("intro", "Introduction", [content1])',
    '- Set isFoldable=false to render sections as flat headers instead of accordion.',
  ],
  Buttons: [iconNote],
  Layout: [
    '- Use Tabs to present alternative views — each TabItem has a value id, trigger label, and content array.',
    '- Carousel takes an array of slides, where each slide is an array of content: carousel = Carousel([[t1, img1], [t2, img2]])',
    '- IMPORTANT: Every slide in a Carousel must have the same structure — same component types in the same order.',
    '- For image carousels use: [[title, image, description, tags], ...] — every slide must follow this exact pattern.',
  ],
  'Data Display': [entityListNote],
  Cards: cardNotes,
};
