import { z } from 'zod/v4';
import { icon } from './data-display.ts';
import { defineOpenuiComponent } from './define.ts';

// The inline building blocks of OpenUI's card items (plan 06 §6.1, ADR 0124, 4, 7, 11): OpenUI's names, schemas, and
// descriptions. "src must be a real image URL" reads as kvman's images do: a workspace path or a `data:` image.

const line = {
  variant: z.enum(['text', 'number']).default('text'),
  value: z.string(),
  subtext: z.string().optional(),
  subtextVariant: z.enum(['text', 'number', 'metric']).default('text'),
  size: z.enum(['xs', 'sm', 'md', 'lg']).default('sm'),
};

export const text = defineOpenuiComponent('Text', z.object(line), "Plain text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red.");

export const boldText = defineOpenuiComponent('BoldText', z.object(line), "Emphasized (bold) text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red.");

export const iconText = defineOpenuiComponent(
  'IconText',
  z.object({
    icon: icon.ref,
    iconVariant: z.enum(['neutral', 'info', 'success', 'warning', 'danger', 'inverted', 'filled', 'soft']).default('neutral'),
    iconSize: z.enum(['xs', 's', 'm', 'l', 'xl', 'sm', 'md', 'lg']).default('m'),
    title: z.string(),
    subtitle: z.string().optional(),
    bold: z.boolean().default(false),
    layout: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),
  'An icon badge with a title and optional subtitle, laid out horizontally or vertically. iconVariant sets the badge color.',
);

const pictured = { src: z.string(), alt: z.string().optional(), title: z.string(), subtitle: z.string().optional(), bold: z.boolean().default(false) };

export const imageText = defineOpenuiComponent(
  'ImageText',
  z.object({ ...pictured, layout: z.enum(['horizontal', 'vertical']).default('horizontal'), imageSize: z.number().optional() }),
  'A small square image (thumbnail/avatar) with a title and optional subtitle. src must be a path in the workspace or a data: image.',
);

export const imageTextLarge = defineOpenuiComponent(
  'ImageTextLarge',
  z.object(pictured),
  'A full-width banner image above a bold title and optional subtitle. src must be a path in the workspace or a data: image.',
);

const trend = z.object({ direction: z.enum(['up', 'down']), value: z.number() });

export const metricIndicatorWithStrikethrough = defineOpenuiComponent(
  'MetricIndicatorWithStrikethrough',
  z.object({ value: z.string(), subtext: z.string().optional(), previousValue: z.string().optional(), trend: trend.optional() }),
  'Headline metric value with an optional struck-through previousValue, a +/- percentage trend, and subtext below.',
);

export const metricIndicatorInline = defineOpenuiComponent(
  'MetricIndicatorInline',
  z.object({ value: z.string(), subtext: z.string().optional(), trend: trend.optional() }),
  'Headline metric value with an optional +/- percentage trend and subtext, all on one line.',
);

export type TextProps = z.infer<typeof text.props>;
export type IconTextProps = z.infer<typeof iconText.props>;
export type ImageTextProps = z.infer<typeof imageText.props>;
export type ImageTextLargeProps = z.infer<typeof imageTextLarge.props>;
export type MetricProps = z.infer<typeof metricIndicatorWithStrikethrough.props>;
