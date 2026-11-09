import { createLibrary, defineComponent } from '@openuidev/vue-lang';
import { defineComponent as defineVueComponent, h, type Component } from 'vue';
import { withoutSkipped } from './skipped-props.ts';
import { button, buttons, iconButton } from './definitions/buttons.ts';
import { card, chatCard } from './definitions/card.ts';
import { chatAccordion, chatAccordionItem, chatCarousel, chatSectionBlock, chatSectionItem, chatTabItem, chatTabs } from './definitions/chat-containers.ts';
import { callout, cardHeader, codeBlock, inlineHeader, markDownRenderer, textCallout, textContent } from './definitions/content.ts';
import { icon, tag, tagBlock } from './definitions/data-display.ts';
import type { OpenuiComponentDefinition } from './definitions/define.ts';
import { followUpBlock, followUpItem } from './definitions/follow-ups.ts';
import { checkBoxGroup, checkBoxItem, chipItem, chips, datePicker, form, formControl, input, label, optionCard, optionCards, radioGroup, radioItem, select, selectItem, slider, switchGroup, switchItem, textArea } from './definitions/forms.ts';
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
import { boldText, iconText, imageText, imageTextLarge, metricIndicatorInline, metricIndicatorWithStrikethrough, text } from './definitions/card-parts.ts';
import { compositeCardBlock, compositeCardItem, contextCardBlock, contextCardItem, overviewCardBlock, overviewCardItem, snippetCardBlock, snippetCardItem, visualCardBlock, visualCardItem } from './definitions/cards.ts';
import { image, imageBlock, imageGallery } from './definitions/media.ts';
import { carousel, modal } from './definitions/overlays.ts';
import BoldTextRenderer from './cards/BoldTextRenderer.vue';
import CompositeCardBlockRenderer from './cards/CompositeCardBlockRenderer.vue';
import ContextCardBlockRenderer from './cards/ContextCardBlockRenderer.vue';
import IconTextRenderer from './cards/IconTextRenderer.vue';
import ImageTextLargeRenderer from './cards/ImageTextLargeRenderer.vue';
import ImageTextRenderer from './cards/ImageTextRenderer.vue';
import MetricIndicatorInlineRenderer from './cards/MetricIndicatorInlineRenderer.vue';
import MetricIndicatorWithStrikethroughRenderer from './cards/MetricIndicatorWithStrikethroughRenderer.vue';
import OverviewCardBlockRenderer from './cards/OverviewCardBlockRenderer.vue';
import SnippetCardBlockRenderer from './cards/SnippetCardBlockRenderer.vue';
import TextRenderer from './cards/TextRenderer.vue';
import VisualCardBlockRenderer from './cards/VisualCardBlockRenderer.vue';
import CarouselRenderer from './renderers/CarouselRenderer.vue';
import ImageBlockRenderer from './renderers/ImageBlockRenderer.vue';
import ImageGalleryRenderer from './renderers/ImageGalleryRenderer.vue';
import ImageRenderer from './renderers/ImageRenderer.vue';
import ModalRenderer from './renderers/ModalRenderer.vue';
import OptionCardsRenderer from './renderers/OptionCardsRenderer.vue';
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
  [snippetCardBlock, SnippetCardBlockRenderer],
  [snippetCardItem, NullRenderer],
  [overviewCardBlock, OverviewCardBlockRenderer],
  [overviewCardItem, NullRenderer],
  [contextCardBlock, ContextCardBlockRenderer],
  [contextCardItem, NullRenderer],
  [compositeCardBlock, CompositeCardBlockRenderer],
  [compositeCardItem, NullRenderer],
  [visualCardBlock, VisualCardBlockRenderer],
  [visualCardItem, NullRenderer],
  [text, TextRenderer],
  [boldText, BoldTextRenderer],
  [iconText, IconTextRenderer],
  [imageText, ImageTextRenderer],
  [imageTextLarge, ImageTextLargeRenderer],
  [metricIndicatorInline, MetricIndicatorInlineRenderer],
  [metricIndicatorWithStrikethrough, MetricIndicatorWithStrikethroughRenderer],
  [image, ImageRenderer],
  [imageBlock, ImageBlockRenderer],
  [imageGallery, ImageGalleryRenderer],
  [modal, ModalRenderer],
  [carousel, CarouselRenderer],
  [chatCarousel, CarouselRenderer],
  [optionCards, OptionCardsRenderer],
  [optionCard, NullRenderer],
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

// Each renderer gets its props with the arguments the model skipped with `null` left out.
function withoutSkippedProps(renderer: Component): Component {
  return defineVueComponent({
    props: { props: { type: Object, required: true }, renderNode: { type: Function, required: true } },
    setup: (given) => () => h(renderer, { props: withoutSkipped(given.props), renderNode: given.renderNode }),
  });
}

function componentOf(definition: OpenuiComponentDefinition) {
  const component = renderers.get(definition);
  if (component === undefined) throw new Error(`No renderer for OpenUI's ${definition.name}.`);
  return defineComponent({ ...definition, component: withoutSkippedProps(component) });
}

export const openuiLibraries = {
  chat: createLibrary({ root: chatLibraryDefinition.root, components: chatLibraryDefinition.components.map(componentOf), componentGroups: chatLibraryDefinition.componentGroups }),
  full: createLibrary({ root: fullLibraryDefinition.root, components: fullLibraryDefinition.components.map(componentOf), componentGroups: fullLibraryDefinition.componentGroups }),
};
