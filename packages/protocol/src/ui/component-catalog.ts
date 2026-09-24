import { actionComponents } from './components-actions.ts';
import { dataComponents } from './components-data.ts';
import { displayComponents } from './components-display.ts';
import { inputComponents } from './components-input.ts';
import { layoutComponents } from './components-layout.ts';
import type { ComponentSpec } from './component-spec.ts';

export const builtinComponentSpecs: readonly ComponentSpec[] = [
  ...layoutComponents, ...displayComponents, ...dataComponents, ...inputComponents, ...actionComponents,
];

export const builtinComponents: ReadonlyMap<string, ComponentSpec> = new Map(builtinComponentSpecs.map((spec) => [spec.name, spec]));
