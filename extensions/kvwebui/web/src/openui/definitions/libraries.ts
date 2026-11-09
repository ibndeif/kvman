import type { ComponentGroup } from '@openuidev/lang-core';
import { button, buttons, iconButton } from './buttons.ts';
import { card, chatCard } from './card.ts';
import { boldText, iconText, imageText, imageTextLarge, metricIndicatorInline, metricIndicatorWithStrikethrough, text } from './card-parts.ts';
import { compositeCardBlock, compositeCardItem, contextCardBlock, contextCardItem, overviewCardBlock, overviewCardItem, snippetCardBlock, snippetCardItem, visualCardBlock, visualCardItem } from './cards.ts';
import { chatAccordion, chatAccordionItem, chatCarousel, chatSectionBlock, chatSectionItem, chatTabItem, chatTabs } from './chat-containers.ts';
import { callout, cardHeader, codeBlock, inlineHeader, markDownRenderer, textCallout, textContent } from './content.ts';
import { icon, tag, tagBlock } from './data-display.ts';
import { areaChart, barChart, horizontalBarChart, lineChart, pieChart, point, radarChart, radialChart, scatterChart, scatterSeries, series, singleStackedBarChart, slice } from './charts.ts';
import { followUpBlock, followUpItem } from './follow-ups.ts';
import { entityList, listBlock, listItem } from './lists.ts';
import { col, editableTable, table } from './tables.ts';
import { chatNotes, fullNotes } from './group-notes.ts';
import { checkBoxGroup, checkBoxItem, chipItem, chips, datePicker, form, formControl, input, label, optionCard, optionCards, radioGroup, radioItem, select, selectItem, slider, switchGroup, switchItem, textArea } from './forms.ts';
import { image, imageBlock, imageGallery } from './media.ts';
import { carousel, modal } from './overlays.ts';
import { accordion, accordionItem, stack, tabItem, tabs } from './layout.ts';
import { separator, steps, stepsItem } from './layout-items.ts';

// The two libraries of OpenUI (plan 06 §6.1, ADR 0124, 4, 13): a reply is read with the chat library, root `Card`, and
// an artifact with `openuiLibrary`, root `Stack`. A group holds only the components this milestone builds.

// A group with OpenUI's notes for it, from `group-notes.ts`.
const grouped =
  (notes: Readonly<Record<string, readonly string[]>>) =>
  (name: string, components: string[]): ComponentGroup => ({ name, components, notes: [...(notes[name] ?? [])] });
const chat = grouped(chatNotes);
const full = grouped(fullNotes);
const forms = ['Form', 'FormControl', 'Label', 'Input', 'TextArea', 'Select', 'SelectItem', 'DatePicker', 'Slider', 'CheckBoxGroup', 'CheckBoxItem', 'RadioGroup', 'RadioItem', 'SwitchGroup', 'SwitchItem', 'Chips', 'ChipItem', 'OptionCards', 'OptionCard'];
const cards = ['SnippetCardBlock', 'SnippetCardItem', 'OverviewCardBlock', 'OverviewCardItem', 'ContextCardBlock', 'ContextCardItem', 'CompositeCardBlock', 'CompositeCardItem', 'VisualCardBlock', 'VisualCardItem', 'Text', 'BoldText', 'IconText', 'ImageText', 'ImageTextLarge', 'MetricIndicatorInline', 'MetricIndicatorWithStrikethrough'];
const tables = ['Table', 'Col', 'EditableTable'];
const charts2d = ['BarChart', 'LineChart', 'AreaChart', 'RadarChart', 'HorizontalBarChart', 'Series'];
const charts1d = ['PieChart', 'RadialChart', 'SingleStackedBarChart', 'Slice'];
const scatter = ['ScatterChart', 'ScatterSeries', 'Point'];

