import { z } from 'zod/v4';
import { bound, defineOpenuiComponent } from './define.ts';

// OpenUI's content components (plan 06 §6.1, ADR 0124, 4, 11): OpenUI's names, schemas, and descriptions.

export const cardHeader = defineOpenuiComponent('CardHeader', z.object({ title: z.string().optional(), subtitle: z.string().optional() }), 'Header with optional title and subtitle');

export const textContent = defineOpenuiComponent(
  'TextContent',
  z.object({ text: z.string(), size: z.enum(['small', 'default', 'large', 'small-heavy', 'large-heavy']).optional() }),
  'Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".',
);

export const markDownRenderer = defineOpenuiComponent(
  'MarkDownRenderer',
  z.object({ textMarkdown: z.string(), variant: z.enum(['clear', 'card', 'sunk']).optional() }),
  'Renders markdown text with optional container variant',
);

export const callout = defineOpenuiComponent(
  'Callout',
  z.object({
    variant: z.enum(['info', 'warning', 'error', 'success', 'neutral']),
    title: z.string(),
    description: z.string(),
    visible: bound(z.boolean().optional()),
  }),
  'Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false.',
);

export const textCallout = defineOpenuiComponent(
  'TextCallout',
  z.object({
    variant: z.enum(['neutral', 'info', 'warning', 'success', 'danger']).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  'Text callout with variant, title, and description',
);

export const codeBlock = defineOpenuiComponent('CodeBlock', z.object({ language: z.string(), codeString: z.string() }), 'Syntax-highlighted code block');

export const inlineHeader = defineOpenuiComponent(
  'InlineHeader',
  z.object({ heading: z.string(), description: z.string().optional() }),
  'Compact section heading with an optional one-line description, for use inside cards.',
);

export type CardHeaderProps = z.infer<typeof cardHeader.props>;
export type TextContentProps = z.infer<typeof textContent.props>;
export type MarkDownRendererProps = z.infer<typeof markDownRenderer.props>;
export type CalloutProps = z.infer<typeof callout.props>;
export type TextCalloutProps = z.infer<typeof textCallout.props>;
export type CodeBlockProps = z.infer<typeof codeBlock.props>;
export type InlineHeaderProps = z.infer<typeof inlineHeader.props>;
