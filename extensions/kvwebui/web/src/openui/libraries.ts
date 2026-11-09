import { createLibrary, defineComponent } from '@openuidev/vue-lang';
import type { Component } from 'vue';
import { button, buttons, iconButton } from './definitions/buttons.ts';
import { card, chatCard } from './definitions/card.ts';
import { chatAccordion, chatAccordionItem, chatSectionBlock, chatSectionItem, chatTabItem, chatTabs } from './definitions/chat-containers.ts';
import { callout, cardHeader, codeBlock, inlineHeader, markDownRenderer, textCallout, textContent } from './definitions/content.ts';
import { icon, tag, tagBlock } from './definitions/data-display.ts';
import type { OpenuiComponentDefinition } from './definitions/define.ts';
import { followUpBlock, followUpItem } from './definitions/follow-ups.ts';
import { checkBoxGroup, checkBoxItem, chipItem, chips, datePicker, form, formControl, input, label, radioGroup, radioItem, select, selectItem, slider, switchGroup, switchItem, textArea } from './definitions/forms.ts';
import { accordion, accordionItem, stack, tabItem, tabs } from './definitions/layout.ts';
import { separator, steps, stepsItem } from './definitions/layout-items.ts';
import { chatLibraryDefinition, fullLibraryDefinition } from './definitions/libraries.ts';
import AccordionRenderer from './renderers/AccordionRenderer.vue';
import { areaChart, barChart, horizontalBarChart, lineChart, pieChart, point, radarChart, radialChart, scatterChart, scatterSeries, series, singleStackedBarChart, slice } from './definitions/charts.ts';
import { entityList, listBlock, listItem } from './definitions/lists.ts';
import { col, editableTable, table } from './definitions/tables.ts';
import AreaChartRenderer from './charts/AreaChartRenderer.vue';
import BarChartRenderer from './charts/BarChartRenderer.vue';
import HorizontalBarChartRenderer from './charts/HorizontalBarChartRenderer.vue';
import LineChartRenderer from './charts/LineChartRenderer.vue';
import PieChartRenderer from './charts/PieChartRenderer.vue';
import RadarChartRenderer from './charts/RadarChartRenderer.vue';
import RadialChartRenderer from './charts/RadialChartRenderer.vue';
import ScatterChartRenderer from './charts/ScatterChartRenderer.vue';
import SingleStackedBarChartRenderer from './charts/SingleStackedBarChartRenderer.vue';
import EditableTableRenderer from './renderers/EditableTableRenderer.vue';
import EntityListRenderer from './renderers/EntityListRenderer.vue';
import ListBlockRenderer from './renderers/ListBlockRenderer.vue';
import TableRenderer from './renderers/TableRenderer.vue';
import ButtonRenderer from './renderers/ButtonRenderer.vue';
import CheckBoxGroupRenderer from './renderers/CheckBoxGroupRenderer.vue';
import ChipsRenderer from './renderers/ChipsRenderer.vue';
import DatePickerRenderer from './renderers/DatePickerRenderer.vue';
import FormRenderer from './renderers/FormRenderer.vue';
import FormControlRenderer from './renderers/FormControlRenderer.vue';
import InputRenderer from './renderers/InputRenderer.vue';
import LabelRenderer from './renderers/LabelRenderer.vue';
import RadioGroupRenderer from './renderers/RadioGroupRenderer.vue';
import SelectRenderer from './renderers/SelectRenderer.vue';
import SliderRenderer from './renderers/SliderRenderer.vue';
import SwitchGroupRenderer from './renderers/SwitchGroupRenderer.vue';
import TextAreaRenderer from './renderers/TextAreaRenderer.vue';
import ButtonsRenderer from './renderers/ButtonsRenderer.vue';
import CalloutRenderer from './renderers/CalloutRenderer.vue';
import CardHeaderRenderer from './renderers/CardHeaderRenderer.vue';
import CardRenderer from './renderers/CardRenderer.vue';
import ChatCardRenderer from './renderers/ChatCardRenderer.vue';
import CodeBlockRenderer from './renderers/CodeBlockRenderer.vue';
import FollowUpBlockRenderer from './renderers/FollowUpBlockRenderer.vue';
import IconButtonRenderer from './renderers/IconButtonRenderer.vue';
import IconRenderer from './renderers/IconRenderer.vue';
import InlineHeaderRenderer from './renderers/InlineHeaderRenderer.vue';
import MarkDownRendererRenderer from './renderers/MarkDownRendererRenderer.vue';
import { NullRenderer } from './renderers/NullRenderer.ts';
import SectionBlockRenderer from './renderers/SectionBlockRenderer.vue';
import SeparatorRenderer from './renderers/SeparatorRenderer.vue';
import StackRenderer from './renderers/StackRenderer.vue';
import StepsRenderer from './renderers/StepsRenderer.vue';
import TabsRenderer from './renderers/TabsRenderer.vue';
import TagBlockRenderer from './renderers/TagBlockRenderer.vue';
import TagRenderer from './renderers/TagRenderer.vue';
import TextCalloutRenderer from './renderers/TextCalloutRenderer.vue';
import TextContentRenderer from './renderers/TextContentRenderer.vue';

