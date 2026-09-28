import type { Action, Condition, Effect, FormOverrides, Json, PageQuery, Text, ViewNode } from '@kvman/protocol';
import type { ZodType } from 'zod';

/** A page on a route, rendered in the frame's main area. */
export interface PageDef {
  description: string;
  route: string;
  title: Text;
  icon?: string;
  params?: ZodType | Record<string, 'string' | 'number' | 'boolean'>;
  state?: Record<string, Json>;
  queries?: Record<string, PageQuery>;
  view: ViewNode;
}

/** A group in the sidebar. */
export interface NavGroupDef {
  description: string;
  label: Text;
  icon?: string;
  order?: number;
}

/** A sidebar item that opens a page. */
export interface NavItemDef {
  description: string;
  page: string;
  label: Text;
  icon: string;
  group?: string;
  order?: number;
  badge?: { query: string; payload?: Record<string, Json>; field: string; refreshOn?: string[] };
}

/** A button, menu, or badge in a top bar or an extension slot. */
export interface ToolbarItemDef {
  description: string;
  slot: string;
  as: 'button' | 'menu' | 'badge';
  label: Text;
  icon?: string;
  order?: number;
  queries?: Record<string, PageQuery>;
  visibleIf?: Condition;
  action?: Action;
  items?: Array<{ label: Text; icon?: string; action: Action }>;
  badge?: { query: string; payload?: Record<string, Json>; field: string; refreshOn?: string[] };
}

/** An item in the status bar, usually with a visibility condition. */
export interface StatusItemDef {
  description: string;
  side?: 'start' | 'end';
  label: Text;
  icon?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  order?: number;
  queries?: Record<string, PageQuery>;
  visibleIf?: Condition;
  action?: Action;
}

/** A panel in the overlay or an extension slot, shown when its query says so. */
export interface PanelDef {
  description: string;
  slot: string;
  title?: Text;
  order?: number;
  queries?: Record<string, PageQuery>;
  visibleIf?: Condition;
  view: ViewNode;
}

/** A named place in an owner's views that accepts panels or toolbar items. */
export interface SlotDef {
  description: string;
  accepts: Array<'panel' | 'toolbarItem'>;
  props?: ZodType;
  layout?: 'stack' | 'row' | 'tabs';
  max?: number;
}

/** An action on an entity type, run from its row menu, detail header, or palette. */
export type ActionDef = {
  description: string;
  entity: string;
  label: Text;
  icon?: string;
  visibleIf?: Condition;
  placement?: Array<'row' | 'detail' | 'palette'>;
} & (
  | { command: string; payload?: Json; form?: boolean | FormOverrides; confirm?: { title: Text; body?: Text }; then?: Effect[] }
  | { navigate: string; pane?: 'main' | 'side' }
  | { openDialog: { title: Text; view: ViewNode } }
);

/** A renderer target an owner's pages declare for entries, entities, or MIME types. */
export interface RendererTargetDef {
  description: string;
  item: ZodType;
}

/** A renderer for a target, entity, or MIME type. */
export interface RendererDef {
  description: string;
  target: string;
  view?: ViewNode;
  component?: string;
  props?: Record<string, Json>;
}

/** A composite component: a named view tree rendered natively by the shell. */
export interface CompositeDef {
  description: string;
  props: ZodType;
  view: ViewNode;
  children?: 'none' | 'any' | string[];
  visibility?: 'private' | 'public';
  examples?: Json[];
}

/** A widget component: sandboxed iframe code for what the library cannot express. */
export interface WidgetDef {
  description: string;
  props: ZodType;
  widget: string;
  visibility?: 'private' | 'public';
}

/** A custom view for the extension's settings section, replacing the generated form. */
export interface SettingsSectionDef {
  description: string;
  view: ViewNode;
}
