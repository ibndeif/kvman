import {
  isArgumentElement, isDateElement, isNumberElement, isPluralElement, isSelectElement, isTimeElement, parse, type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';

export type ParsedMessage = { ok: true; parameters: ReadonlySet<string> } | { ok: false; reason: string };

function collect(elements: readonly MessageFormatElement[], into: Set<string>): void {
  for (const element of elements) {
    if (isArgumentElement(element) || isNumberElement(element) || isDateElement(element) || isTimeElement(element)) {
      into.add(element.value);
    } else if (isSelectElement(element) || isPluralElement(element)) {
      into.add(element.value);
      for (const option of Object.values(element.options)) collect(option.value, into);
    }
  }
}

// 08 §8.16, ADR 0160: a catalog message is ICU MessageFormat read with tags as text, since output is plain text. Its
// parameters are the arguments it names, those inside plural and select cases too; `#` is the plural's own value.
export function parseMessage(message: string): ParsedMessage {
  let elements: MessageFormatElement[];
  try {
    elements = parse(message, { ignoreTag: true });
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, reason: error.message };
    throw error;
  }
  const parameters = new Set<string>();
  collect(elements, parameters);
  return { ok: true, parameters };
}
