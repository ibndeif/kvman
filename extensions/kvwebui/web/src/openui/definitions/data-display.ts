import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';

// OpenUI's data display components (plan 06 §6.1, ADR 0124, 4, 11): OpenUI's names, schemas, and descriptions.

export const tagBlock = defineOpenuiComponent('TagBlock', z.object({ tags: z.array(z.string()), size: z.enum(['sm', 'md', 'lg']).optional() }), 'tags is an array of strings; optional size sm | md | lg');

export const icon = defineOpenuiComponent(
  'Icon',
  z.object({
    name: z.string().describe("lucide-react icon name in kebab-case (e.g. 'circle-check', 'rocket')."),
    category: z
      .string()
      .optional()
      .describe("Optional icon category (e.g. 'finance', 'charts', 'security', 'travel', 'people', 'time') used to pick a topical fallback icon when `name` doesn't resolve."),
  }),
  "A lucide icon by kebab-case name (e.g. 'circle-check'). Optional category picks a topical fallback when the name doesn't resolve.",
);

export const tag = defineOpenuiComponent(
  'Tag',
  z.object({
    text: z.string(),
    icon: z.optional(icon.ref),
    size: z.enum(['sm', 'md', 'lg']).optional(),
    variant: z.enum(['neutral', 'info', 'success', 'warning', 'danger']).optional(),
  }),
  'Styled tag/badge with optional Icon and variant',
);

export type TagBlockProps = z.infer<typeof tagBlock.props>;
export type IconProps = z.infer<typeof icon.props>;
export type TagProps = z.infer<typeof tag.props>;
