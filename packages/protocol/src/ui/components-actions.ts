import { z } from 'zod';
import { viewTextSchema } from './bound-values.ts';
import { eventProp, nodeProps, pressableProps, shellVersionOfLibrary as since, type ComponentSpec } from './component-spec.ts';

const clicked = { onClick: { description: 'The control was clicked.' } };

export const actionComponents: ComponentSpec[] = [
  {
    name: 'button', since, children: 'none', events: clicked,
    description: 'A button that runs an action; busyLabel shows while its command is in flight.',
    props: pressableProps({
      label: viewTextSchema, onClick: eventProp, icon: z.string().min(1).optional(),
      variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).optional(), busyLabel: viewTextSchema.optional(),
    }),
    examples: [{ type: 'button', label: '$t.actions.translate', icon: 'languages', variant: 'primary', busyLabel: '$t.actions.translating',
      onClick: { command: 'pdf.translate', payload: { fileId: '$route.fileId' }, form: true } }],
  },
  {
    name: 'actionGroup', since, children: ['button', 'menu'], events: {},
    description: 'Buttons and menus kept together.',
    props: nodeProps({}),
    examples: [{ type: 'actionGroup', children: [{ type: 'button', label: '$t.actions.back', onClick: { navigate: '/files' } }] }],
  },
  {
    name: 'menu', since, children: ['menuItem', 'divider'], events: {},
    description: 'A button that opens a list of menu items.',
    props: nodeProps({ label: viewTextSchema, icon: z.string().min(1).optional() }),
    examples: [{ type: 'menu', label: '$t.more', icon: 'ellipsis', children: [{ type: 'menuItem', label: '$t.actions.export', onClick: { command: 'pdf.export', payload: { fileId: '$route.fileId' } } }] }],
  },
  {
    name: 'menuItem', since, children: 'none', parents: ['menu'], events: clicked,
    description: 'One entry of a menu.',
    props: pressableProps({ label: viewTextSchema, onClick: eventProp, icon: z.string().min(1).optional() }),
    examples: [{ type: 'menuItem', label: '$t.actions.delete', icon: 'trash', onClick: { command: 'pdf.file.delete', payload: { fileId: '$item.id' }, confirm: { title: '$t.confirm.delete' } } }],
  },
];
