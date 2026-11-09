// The OpenUI pages of the `demo` fixture (plan 06 §6.1, ADR 0124): `icons`, an `openui` view with an icon and an icon
// button, and `gallery`, the custom component `demo.openui`: every component of M5.18 in an `openui` view and in a
// fenced block of the chat library, both given `onMessage`, with the messages pressed shown in `[data-test="sent"]`.

export const iconsSource = ['root = Stack([rocket, launch])', 'rocket = Icon("rocket")', 'launch = IconButton("Launch", Icon("rocket"), Action([@ToAssistant("Launch")]))'].join('\n');

const fullSource = [
  'root = Stack([title, row, views, more, guide, rule, info, careful, totals, form, notify, label, tags, done, go, launch, code, notes, scores, prices, bars, pie, facts, picks, kpis, photo, slides, plans])',
  'title = CardHeader("Gallery", "Every component")',
  'row = Stack([one, two], "row", "m", null, null, true)',
  'one = Card([TextContent("One")])',
  'two = Card([TextContent("Two")], "sunk")',
  'views = Tabs([first, second])',
  'first = TabItem("first", "First", [TextContent("Panel one")])',
  'second = TabItem("second", "Second", [TextContent("Panel two")])',
  'more = Accordion([a])',
  'a = AccordionItem("a", "Section A", [TextContent("Inside A")])',
  'guide = Steps([install, start])',
  'install = StepsItem("Install", "Run it")',
  'start = StepsItem("Start", "Open it")',
  'rule = Separator()',
  'info = Callout("info", "Note", "Read **this**")',
  'careful = TextCallout("warning", "Careful", "Plain words")',
  'totals = InlineHeader("Totals", "This week")',
  'form = Form("booking", actions, [f1, f2, f3, f4, f5, f6, f7, f8])',
  'actions = Buttons([send])',
  'send = Button("Send", Action([@ToAssistant("Book it")]))',
  'f1 = FormControl("Name", Input("name"))',
  'f2 = FormControl("Notes", TextArea("notes"))',
  'f3 = FormControl("Room", Select("room", [SelectItem("a", "Garden"), SelectItem("b", "Sea")]))',
  'f4 = FormControl("Day", DatePicker("day"))',
  'f5 = FormControl("Guests", Slider("guests", "discrete", 1, 10, 1, [2]))',
  'f6 = FormControl("Extras", CheckBoxGroup("extras", [CheckBoxItem("Breakfast", "", "breakfast")]))',
  'f7 = FormControl("Size", RadioGroup("size", [RadioItem("Small", "", "small")]))',
  'f8 = FormControl("Colors", Chips("colors", "multiple", [ChipItem("red", "Red")]))',
  'notify = SwitchGroup("notify", [SwitchItem("Email me", "", "mail")])',
  'label = Label("A label")',
  'tags = TagBlock(["alpha", "beta"])',
  'done = Tag("Done", Icon("check"), "sm", "success")',
  'go = Buttons([Button("Go", Action([@ToAssistant("Go now")])), Button("Later", null, "secondary")])',
  'launch = IconButton("Launch", Icon("rocket"), Action([@ToAssistant("Launch")]))',
  'code = CodeBlock("ts", "const a = 1;")',
  'notes = MarkDownRenderer("See ![chart](https://example.com/chart.png) and [the docs](https://example.com/docs).", "card")',
  'scores = Table([Col("Team", ["Red", "Blue"]), Col("Points", [1200, 980], "number")])',
  'prices = EditableTable("prices", [{type: "text", key: "name", header: "Item"}, {type: "number", key: "price", header: "Price"}], [{id: "1", values: ["Tea", 3]}])',
  'bars = BarChart(["Mon", "Tue", "Wed"], [Series("Views", [30, 50, 20]), Series("Users", [10, 20, 15])])',
  'pie = PieChart(["A", "B", "C"], [1, 2, 3], "donut")',
  'facts = EntityList([{left: "Plan", right: "Pro"}, {left: "Seats", right: "12", rightVariant: "number"}])',
  'picks = ListBlock([ListItem("First", "One"), ListItem("Second", "Two")])',
  'kpis = OverviewCardBlock([OverviewCardItem("a", Text("text", "Revenue"), MetricIndicatorInline("$12k", null, {direction: "up", value: 8})), OverviewCardItem("b", Text("text", "Churn"), MetricIndicatorInline("2%"))])',
  'photo = Image("A web photo", "https://example.com/photo.png")',
  'slides = Carousel([[TextContent("One")], [TextContent("Two")], [TextContent("Three")], [TextContent("Four")]])',
  'plans = OptionCards("plan", "single", [OptionCard("basic", "Basic", "For one", Icon("user")), OptionCard("team", "Team")])',
].join('\n');

/** A reply's fenced block of the chat library: a card with a source, sections, and a follow-up. A catalog text is
 * compiled by vue-i18n, so the reply goes in as the `text` param of `demo.chat`, as kvcoder passes a reply. */
const chatBlock = [
  'Here it is:',
  '',
  '```openui',
  'root = Card([intro, parts, next], [{title: "Spec", sourceName: "Docs", url: "https://example.com/spec"}])',
  'intro = TextContent("Pick one [1]")',
  'parts = SectionBlock([p1, p2])',
  'p1 = SectionItem("p1", "Part one", [TextContent("First part")])',
  'p2 = SectionItem("p2", "Part two", [TextContent("Second part")])',
  'next = FollowUpBlock([FollowUpItem("Tell me more")])',
  '```',
].join('\n');

export const openuiComponent = `import { defineComponent, h, inject, ref } from 'vue';

export default defineComponent({
  setup() {
    const kvman = inject('kvman');
    const sent = ref([]);
    const onMessage = (text) => { sent.value = [...sent.value, text]; };
    return () => h('section', { 'data-test': 'demo-openui' }, [
      h(kvman.View, { view: { type: 'openui', source: ${JSON.stringify(fullSource)} }, onMessage }),
      h(kvman.View, { view: { type: 'markdown', text: 'demo.chat', params: { text: ${JSON.stringify(chatBlock)} } }, onMessage }),
      h('output', { 'data-test': 'sent' }, sent.value.join('|')),
    ]);
  },
});
`;
