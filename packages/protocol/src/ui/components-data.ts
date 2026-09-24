import { z } from 'zod';
import { publicNameSchema } from '../extension/grammar.ts';
import { jsonSchema } from '../json.ts';
import { columnSchema } from './base-types.ts';
import { bindingSchema, boundStringSchema, viewTextSchema } from './bound-values.ts';
import { eventProp, nestedViewProp, nodeProps, shellVersionOfLibrary as since, type ComponentSpec } from './component-spec.ts';

const emptyStateProp = z.strictObject({ title: viewTextSchema, body: viewTextSchema.optional() });

export const dataComponents: ComponentSpec[] = [
  {
    name: 'table', since, children: 'none',
    events: {
      onRowClick: { description: 'A row was clicked; $item is its record.', value: jsonSchema },
      onSelect: { description: 'The selection changed; $selection is the selected rows.', value: z.array(jsonSchema) },
    },
    description: 'A virtualized table of records with columns, row actions of its entity, and selection.',
    props: nodeProps({
      data: bindingSchema, columns: z.array(columnSchema), entity: publicNameSchema.optional(),
      rowActions: z.union([z.enum(['auto', 'none']), z.array(publicNameSchema)]).optional(), selectable: z.boolean().optional(),
      emptyState: emptyStateProp.optional(), dense: z.boolean().optional(), onRowClick: eventProp.optional(), onSelect: eventProp.optional(),
    }),
    examples: [{
      type: 'table', entity: 'pdf.file', data: '$query.files.items', rowActions: 'auto',
      columns: [{ field: 'name', label: '$t.columns.name' }, { field: 'status', label: '$t.columns.status', as: 'badge' }],
      onRowClick: { navigate: '/files/{{ $item.id }}' },
    }],
  },
  {
    name: 'list', since, children: 'none', events: { onItemClick: { description: 'An item was clicked; $item is its record.', value: jsonSchema } },
    description: 'A list that renders its item view once per element, with $item.',
    props: nodeProps({
      data: bindingSchema, item: nestedViewProp, entity: publicNameSchema.optional(), emptyState: emptyStateProp.optional(), onItemClick: eventProp.optional(),
    }),
    examples: [{ type: 'list', data: '$query.files.items', item: { type: 'text', text: '$item.name' }, emptyState: { title: '$t.empty.title' } }],
  },
  {
    name: 'thread', since, children: 'none', events: {},
    description: 'A conversation of entries drawn by the renderers of a target, with the running step streamed live until its entry is committed.',
    props: nodeProps({
      data: bindingSchema, target: publicNameSchema,
      live: z.strictObject({ text: boundStringSchema.optional(), thinking: boundStringSchema.optional() }).optional(),
      runField: z.string().min(1).optional(), emptyState: emptyStateProp.optional(),
    }),
    examples: [{
      type: 'thread', data: '$query.history.entries', target: 'agent.entry',
      live: { text: 'agent.tokens.generated:{{ $route.sessionId }}', thinking: 'agent.thinking.generated:{{ $route.sessionId }}' },
    }],
  },
  {
    name: 'settingsSections', since, children: 'none', events: {},
    description: 'Every settings section of the registry (or one, with filter): a generated form per scope or the section\'s own view.',
    props: nodeProps({ filter: z.string().min(1).optional() }),
    examples: [{ type: 'settingsSections', filter: 'settings.section.pdf' }],
  },
];
