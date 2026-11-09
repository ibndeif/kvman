import type { ComponentGroup } from '@openuidev/lang-core';
import { button, buttons, iconButton } from './buttons.ts';
import { card, chatCard } from './card.ts';
import { chatAccordion, chatAccordionItem, chatSectionBlock, chatSectionItem, chatTabItem, chatTabs } from './chat-containers.ts';
import { callout, cardHeader, codeBlock, inlineHeader, markDownRenderer, textCallout, textContent } from './content.ts';
import { icon, tag, tagBlock } from './data-display.ts';
import { areaChart, barChart, horizontalBarChart, lineChart, pieChart, point, radarChart, radialChart, scatterChart, scatterSeries, series, singleStackedBarChart, slice } from './charts.ts';
import { followUpBlock, followUpItem } from './follow-ups.ts';
import { entityList, listBlock, listItem } from './lists.ts';
import { col, editableTable, table } from './tables.ts';
import { chatNotes, fullNotes } from './group-notes.ts';
import { checkBoxGroup, checkBoxItem, chipItem, chips, datePicker, form, formControl, input, label, radioGroup, radioItem, select, selectItem, slider, switchGroup, switchItem, textArea } from './forms.ts';
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
const forms = ['Form', 'FormControl', 'Label', 'Input', 'TextArea', 'Select', 'SelectItem', 'DatePicker', 'Slider', 'CheckBoxGroup', 'CheckBoxItem', 'RadioGroup', 'RadioItem', 'SwitchGroup', 'SwitchItem', 'Chips', 'ChipItem'];
const tables = ['Table', 'Col', 'EditableTable'];
const charts2d = ['BarChart', 'LineChart', 'AreaChart', 'RadarChart', 'HorizontalBarChart', 'Series'];
const charts1d = ['PieChart', 'RadialChart', 'SingleStackedBarChart', 'Slice'];
const scatter = ['ScatterChart', 'ScatterSeries', 'Point'];

const chatGroups: ComponentGroup[] = [
  chat('Content', ['CardHeader', 'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'CodeBlock', 'Separator', 'InlineHeader']),
  chat('Tables', tables),
  chat('Charts (2D)', charts2d),
  chat('Charts (1D)', charts1d),
  chat('Charts (Scatter)', scatter),
  chat('Forms', forms),
  chat('Buttons', ['Button', 'Buttons', 'Icon', 'IconButton']),
  chat('Lists & Follow-ups', ['ListBlock', 'ListItem', 'FollowUpBlock', 'FollowUpItem']),
  chat('Sections', ['SectionBlock', 'SectionItem']),
  chat('Layout', ['Tabs', 'TabItem', 'Accordion', 'AccordionItem', 'Steps', 'StepsItem']),
  chat('Data Display', ['TagBlock', 'Tag', 'EntityList']),
];

const fullGroups: ComponentGroup[] = [
  full('Layout', ['Stack', 'Tabs', 'TabItem', 'Accordion', 'AccordionItem', 'Steps', 'StepsItem', 'Separator']),
  full('Content', ['Card', 'CardHeader', 'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'CodeBlock', 'InlineHeader']),
  full('Tables', tables),
  full('Charts (2D)', charts2d),
  full('Charts (1D)', charts1d),
  full('Charts (Scatter)', scatter),
  full('Forms', forms),
  full('Buttons', ['Button', 'Buttons', 'IconButton']),
  full('Data Display', ['TagBlock', 'Tag', 'Icon', 'EntityList', 'ListBlock', 'ListItem']),
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
