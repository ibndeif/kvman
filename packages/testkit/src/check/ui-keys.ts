// The translation keys a `<namespace>.ui.get` answer uses (plan 06 §6.3–6.4): page, nav, and panel titles, status
// texts, and every text of a view tree (headings, texts, translated Markdown, card titles, columns and their badges,
// empty texts, buttons and their confirms, links, form submits, and toasts).

type JsonObject = { [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function strings(object: JsonObject, fields: readonly string[]): string[] {
  return fields.flatMap((field) => {
    const value = object[field];
    return typeof value === 'string' ? [value] : [];
  });
}

const textFields: Readonly<Record<string, readonly string[]>> = {
  heading: ['text'],
  text: ['text'],
  markdown: ['text'],
  card: ['title'],
  link: ['text'],
  button: ['text', 'confirm'],
  form: ['submit'],
  table: ['empty'],
  list: ['empty'],
};

function columnKeys(columns: unknown): string[] {
  return objects(columns).flatMap((column) => [...strings(column, ['title']), ...(isObject(column['badges']) ? Object.values(column['badges']).filter(isObject).flatMap((badge) => strings(badge, ['text'])) : [])]);
}

function thenKeys(then: unknown): string[] {
  return isObject(then) ? strings(then, ['toast']) : [];
}

export function viewKeys(view: unknown): string[] {
  if (!isObject(view)) return [];
  const type = typeof view['type'] === 'string' ? view['type'] : '';
  return [
    ...strings(view, textFields[type] ?? []),
    ...thenKeys(view['then']),
    ...columnKeys(view['columns']),
    ...columnKeys(view['fields']),
    ...objects(view['rowActions']).flatMap(viewKeys),
    ...objects(view['children']).flatMap(viewKeys),
    ...viewKeys(view['item']),
  ];
}

export function uiKeys(answer: unknown): string[] {
  if (!isObject(answer)) return [];
  return [
    ...objects(answer['pages']).flatMap((page) => [...strings(page, ['title']), ...viewKeys(page['view'])]),
    ...objects(answer['nav']).flatMap((item) => strings(item, ['title'])),
    ...objects(answer['panels']).flatMap((panel) => [...strings(panel, ['title']), ...viewKeys(panel['view'])]),
    ...objects(answer['status']).flatMap((item) => strings(item, ['text'])),
    ...viewKeys(answer['configuration']),
  ];
}
