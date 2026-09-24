import { z } from 'zod';
import { typeNameSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { formOverrideFields } from './base-types.ts';
import { bindingSchema, boundJsonSchema, viewTextSchema } from './bound-values.ts';
import { effectsProp, eventProp, inputControlProps, nodeProps, shellVersionOfLibrary as since, type ComponentSpec } from './component-spec.ts';

const changed = (value: z.ZodType) => ({ onChange: { description: 'The value changed; $value is the new value.', value } });
const uploadedFile = z.strictObject({ blobId: z.string(), name: z.string(), size: z.number(), mime: z.string() });

export const inputComponents: ComponentSpec[] = [
  {
    name: 'form', since, children: 'none', events: {},
    description: 'A form generated from a command\'s input schema; submitting sends the command with $form.',
    props: nodeProps({ command: typeNameSchema, ...formOverrideFields, then: effectsProp.optional() }),
    examples: [{
      type: 'form', command: 'pdf.translate', defaults: { fileId: '$route.fileId', lang: 'ar' }, hidden: ['fileId'],
      fields: { lang: { widget: 'select', options: [['ar', '$t.lang.ar'], ['fr', '$t.lang.fr']] } }, submitLabel: '$t.actions.translate',
      then: [{ toast: '$t.toast.started' }],
    }],
  },
  {
    name: 'textInput', since, children: 'none', events: changed(z.string()),
    description: 'A single line of text; secret masks it.',
    props: inputControlProps({ placeholder: viewTextSchema.optional(), secret: z.boolean().optional(), onChange: eventProp.optional() }),
    examples: [{ type: 'textInput', label: '$t.search', value: '$state.q', onChange: { set: { '$state.q': '$value' } } }],
  },
  {
    name: 'textArea', since, children: 'none', events: changed(z.string()),
    description: 'Several lines of text.',
    props: inputControlProps({ placeholder: viewTextSchema.optional(), rows: z.number().int().positive().optional(), onChange: eventProp.optional() }),
    examples: [{ type: 'textArea', label: '$t.notes', rows: 6 }],
  },
  {
    name: 'numberInput', since, children: 'none', events: changed(z.number()),
    description: 'A number with optional bounds and step.',
    props: inputControlProps({ min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional(), onChange: eventProp.optional() }),
    examples: [{ type: 'numberInput', label: '$t.pages', min: 1, max: 500, step: 1 }],
  },
  {
    name: 'select', since, children: 'none', events: changed(jsonSchema),
    description: 'A choice from options: literal [value, label] pairs, or a bound array of { value, label }.',
    props: inputControlProps({
      options: z.union([z.array(z.tuple([boundJsonSchema, viewTextSchema])), bindingSchema]), placeholder: viewTextSchema.optional(),
      onChange: eventProp.optional(),
    }),
    examples: [{ type: 'select', value: '$state.filter', placeholder: '$t.filter.all', options: [['ready', '$t.status.ready']], onChange: { set: { '$state.filter': '$value' } } }],
  },
  {
    name: 'checkbox', since, children: 'none', events: changed(z.boolean()),
    description: 'A checkbox.',
    props: inputControlProps({ onChange: eventProp.optional() }),
    examples: [{ type: 'checkbox', label: '$t.showHidden', value: '$state.showHidden', onChange: { set: { '$state.showHidden': '$value' } } }],
  },
  {
    name: 'switch', since, children: 'none', events: changed(z.boolean()),
    description: 'An on/off switch.',
    props: inputControlProps({ onChange: eventProp.optional() }),
    examples: [{ type: 'switch', label: '$t.autoTranslate', value: false }],
  },
  {
    name: 'dateInput', since, children: 'none', events: changed(z.number()),
    description: 'A date, as epoch milliseconds, with optional bounds.',
    props: inputControlProps({ min: z.number().optional(), max: z.number().optional(), onChange: eventProp.optional() }),
    examples: [{ type: 'dateInput', label: '$t.from', onChange: { set: { '$state.from': '$value' } } }],
  },
  {
    name: 'upload', since, children: 'none',
    events: { onUpload: { description: 'A file was uploaded as a blob; $upload is { blobId, name, size, mime } (once per file).', value: uploadedFile } },
    description: 'Drop or pick files; each is uploaded as a blob, then onUpload runs.',
    props: inputControlProps({
      accept: z.array(z.string().min(1)).optional(), multiple: z.boolean().optional(), maxBytes: z.number().int().positive().optional(), onUpload: eventProp,
    }),
    examples: [{ type: 'upload', accept: ['application/pdf'], label: '$t.upload.drop', onUpload: { command: 'pdf.import', payload: { blobId: '$upload.blobId' } } }],
  },
  {
    name: 'composer', since, children: 'none',
    events: {
      onSubmit: {
        description: 'The person sent a message; $value is { text, attachments }.',
        value: z.strictObject({ text: z.string(), attachments: z.array(z.strictObject({ blobId: z.string(), name: z.string(), mime: z.string() })) }),
      },
    },
    description: 'A message box with a slash-command menu, attachments, and optional optimistic display.',
    props: inputControlProps({
      onSubmit: eventProp, placeholder: viewTextSchema.optional(),
      slash: z.strictObject({ query: typeNameSchema, payload: z.record(z.string(), boundJsonSchema).optional(), fill: z.record(z.string(), boundJsonSchema).optional() }).optional(),
      attachments: z.boolean().optional(), optimistic: z.boolean().optional(),
    }),
    examples: [{
      type: 'composer', placeholder: '$t.composer.placeholder', attachments: true, optimistic: true,
      slash: { query: 'agent.slash.list', payload: { sessionId: '$route.sessionId' }, fill: { sessionId: '$route.sessionId' } },
      onSubmit: { command: 'agent.send', payload: { sessionId: '$route.sessionId', text: '$value.text' } },
    }],
  },
];
