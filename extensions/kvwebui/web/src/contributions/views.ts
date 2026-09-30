import { jsonSchema, z, type Json } from '@kvman/sdk';

// View trees (plan 06 §6.4): JSON trees of kvwebui's built-in components (`custom` comes with M2.3, so until then it's
// an unknown component). Every text is a translation key, and inputs and params may hold `{ $param }`, `{ $row }`, or
// (in `then`) `{ $output }` references, resolved when they're used.

const kebab = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';

/** A full page id: `<namespace>.<page>`. */
export const fullPageIdSchema = z.string().regex(new RegExp(`^${kebab}\\.${kebab}$`), 'A page id is <namespace>.<page>.');

/** An id local to an extension. */
export const localIdSchema = z.string().regex(new RegExp(`^${kebab}$`), 'An id is lowercase kebab case.');

const textKey = z.string().min(1);
const callName = z.string().min(1);
const values = z.record(z.string(), jsonSchema);

export type Values = Record<string, Json>;

export const toneSchema = z.enum(['neutral', 'info', 'success', 'warning', 'danger']);
export const toastLevelSchema = z.enum(['info', 'success', 'warning', 'error']);
export const formatSchema = z.enum(['text', 'number', 'date', 'bytes', 'boolean']);

export type Tone = z.output<typeof toneSchema>;
export type ToastLevel = z.output<typeof toastLevelSchema>;
export type Format = z.output<typeof formatSchema>;

export const columnSchema = z.object({
  field: z.string().min(1),
  title: textKey,
  format: formatSchema.exactOptional(),
  secondary: z.string().min(1).exactOptional(),
  badges: z.record(z.string(), z.object({ text: textKey, tone: toneSchema })).exactOptional(),
});

export type Column = z.output<typeof columnSchema>;

export const thenSchema = z.union([
  z.literal('rerun'),
  z.object({ navigate: fullPageIdSchema, params: values.exactOptional() }),
  z.object({ toast: textKey, level: toastLevelSchema.exactOptional() }),
]);

export type Then = z.output<typeof thenSchema>;

export const pageLinkSchema = z.object({ page: fullPageIdSchema, params: values.exactOptional() });

export type PageLink = z.output<typeof pageLinkSchema>;

const buttonSchema = z.object({
  type: z.literal('button'),
  text: textKey,
  params: values.exactOptional(),
  command: callName,
  input: values,
  confirm: textKey.exactOptional(),
  style: z.enum(['primary', 'secondary', 'danger']).exactOptional(),
  then: thenSchema.exactOptional(),
});

export type ButtonView = z.output<typeof buttonSchema>;

type Text = { text: string; params?: Values };

export type View =
  | { type: 'stack'; direction: 'vertical' | 'horizontal'; gap?: 'sm' | 'md' | 'lg'; children: View[] }
  | { type: 'card'; title?: string; children: View[] }
  | ({ type: 'heading'; level: 1 | 2 | 3 } & Text)
  | ({ type: 'text' } & Text)
  | { type: 'markdown'; text?: string; params?: Values; query?: string; input?: Values; field?: string }
  | { type: 'table'; query: string; input: Values; columns: Column[]; rowActions?: ButtonView[]; rowLink?: PageLink; empty?: string }
  | { type: 'list'; query: string; input: Values; item: View; empty?: string }
  | { type: 'detail'; query: string; input: Values; fields: Column[] }
  | { type: 'form'; command: string; fixed?: Values; submit: string; then?: Then }
  | ({ type: 'link'; to: PageLink } & Text)
  | ButtonView;

export const viewSchema: z.ZodType<View> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('stack'), direction: z.enum(['vertical', 'horizontal']), gap: z.enum(['sm', 'md', 'lg']).exactOptional(), children: z.array(viewSchema) }),
    z.object({ type: z.literal('card'), title: textKey.exactOptional(), children: z.array(viewSchema) }),
    z.object({ type: z.literal('heading'), text: textKey, params: values.exactOptional(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
    z.object({ type: z.literal('text'), text: textKey, params: values.exactOptional() }),
    z
      .object({ type: z.literal('markdown'), text: textKey.exactOptional(), params: values.exactOptional(), query: callName.exactOptional(), input: values.exactOptional(), field: z.string().min(1).exactOptional() })
      .refine(
        (view) => (view.text === undefined ? view.query !== undefined && view.input !== undefined && view.field !== undefined : view.query === undefined && view.input === undefined && view.field === undefined),
        'A markdown view has either a text, or a query, input, and field.',
      ),
    z.object({
      type: z.literal('table'),
      query: callName,
      input: values,
      columns: z.array(columnSchema).min(1),
      rowActions: z.array(buttonSchema).exactOptional(),
      rowLink: pageLinkSchema.exactOptional(),
      empty: textKey.exactOptional(),
    }),
    z.object({ type: z.literal('list'), query: callName, input: values, item: viewSchema, empty: textKey.exactOptional() }),
    z.object({ type: z.literal('detail'), query: callName, input: values, fields: z.array(columnSchema).min(1) }),
    z.object({ type: z.literal('form'), command: callName, fixed: values.exactOptional(), submit: textKey, then: thenSchema.exactOptional() }),
    z.object({ type: z.literal('link'), text: textKey, params: values.exactOptional(), to: pageLinkSchema }),
    buttonSchema,
  ]),
);
