import { z } from 'zod/v4';
import { buttons } from './buttons.ts';
import { icon } from './data-display.ts';
import { image } from './media.ts';
import { bound, defineOpenuiComponent } from './define.ts';

// OpenUI's form components (plan 06 §6.1, ADR 0124, 4, 11, 14): OpenUI's names, schemas, and descriptions.

/** A field's validation rules, as OpenUI's structured `rules` object. */
export const rulesSchema = z
  .object({
    required: z.boolean().optional(),
    email: z.boolean().optional(),
    url: z.boolean().optional(),
    numeric: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
  })
  .optional();

export const label = defineOpenuiComponent('Label', z.object({ text: z.string() }), 'Text label');

export const input = defineOpenuiComponent(
  'Input',
  z.object({
    name: z.string(),
    placeholder: z.string().optional(),
    type: z.enum(['text', 'email', 'password', 'number', 'url']).optional(),
    rules: rulesSchema,
    value: bound(z.string().optional()),
  }),
  '',
);

export const textArea = defineOpenuiComponent(
  'TextArea',
  z.object({ name: z.string(), placeholder: z.string().optional(), rows: z.number().optional(), rules: rulesSchema, value: bound(z.string().optional()) }),
  '',
);

export const selectItem = defineOpenuiComponent('SelectItem', z.object({ value: z.string(), label: z.string() }), 'Option for Select');

export const select = defineOpenuiComponent(
  'Select',
  z.object({
    name: z.string(),
    items: z.array(selectItem.ref),
    placeholder: z.string().optional(),
    rules: rulesSchema,
    value: bound(z.string().optional()),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }),
  '',
);

export const datePicker = defineOpenuiComponent(
  'DatePicker',
  z.object({ name: z.string(), mode: z.enum(['single', 'range']).optional(), rules: rulesSchema, value: bound(z.unknown().optional()) }),
  '',
);

export const slider = defineOpenuiComponent(
  'Slider',
  z.object({
    name: z.string(),
    variant: z.enum(['continuous', 'discrete']),
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    defaultValue: z.array(z.number()).optional(),
    label: z.string().optional(),
    rules: rulesSchema,
    value: bound(z.array(z.number()).optional()),
  }),
  'Numeric slider input; supports continuous and discrete (stepped) variants',
);

export const checkBoxItem = defineOpenuiComponent(
  'CheckBoxItem',
  z.object({ label: z.string(), description: z.string(), name: z.string(), defaultChecked: z.boolean().optional() }),
  '',
);

export const checkBoxGroup = defineOpenuiComponent(
  'CheckBoxGroup',
  z.object({ name: z.string(), items: z.array(checkBoxItem.ref), rules: rulesSchema, value: bound(z.record(z.string(), z.boolean()).optional()) }),
  '',
);

export const radioItem = defineOpenuiComponent('RadioItem', z.object({ label: z.string(), description: z.string(), value: z.string() }), '');

export const radioGroup = defineOpenuiComponent(
  'RadioGroup',
  z.object({ name: z.string(), items: z.array(radioItem.ref), defaultValue: z.string().optional(), rules: rulesSchema, value: bound(z.string().optional()) }),
  '',
);

export const switchItem = defineOpenuiComponent(
  'SwitchItem',
  z.object({ label: z.string().optional(), description: z.string().optional(), name: z.string(), defaultChecked: z.boolean().optional() }),
  'Individual switch toggle',
);

export const switchGroup = defineOpenuiComponent(
  'SwitchGroup',
  z.object({ name: z.string(), items: z.array(switchItem.ref), variant: z.enum(['clear', 'card', 'sunk']).optional(), value: bound(z.record(z.string(), z.boolean()).optional()) }),
  'Group of switch toggles',
);

export const chipItem = defineOpenuiComponent(
  'ChipItem',
  z.object({ value: z.string(), label: z.string(), icon: z.optional(icon.ref), disabled: z.boolean().optional() }),
  'A single selectable chip inside a Chips group, with a value, label and optional icon.',
);

export const chips = defineOpenuiComponent(
  'Chips',
  z.object({
    name: z.string(),
    type: z.enum(['single', 'multiple']).default('multiple'),
    items: z.array(chipItem.ref).default([]),
    rules: rulesSchema,
    defaultValue: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  'A form field of compact selectable chips for choosing one or many short options; the selection is stored under `name`.',
);

export const optionCard = defineOpenuiComponent(
  'OptionCard',
  z.object({ value: z.string(), title: z.string(), subtitle: z.string().optional(), topContent: z.union([icon.ref, image.ref]).optional(), disabled: z.boolean().optional() }),
  'A single selectable card inside an OptionCards group, with a value, title, optional subtitle and an optional Icon or Image on top.',
);

export const optionCards = defineOpenuiComponent(
  'OptionCards',
  z.object({
    name: z.string(),
    type: z.enum(['single', 'multiple']).default('single'),
    items: z.array(optionCard.ref).default([]),
    rules: rulesSchema,
    defaultValue: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  'A form field of selectable cards (title, optional subtitle, optional icon or image) laid out in a responsive grid for choosing one or many options; the selection is stored under `name`.',
);

export const formControl = defineOpenuiComponent(
  'FormControl',
  z.object({
    label: z.string(),
    input: z.union([input.ref, textArea.ref, select.ref, datePicker.ref, slider.ref, checkBoxGroup.ref, radioGroup.ref, chips.ref, optionCards.ref]),
    hint: z.string().optional(),
  }),
  'Field with label, input component, and optional hint text',
);

export const form = defineOpenuiComponent(
  'Form',
  z.object({ name: z.string(), buttons: buttons.ref, fields: z.array(formControl.ref).default([]) }),
  'Form container with fields and explicit action buttons',
);

export type RulesProps = z.infer<typeof rulesSchema>;
export type LabelProps = z.infer<typeof label.props>;
export type InputProps = z.infer<typeof input.props>;
export type TextAreaProps = z.infer<typeof textArea.props>;
export type SelectProps = z.infer<typeof select.props>;
export type DatePickerProps = z.infer<typeof datePicker.props>;
export type SliderProps = z.infer<typeof slider.props>;
export type CheckBoxGroupProps = z.infer<typeof checkBoxGroup.props>;
export type RadioGroupProps = z.infer<typeof radioGroup.props>;
export type SwitchGroupProps = z.infer<typeof switchGroup.props>;
export type ChipsProps = z.infer<typeof chips.props>;
export type OptionCardsProps = z.infer<typeof optionCards.props>;
export type FormControlProps = z.infer<typeof formControl.props>;
export type FormProps = z.infer<typeof form.props>;
