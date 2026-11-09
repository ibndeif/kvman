import { z } from 'zod/v4';
import { button } from './buttons.ts';
import { boldText, iconText, imageText, imageTextLarge, metricIndicatorInline, metricIndicatorWithStrikethrough, text } from './card-parts.ts';
import { areaChart, barChart, lineChart } from './charts.ts';
import { tag, tagBlock } from './data-display.ts';
import { actionSchema, defineOpenuiComponent } from './define.ts';
import { entityList, listBlock } from './lists.ts';
import { image } from './media.ts';

// OpenUI's card blocks (plan 06 §6.1, ADR 0124, 4, 7, 11, 14): OpenUI's names, schemas, and descriptions. Each block
// lays out two or more items; its optional action makes every card pressable. "bgImageSrc must be a real URL" reads as
// kvman's images do: a workspace path or a `data:` image.

const block = { layout: z.enum(['grid', 'carousel']).default('grid'), responsive: z.boolean().default(true), action: actionSchema.optional(), gap: z.union([z.number(), z.string()]).optional() };

export const snippetCardItem = defineOpenuiComponent(
  'SnippetCardItem',
  z.object({ id: z.string().optional(), lhs: z.union([iconText.ref, imageText.ref]), rhs: z.union([text.ref, boldText.ref]).optional() }),
  'One row-style snippet card: a label on the left (IconText or ImageText) and an optional value on the right (Text or BoldText).',
);

export const snippetCardBlock = defineOpenuiComponent(
  'SnippetCardBlock',
  z.object({ items: z.array(snippetCardItem.ref).min(2), layout: z.enum(['grid']).default('grid'), responsive: block.responsive, action: block.action, gap: block.gap }),
  'A responsive grid of compact label/value cards (2 per row) for showing several short facts side by side; optionally clickable with a shared action.',
);

export const overviewCardItem = defineOpenuiComponent(
  'OverviewCardItem',
  z.object({ id: z.string().optional(), top: z.union([iconText.ref, imageText.ref, text.ref]), bottom: z.optional(metricIndicatorInline.ref) }),
  'One overview card: a heading slot at the top (IconText, ImageText or Text) and an optional MetricIndicatorInline at the bottom.',
);

export const overviewCardBlock = defineOpenuiComponent(
  'OverviewCardBlock',
  z.object({ items: z.array(overviewCardItem.ref).min(2), ...block }),
  'A grid or horizontal carousel of compact overview cards, each with a heading (icon/image/text) on top and an inline metric below; optionally clickable with a shared action.',
);

export const contextCardItem = defineOpenuiComponent(
  'ContextCardItem',
  z.object({ id: z.string().optional(), title: z.union([z.string(), tag.ref]), body: z.string().optional(), bgColor: z.enum(['gray']).optional(), bgImageSrc: z.string().optional(), bgImageAlt: z.string().optional() }),
  'A single card inside a ContextCardBlock: a title (plain string or Tag), an optional markdown body, and an optional gray tint or background image.',
);

export const contextCardBlock = defineOpenuiComponent(
  'ContextCardBlock',
  z.object({ items: z.array(contextCardItem.ref).min(2), ...block }),
  'A grid or carousel of compact tinted context cards (title or tag plus a short bold body); an optional action makes every card clickable.',
);

const compositeBody = z.union([text.ref, boldText.ref, metricIndicatorInline.ref, iconText.ref, image.ref, areaChart.ref, barChart.ref, lineChart.ref, listBlock.ref, tagBlock.ref, entityList.ref]);

export const compositeCardItem = defineOpenuiComponent(
  'CompositeCardItem',
  z.object({
    id: z.string().optional(),
    header: z.union([iconText.ref, imageText.ref, imageTextLarge.ref, text.ref, image.ref]).optional(),
    body: z.array(compositeBody).default([]),
    footer: z.object({ price: z.union([boldText.ref, metricIndicatorWithStrikethrough.ref]).optional(), button: z.optional(button.ref) }).optional(),
  }),
  'A single card inside a CompositeCardBlock: an optional header (icon/image/text), a stack of body elements (text, metrics, charts, lists, tags), and an optional price/button footer.',
);

export const compositeCardBlock = defineOpenuiComponent(
  'CompositeCardBlock',
  z.object({ items: z.array(compositeCardItem.ref).min(2), ...block }),
  'A two-per-row grid or carousel of rich cards, each with an optional header, stacked body content (text, metrics, charts, lists, tags) and a price/button footer; an optional action makes every card clickable.',
);

export const visualCardItem = defineOpenuiComponent(
  'VisualCardItem',
  z.object({ body: boldText.ref, id: z.string().optional(), bgImageSrc: z.string().optional(), tag: z.optional(tag.ref), bgImageAlt: z.string().optional() }),
  'A single photo-first card inside a VisualCardBlock: a BoldText body panel, an optional Tag, and a background image (bgImageSrc must be a path in the workspace or a data: image; bgImageAlt is its alt text).',
);

export const visualCardBlock = defineOpenuiComponent(
  'VisualCardBlock',
  z.object({ items: z.array(visualCardItem.ref).min(2), ...block }),
  'A grid or carousel of photo-first cards: a full-bleed background image with a tag on top and a bold text panel at the bottom; an optional action makes every card clickable.',
);

export type SnippetCardBlockProps = z.infer<typeof snippetCardBlock.props>;
export type OverviewCardBlockProps = z.infer<typeof overviewCardBlock.props>;
export type ContextCardBlockProps = z.infer<typeof contextCardBlock.props>;
export type CompositeCardBlockProps = z.infer<typeof compositeCardBlock.props>;
export type VisualCardBlockProps = z.infer<typeof visualCardBlock.props>;