const chatGroups: ComponentGroup[] = [
  chat('Content', ['CardHeader', 'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'Image', 'ImageBlock', 'ImageGallery', 'CodeBlock', 'Separator', 'InlineHeader']),
  chat('Tables', tables),
  chat('Charts (2D)', charts2d),
  chat('Charts (1D)', charts1d),
  chat('Charts (Scatter)', scatter),
  chat('Forms', forms),
  chat('Buttons', ['Button', 'Buttons', 'Icon', 'IconButton']),
  chat('Lists & Follow-ups', ['ListBlock', 'ListItem', 'FollowUpBlock', 'FollowUpItem']),
  chat('Sections', ['SectionBlock', 'SectionItem']),
  chat('Layout', ['Tabs', 'TabItem', 'Accordion', 'AccordionItem', 'Steps', 'StepsItem', 'Carousel']),
  chat('Data Display', ['TagBlock', 'Tag', 'EntityList']),
  chat('Cards', cards),
];

const fullGroups: ComponentGroup[] = [
  full('Layout', ['Stack', 'Tabs', 'TabItem', 'Accordion', 'AccordionItem', 'Steps', 'StepsItem', 'Carousel', 'Separator', 'Modal']),
  full('Content', ['Card', 'CardHeader', 'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'Image', 'ImageBlock', 'ImageGallery', 'CodeBlock', 'InlineHeader']),
  full('Tables', tables),
  full('Charts (2D)', charts2d),
  full('Charts (1D)', charts1d),
  full('Charts (Scatter)', scatter),
  full('Forms', forms),
  full('Buttons', ['Button', 'Buttons', 'IconButton']),
  full('Data Display', ['TagBlock', 'Tag', 'Icon', 'EntityList', 'ListBlock', 'ListItem']),
  full('Cards', cards),
];

export const chatLibraryDefinition = {
  root: 'Card',
  components: [
    cardHeader,
    textContent,
    markDownRenderer,
    callout,
    textCallout,
    codeBlock,
    separator,
    inlineHeader,
    table,
    col,
    editableTable,
    barChart,
    lineChart,
    areaChart,
    radarChart,
    horizontalBarChart,
    series,
    pieChart,
    radialChart,
    singleStackedBarChart,
    slice,
    scatterChart,
    scatterSeries,
    point,
    entityList,
    listBlock,
    listItem,
    snippetCardBlock,
    snippetCardItem,
    overviewCardBlock,
    overviewCardItem,
    contextCardBlock,
    contextCardItem,
    compositeCardBlock,
    compositeCardItem,
    visualCardBlock,
    visualCardItem,
    text,
    boldText,
    iconText,
    imageText,
    imageTextLarge,
    metricIndicatorInline,
    metricIndicatorWithStrikethrough,
    image,
    imageBlock,
    imageGallery,
    optionCards,
    optionCard,
    form,
    formControl,
    label,
    input,
    textArea,
    select,
    selectItem,
    datePicker,
    slider,
    checkBoxGroup,
    checkBoxItem,
    radioGroup,
    radioItem,
    switchGroup,
    switchItem,
    chips,
    chipItem,
    button,
    buttons,
    icon,
    iconButton,
    followUpBlock,
    followUpItem,
    chatSectionBlock,
    chatSectionItem,
    chatTabs,
    chatTabItem,
    chatAccordion,
    chatAccordionItem,
    chatCarousel,
    steps,
    stepsItem,
    tagBlock,
    tag,
    chatCard,
  ],
  componentGroups: chatGroups,
};

export const fullLibraryDefinition = {
  root: 'Stack',
  components: [
    stack,
    carousel,
    modal,
    tabs,
    tabItem,
    accordion,
    accordionItem,
    steps,
    stepsItem,
    separator,
    card,
    cardHeader,
    textContent,
    markDownRenderer,
    callout,
    textCallout,
    codeBlock,
    inlineHeader,
    table,
    col,
    editableTable,
    barChart,
    lineChart,
    areaChart,
    radarChart,
    horizontalBarChart,
    series,
    pieChart,
    radialChart,
    singleStackedBarChart,
    slice,
    scatterChart,
    scatterSeries,
    point,
    entityList,
    listBlock,
    listItem,
    snippetCardBlock,
    snippetCardItem,
    overviewCardBlock,
    overviewCardItem,
    contextCardBlock,
    contextCardItem,
    compositeCardBlock,
    compositeCardItem,
    visualCardBlock,
    visualCardItem,
    text,
    boldText,
    iconText,
    imageText,
    imageTextLarge,
    metricIndicatorInline,
    metricIndicatorWithStrikethrough,
    image,
    imageBlock,
    imageGallery,
    optionCards,
    optionCard,
    form,
    formControl,
    label,
    input,
    textArea,
    select,
    selectItem,
    datePicker,
    slider,
    checkBoxGroup,
    checkBoxItem,
    radioGroup,
    radioItem,
    switchGroup,
    switchItem,
    chips,
    chipItem,
    button,
    buttons,
    iconButton,
    tagBlock,
    tag,
    icon,
  ],
  componentGroups: fullGroups,
};
