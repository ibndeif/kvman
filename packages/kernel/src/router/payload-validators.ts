import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { blobIdFormat, actionPropFormat, textPropFormat, type Issue, type Json, type JsonObject } from '@kvman/protocol';

function issuePath(instancePath: string): string {
  return ['payload', ...instancePath.split('/').slice(1)].join('.');
}

// The kernel's check of payloads against a type's JSON Schema from the manifest (03 §3.3 step 5, ADR 0056):
// draft 2020-12, unknown keywords treated as annotations, kvman formats known, compiled once per schema.
export class PayloadValidators {
  readonly #ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
  readonly #compiled = new WeakMap<JsonObject, ValidateFunction>();

  constructor() {
    for (const format of [blobIdFormat, textPropFormat, actionPropFormat]) this.#ajv.addFormat(format, true);
  }

  issues(schema: JsonObject, payload: Json): Issue[] {
    const validate = this.validatorFor(schema);
    if (validate(payload)) return [];
    return (validate.errors ?? []).map((error) => {
      const property = error.params['missingProperty'] ?? error.params['additionalProperty'];
      const named = typeof property === 'string' ? `/${property}` : '';
      return { path: issuePath(`${error.instancePath}${named}`), message: error.message ?? 'does not match the schema' };
    });
  }

  validatorFor(schema: JsonObject): ValidateFunction {
    const known = this.#compiled.get(schema);
    if (known !== undefined) return known;
    const compiled = this.#ajv.compile(schema);
    this.#compiled.set(schema, compiled);
    return compiled;
  }
}
