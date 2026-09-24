import { z } from 'zod';

export type LaneTemplatePart = { literal: string } | { path: string };

export type LaneTemplateParse = { ok: true; parts: LaneTemplatePart[] } | { ok: false; message: string };

const placeholderPattern = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const allowedPathPattern = /^(?:\$payload(?:\.[^.\s{}$]+)+|\$context\.[^.\s{}$]+|\$message\.(?:id|source|workspaceId))$/;

function literalPart(literal: string): LaneTemplatePart[] {
  return literal === '' ? [] : [{ literal }];
}

export function parseLaneTemplate(template: string): LaneTemplateParse {
  const parts: LaneTemplatePart[] = [];
  let consumed = 0;
  for (const match of template.matchAll(placeholderPattern)) {
    const path = match[1] ?? '';
    if (!allowedPathPattern.test(path)) {
      return { ok: false, message: `"${path}" is not a lane path; use $payload.<field>, $context.<key>, $message.id, $message.source, or $message.workspaceId` };
    }
    parts.push(...literalPart(template.slice(consumed, match.index)), { path });
    consumed = match.index + match[0].length;
  }
  parts.push(...literalPart(template.slice(consumed)));
  if (parts.some((part) => 'literal' in part && /[{}]/.test(part.literal))) {
    return { ok: false, message: 'unbalanced "{{" or "}}" in the lane template' };
  }
  if (!parts.some((part) => 'path' in part)) {
    return { ok: false, message: 'a lane template needs at least one {{ <path> }} placeholder' };
  }
  return { ok: true, parts };
}

export const laneTemplateSchema = z.string().superRefine((template, check) => {
  const parse = parseLaneTemplate(template);
  if (!parse.ok) check.addIssue({ code: 'custom', message: parse.message });
});
