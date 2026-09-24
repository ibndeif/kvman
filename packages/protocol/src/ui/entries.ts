import { z } from 'zod';
import { compositeDefSchema, widgetDefSchema } from './contributions.ts';
import { forwardIssues } from './issues.ts';

export function withIdentity(definition: z.ZodType, key: 'id' | 'name', identity: z.ZodType) {
  return z.looseObject({ [key]: identity }).superRefine((entry, check) => {
    const rest = Object.fromEntries(Object.entries(entry).filter(([field]) => field !== key));
    forwardIssues(definition.safeParse(rest), check);
  });
}

export const componentDefSchema = z.looseObject({}).superRefine((component, check) => {
  forwardIssues(('widget' in component ? widgetDefSchema : compositeDefSchema).safeParse(component), check);
});
