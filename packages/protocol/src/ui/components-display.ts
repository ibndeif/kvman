import { z } from 'zod';
import { formatSchema, levelSchema, toneSchema } from './base-types.ts';
import { boundJsonSchema, boundStringSchema, viewTextSchema } from './bound-values.ts';
import { eventProp, nodeProps, shellVersionOfLibrary as since, type ComponentSpec } from './component-spec.ts';

const noticeActionSchema = z.strictObject({ label: viewTextSchema, action: eventProp });

export const displayComponents: ComponentSpec[] = [
  {
    name: 'text', since, children: 'none', events: {},
    description: 'A line or paragraph of plain text, optionally formatted (dates, numbers, bytes, …).',
    props: nodeProps({
      text: viewTextSchema, tone: z.union([toneSchema, z.literal('muted')]).exactOptional(), size: z.enum(['sm', 'md', 'lg']).exactOptional(),
      format: formatSchema.exactOptional(),
    }),
    examples: [{ type: 'text', text: '$item.createdAt', format: 'relative', tone: 'muted' }],
  },
  {
    name: 'heading', since, children: 'none', events: {},
    description: 'A heading of level 1 to 3.',
    props: nodeProps({ text: viewTextSchema, level: z.union([z.literal(1), z.literal(2), z.literal(3)]).exactOptional() }),
    examples: [{ type: 'heading', text: { $t: 'files.count', count: '$query.files.items.length' }, level: 2 }],
  },
  {
    name: 'markdown', since, children: 'none', events: {},
    description: 'Markdown rendered through the sanitizer; no HTML and no images.',
    props: nodeProps({ source: viewTextSchema }),
    examples: [{ type: 'markdown', source: '$t.help.body' }],
  },
  {
    name: 'badge', since, children: 'none', events: {},
    description: 'A short label with a tone.',
    props: nodeProps({ text: viewTextSchema, tone: toneSchema.exactOptional() }),
    examples: [{ type: 'badge', text: '$item.status', tone: 'info' }],
  },
  {
    name: 'stat', since, children: 'none', events: {},
    description: 'A labeled number or value with an optional hint.',
    props: nodeProps({ label: viewTextSchema, value: boundJsonSchema, format: formatSchema.exactOptional(), hint: viewTextSchema.exactOptional() }),
    examples: [{ type: 'stat', label: '$t.stats.cost', value: '$query.usage.costUsd', format: 'currency:USD' }],
  },
  {
    name: 'keyValue', since, children: 'none', events: {},
    description: 'A list of labeled values.',
    props: nodeProps({ items: z.array(z.strictObject({ label: viewTextSchema, value: boundJsonSchema, format: formatSchema.exactOptional() })) }),
    examples: [{ type: 'keyValue', items: [{ label: '$t.fields.size', value: '$query.file.size', format: 'bytes' }, { label: '$t.fields.pages', value: '$query.file.pages', format: 'integer' }] }],
  },
  {
    name: 'progress', since, children: 'none', events: {},
    description: 'A progress bar from 0 to 1, indeterminate without a value; live follows a live event with chunk value.',
    props: nodeProps({ value: z.union([z.number().min(0).max(1), boundStringSchema]).exactOptional(), label: viewTextSchema.exactOptional(), live: boundStringSchema.exactOptional() }),
    examples: [{ type: 'progress', live: 'pdf.progress.updated:{{ $item.id }}', label: '$t.progress.translating' }],
  },
  {
    name: 'code', since, children: 'none', events: {},
    description: 'Code, highlighted for a bundled language, always left-to-right.',
    props: nodeProps({ text: boundStringSchema, language: z.string().min(1).exactOptional() }),
    examples: [{ type: 'code', text: '$item.command', language: 'bash' }],
  },
  {
    name: 'diff', since, children: 'none', events: {},
    description: 'The difference between two texts, always left-to-right.',
    props: nodeProps({ before: boundStringSchema, after: boundStringSchema, language: z.string().min(1).exactOptional() }),
    examples: [{ type: 'diff', before: '$item.args.oldString', after: '$item.args.newString', language: 'typescript' }],
  },
  {
    name: 'json', since, children: 'none', events: {},
    description: 'A JSON value as a collapsible tree.',
    props: nodeProps({ value: boundJsonSchema, collapsed: z.boolean().exactOptional() }),
    examples: [{ type: 'json', value: '$item.args', collapsed: false }],
  },
  {
    name: 'image', since, children: 'none', events: {},
    description: 'An image blob of an allowlisted type, with its alternative text.',
    props: nodeProps({ blobId: boundStringSchema, alt: viewTextSchema }),
    examples: [{ type: 'image', blobId: '$item.blobId', alt: '$item.name' }],
  },
  {
    name: 'notice', since, children: 'none', events: {},
    description: 'An inline message about a condition of the page, with an optional action.',
    props: nodeProps({ level: levelSchema, title: viewTextSchema, body: viewTextSchema.exactOptional(), action: noticeActionSchema.exactOptional() }),
    examples: [{ type: 'notice', level: 'warning', title: '$t.notice.noModel', action: { label: '$t.notice.setUp', action: { navigate: '/settings/models' } } }],
  },
  {
    name: 'emptyState', since, children: 'none', events: {},
    description: 'What to show when there is nothing yet, with an optional action.',
    props: nodeProps({ title: viewTextSchema, body: viewTextSchema.exactOptional(), icon: z.string().min(1).exactOptional(), action: noticeActionSchema.exactOptional() }),
    examples: [{ type: 'emptyState', title: '$t.empty.title', body: '$t.empty.body', icon: 'files' }],
  },
  {
    name: 'liveText', since, children: 'none', events: {},
    description: 'Text that grows as a live event with chunk text streams; monospaced and left-to-right by default.',
    props: nodeProps({ live: boundStringSchema, initial: viewTextSchema.exactOptional(), mono: z.boolean().exactOptional() }),
    examples: [{ type: 'liveText', live: 'shell.output.written:{{ $item.jobId }}', mono: true }],
  },
  {
    name: 'fileLink', since, children: 'none', events: { onClick: { description: 'The link was clicked (without it, the blob opens or downloads).' } },
    description: 'A link to a blob that opens or downloads it according to the blob policy.',
    props: nodeProps({ blobId: boundStringSchema, name: viewTextSchema, onClick: eventProp.exactOptional() }),
    examples: [{ type: 'fileLink', blobId: '$query.file.translatedBlobId', name: '$query.file.name' }],
  },
];
