import { z } from 'zod';
import { publicNameSchema } from '../extension/grammar.ts';
import { toneSchema } from './base-types.ts';
import { bindingSchema, boundJsonSchema, viewTextSchema } from './bound-values.ts';
import { eventProp, nestedViewProp, nodeProps, shellVersionOfLibrary as since, type ComponentSpec } from './component-spec.ts';

const gapSchema = z.enum(['none', 'sm', 'md', 'lg']);

export const layoutComponents: ComponentSpec[] = [
  {
    name: 'page', since, children: 'any', events: {},
    description: 'The frame of a page: a header with a title, a subtitle, and header actions; with entity and record, the header also shows the entity\'s detail actions.',
    props: nodeProps({
      title: viewTextSchema.exactOptional(), subtitle: viewTextSchema.exactOptional(), actions: z.array(nestedViewProp).exactOptional(),
      entity: publicNameSchema.exactOptional(), record: bindingSchema.exactOptional(),
    }),
    examples: [{ type: 'page', title: '$query.file.name', entity: 'pdf.file', record: '$query.file', children: [{ type: 'text', text: '$query.file.status' }] }],
  },
  {
    name: 'stack', since, children: 'any', events: {},
    description: 'Children one above the other.',
    props: nodeProps({ gap: gapSchema.exactOptional(), align: z.enum(['start', 'center', 'end', 'stretch']).exactOptional() }),
    examples: [{ type: 'stack', gap: 'sm', children: [{ type: 'heading', text: '$t.files.title' }, { type: 'text', text: '$t.files.help' }] }],
  },
  {
    name: 'row', since, children: 'any', events: {},
    description: 'Children side by side.',
    props: nodeProps({
      gap: gapSchema.exactOptional(), align: z.enum(['start', 'center', 'end', 'stretch']).exactOptional(),
      justify: z.enum(['start', 'center', 'end', 'between']).exactOptional(), wrap: z.boolean().exactOptional(),
    }),
    examples: [{ type: 'row', justify: 'between', children: [{ type: 'heading', text: '$t.files.title' }, { type: 'badge', text: '$t.status.ready' }] }],
  },
  {
    name: 'grid', since, children: 'any', events: {},
    description: 'Children in 1 to 4 columns; one column on narrow screens.',
    props: nodeProps({ columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), gap: gapSchema.exactOptional() }),
    examples: [{ type: 'grid', columns: 2, children: [{ type: 'stat', label: '$t.stats.files', value: '$query.stats.files' }, { type: 'stat', label: '$t.stats.pages', value: '$query.stats.pages' }] }],
  },
  {
    name: 'split', since, children: 'any', childCount: { min: 2, max: 2 }, events: {},
    description: 'Exactly two children, side by side or stacked, with a ratio.',
    props: nodeProps({ ratio: z.number().gt(0).lt(1).exactOptional(), direction: z.enum(['row', 'column']).exactOptional() }),
    examples: [{ type: 'split', ratio: 0.4, children: [{ type: 'text', text: '$t.left' }, { type: 'text', text: '$t.right' }] }],
  },
  {
    name: 'section', since, children: 'any', events: {},
    description: 'A titled group of content that can collapse.',
    props: nodeProps({
      title: viewTextSchema.exactOptional(), description: viewTextSchema.exactOptional(), collapsible: z.boolean().exactOptional(), collapsed: z.boolean().exactOptional(),
    }),
    examples: [{ type: 'section', title: '$t.files.translation', collapsible: true, children: [{ type: 'markdown', source: '$query.file.summary' }] }],
  },
  {
    name: 'card', since, children: 'any', events: { onClick: { description: 'The card was clicked.' } },
    description: 'A surface with an optional title, subtitle, and tone.',
    props: nodeProps({ title: viewTextSchema.exactOptional(), subtitle: viewTextSchema.exactOptional(), tone: toneSchema.exactOptional(), onClick: eventProp.exactOptional() }),
    examples: [{ type: 'card', title: '$item.name', subtitle: '$item.status', onClick: { navigate: '/files/{{ $item.id }}' }, children: [{ type: 'badge', text: '$item.status' }] }],
  },
  {
    name: 'tabs', since, children: ['tab'], events: { onChange: { description: 'Another tab was selected.', value: z.string() } },
    description: 'Tabs; the value binding holds the selected tab id (the first tab by default).',
    props: nodeProps({ value: bindingSchema.exactOptional(), onChange: eventProp.exactOptional() }),
    examples: [{ type: 'tabs', value: '$state.tab', onChange: { set: { '$state.tab': '$value' } }, children: [{ type: 'tab', id: 'original', label: '$t.tabs.original', children: [{ type: 'text', text: '$t.original' }] }] }],
  },
  {
    name: 'tab', since, children: 'any', parents: ['tabs'], events: {},
    description: 'One tab of a tabs component.',
    props: nodeProps({ id: z.string().min(1), label: viewTextSchema, icon: z.string().min(1).exactOptional() }),
    examples: [{ type: 'tab', id: 'translation', label: '$t.tabs.translation', icon: 'languages', children: [{ type: 'text', text: '$t.translation' }] }],
  },
  {
    name: 'divider', since, children: 'none', events: {},
    description: 'A thin line between content, or between menu items.',
    props: nodeProps({}),
    examples: [{ type: 'divider' }],
  },
  {
    name: 'slot', since, children: 'none', events: {},
    description: 'Places one of the owner\'s slots; its items come from contributions, and props are passed to them as $slot.',
    props: nodeProps({ name: publicNameSchema, props: z.record(z.string(), boundJsonSchema).exactOptional() }),
    examples: [{ type: 'slot', name: 'agent.chat.prompt', props: { sessionId: '$route.sessionId' } }],
  },
  {
    name: 'children', since, children: 'none', events: {},
    description: 'Inside a composite that declares children: renders the children passed to it.',
    props: nodeProps({}),
    examples: [{ type: 'children' }],
  },
];
