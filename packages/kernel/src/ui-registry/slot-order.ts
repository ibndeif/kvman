import type { JsonObject } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import { compareText } from './registry-sources.ts';
import type { Placed } from './slot-items.ts';

// 08 §8.4: `order` (default 500), then the owner, then the id.
function byDefaultOrder(left: Placed, right: Placed): number {
  return left.order - right.order || compareText(left.owner, right.owner) || compareText(left.id, right.id);
}

function separator(number: number): Placed {
  const id = `---${number}`;
  return { slot: 'frame.sidebar', order: 0, id, owner: 'preset', kind: 'separator', item: { id, owner: 'preset', kind: 'separator', def: {} } };
}

// A preset's `layout.order` puts the ids it lists first, in its order, and the rest follow in default order;
// `"---"` is a separator in the sidebar only (ADR 0159).
function arranged(sorted: readonly Placed[], order: readonly string[] | undefined, separators: boolean): Placed[] {
  const byId = new Map(sorted.map((placed) => [placed.id, placed]));
  const listed: Placed[] = [];
  let count = 0;
  for (const id of order ?? []) {
    const found = byId.get(id);
    if (id === '---' && separators) listed.push(separator(++count));
    else if (found !== undefined && !listed.includes(found)) listed.push(found);
  }
  return [...listed, ...sorted.filter((placed) => !listed.includes(placed))];
}

export function slotItems(placed: readonly Placed[], order: readonly string[] | undefined): JsonObject[] {
  return arranged([...placed].sort(byDefaultOrder), order, false).map((entry) => entry.item);
}

function groupOf(placed: Placed): string | undefined {
  return stringAt(objectOf(placed.item['def']), 'group');
}

// A nav item whose group is hidden, missing, or not active is a top-level entry without `group` (08 §8.4).
function ungrouped(placed: Placed): Placed {
  const def = objectOf(placed.item['def']) ?? {};
  if (def['group'] === undefined) return placed;
  const rest = Object.fromEntries(Object.entries(def).filter(([key]) => key !== 'group'));
  return { ...placed, item: { ...placed.item, def: rest } };
}

// ADR 0159: the sidebar is flat; top-level entries (groups, items without a group, separators) in order, each group
// followed at once by its own items in default order.
export function sidebarItems(placed: readonly Placed[], order: readonly string[] | undefined): JsonObject[] {
  const groups = placed.filter((entry) => entry.kind === 'navGroup');
  const groupIds = new Set(groups.map((group) => group.id));
  const items = placed.filter((entry) => entry.kind === 'navItem');
  const grouped = items.filter((item) => groupIds.has(groupOf(item) ?? ''));
  const top = [...groups, ...items.filter((item) => !groupIds.has(groupOf(item) ?? '')).map(ungrouped)].sort(byDefaultOrder);
  return arranged(top, order, true).flatMap((entry) => [
    entry.item,
    ...(entry.kind === 'navGroup' ? grouped.filter((item) => groupOf(item) === entry.id).sort(byDefaultOrder).map((item) => item.item) : []),
  ]);
}
