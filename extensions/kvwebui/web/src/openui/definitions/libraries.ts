import type { ComponentGroup } from '@openuidev/lang-core';
import { button, buttons, iconButton } from './buttons.ts';
import { card, chatCard } from './card.ts';
import { chatAccordion, chatAccordionItem, chatSectionBlock, chatSectionItem, chatTabItem, chatTabs } from './chat-containers.ts';
import { callout, cardHeader, codeBlock, inlineHeader, markDownRenderer, textCallout, textContent } from './content.ts';
import { icon, tag, tagBlock } from './data-display.ts';
import { followUpBlock, followUpItem } from './follow-ups.ts';
import { chatNotes, fullNotes } from './group-notes.ts';
import { checkBoxGroup, checkBoxItem, chipItem, chips, datePicker, form, formControl, input, label, radioGroup, radioItem, select, selectItem, slider, switchGroup, switchItem, textArea } from './forms.ts';
import { accordion, accordionItem, stack, tabItem, tabs } from './layout.ts';
import { separator, steps, stepsItem } from './layout-items.ts';

// The two libraries of OpenUI (plan 06 §6.1, ADR 0124, 4, 13): a reply is read with the chat library, root `Card`, and
// an artifact with `openuiLibrary`, root `Stack`. A group holds only the components this milestone builds.

const chatGroups: ComponentGroup[] = [
  { name: 'Content', components: ['CardHeader', 'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'CodeBlock', 'Separator', 'InlineHeader'], notes: [...(chatNotes['Content'] ?? [])] },
  { name: 'Forms', components: ['Form', 'FormControl', 'Label', 'Input', 'TextArea', 'Select', 'SelectItem', 'DatePicker', 'Slider', 'CheckBoxGroup', 'CheckBoxItem', 'RadioGroup', 'RadioItem', 'SwitchGroup', 'SwitchItem', 'Chips', 'ChipItem'], notes: [...(chatNotes['Forms'] ?? [])] },
  { name: 'Buttons', components: ['Button', 'Buttons', 'Icon', 'IconButton'], notes: [...(chatNotes['Buttons'] ?? [])] },
  { name: 'Lists & Follow-ups', components: ['FollowUpBlock', 'FollowUpItem'], notes: [...(chatNotes['Lists & Follow-ups'] ?? [])] },
  { name: 'Sections', components: ['SectionBlock', 'SectionItem'], notes: [...(chatNotes['Sections'] ?? [])] },
  { name: 'Layout', components: ['Tabs', 'TabItem', 'Accordion', 'AccordionItem', 'Steps', 'StepsItem'], notes: [...(chatNotes['Layout'] ?? [])] },
  { name: 'Data Display', components: ['TagBlock', 'Tag'], notes: [...(chatNotes['Data Display'] ?? [])] },
];

const fullGroups: ComponentGroup[] = [
  { name: 'Layout', components: ['Stack', 'Tabs', 'TabItem', 'Accordion', 'AccordionItem', 'Steps', 'StepsItem', 'Separator'], notes: [...(fullNotes['Layout'] ?? [])] },
  { name: 'Content', components: ['Card', 'CardHeader', 'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'CodeBlock', 'InlineHeader'], notes: [...(fullNotes['Content'] ?? [])] },
  { name: 'Forms', components: ['Form', 'FormControl', 'Label', 'Input', 'TextArea', 'Select', 'SelectItem', 'DatePicker', 'Slider', 'CheckBoxGroup', 'CheckBoxItem', 'RadioGroup', 'RadioItem', 'SwitchGroup', 'SwitchItem', 'Chips', 'ChipItem'], notes: [...(fullNotes['Forms'] ?? [])] },
  { name: 'Buttons', components: ['Button', 'Buttons', 'IconButton'], notes: [...(fullNotes['Buttons'] ?? [])] },
  { name: 'Data Display', components: ['TagBlock', 'Tag', 'Icon'], notes: [...(fullNotes['Data Display'] ?? [])] },
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
