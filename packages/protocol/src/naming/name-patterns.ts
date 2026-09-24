export const segmentSource = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';

function namespaceBefore(separator: string): string {
  return `(?=[a-z0-9-]{2,32}${separator})${segmentSource}`;
}

export const typeNameSource = `${namespaceBefore('\\.')}(?:\\.${segmentSource})+`;

export const typePatternSource = `${namespaceBefore('\\.')}(?:(?:\\.${segmentSource})+|(?:\\.${segmentSource})*\\.\\*)`;

export const segmentPattern = new RegExp(`^${segmentSource}$`);

export const typeNamePattern = new RegExp(`^${typeNameSource}$`);

export const typePatternPattern = new RegExp(`^${typePatternSource}$`);

export const liveAddressPattern = new RegExp(`^${typeNameSource}:.+$`);

const upperSnake = '[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*';

export const errorCodePattern = new RegExp(`^${namespaceBefore('/')}/${upperSnake}$`);

export const problemCodePattern = new RegExp(`^(?:${namespaceBefore('/')}/)?${upperSnake}$`);