// The libraries the Renderer draws with (plan 06 §6.1, ADR 0124, 4): each OpenUI definition paired with kvwebui's Vue
// component. One table holds every pairing; both libraries are built from their definitions through it.

const renderers = new Map<OpenuiComponentDefinition, Component>([
  [stack, StackRenderer],
  [card, CardRenderer],
  [chatCard, ChatCardRenderer],
  [cardHeader, CardHeaderRenderer],
  [textContent, TextContentRenderer],
  [markDownRenderer, MarkDownRendererRenderer],
  [callout, CalloutRenderer],
  [textCallout, TextCalloutRenderer],
  [codeBlock, CodeBlockRenderer],
  [inlineHeader, InlineHeaderRenderer],
  [button, ButtonRenderer],
  [buttons, ButtonsRenderer],
  [iconButton, IconButtonRenderer],
  [tagBlock, TagBlockRenderer],
  [tag, TagRenderer],
  [icon, IconRenderer],
  [tabs, TabsRenderer],
  [chatTabs, TabsRenderer],
  [tabItem, NullRenderer],
  [chatTabItem, NullRenderer],
  [accordion, AccordionRenderer],
  [chatAccordion, AccordionRenderer],
  [accordionItem, NullRenderer],
  [chatAccordionItem, NullRenderer],
  [steps, StepsRenderer],
  [stepsItem, NullRenderer],
  [separator, SeparatorRenderer],
  [followUpBlock, FollowUpBlockRenderer],
  [followUpItem, NullRenderer],
  [chatSectionBlock, SectionBlockRenderer],
  [chatSectionItem, NullRenderer],
  [table, TableRenderer],
  [col, NullRenderer],
  [editableTable, EditableTableRenderer],
  [barChart, BarChartRenderer],
  [lineChart, LineChartRenderer],
  [areaChart, AreaChartRenderer],
  [radarChart, RadarChartRenderer],
  [horizontalBarChart, HorizontalBarChartRenderer],
  [series, NullRenderer],
  [pieChart, PieChartRenderer],
  [radialChart, RadialChartRenderer],
  [singleStackedBarChart, SingleStackedBarChartRenderer],
  [slice, NullRenderer],
  [scatterChart, ScatterChartRenderer],
  [scatterSeries, NullRenderer],
  [point, NullRenderer],
  [entityList, EntityListRenderer],
  [listBlock, ListBlockRenderer],
  [listItem, NullRenderer],
  [form, FormRenderer],
  [formControl, FormControlRenderer],
  [label, LabelRenderer],
  [input, InputRenderer],
  [textArea, TextAreaRenderer],
  [select, SelectRenderer],
  [selectItem, NullRenderer],
  [datePicker, DatePickerRenderer],
  [slider, SliderRenderer],
  [checkBoxGroup, CheckBoxGroupRenderer],
  [checkBoxItem, NullRenderer],
  [radioGroup, RadioGroupRenderer],
  [radioItem, NullRenderer],
  [switchGroup, SwitchGroupRenderer],
  [switchItem, NullRenderer],
  [chips, ChipsRenderer],
  [chipItem, NullRenderer],
]);

function componentOf(definition: OpenuiComponentDefinition) {
  const component = renderers.get(definition);
  if (component === undefined) throw new Error(`No renderer for OpenUI's ${definition.name}.`);
  return defineComponent({ ...definition, component });
}

export const openuiLibraries = {
  chat: createLibrary({ root: chatLibraryDefinition.root, components: chatLibraryDefinition.components.map(componentOf), componentGroups: chatLibraryDefinition.componentGroups }),
  full: createLibrary({ root: fullLibraryDefinition.root, components: fullLibraryDefinition.components.map(componentOf), componentGroups: fullLibraryDefinition.componentGroups }),
};
