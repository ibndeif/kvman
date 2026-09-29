import { defineExtension, type ExtensionDefinition } from '@kvman/sdk';

/** The name of the extension `k.command` and `k.query` send as (ADR 0165). */
export const driverName = '@kvman/testkit-driver';

/** The testkit's driver: no handlers, and `calls` for the given type patterns only. */
export function driverExtension(types: string[]): ExtensionDefinition {
  return defineExtension(
    { name: driverName, namespace: 'testkit', title: 'Testkit driver', description: 'Sends the commands and queries of a test as an extension.' },
    (ext) => {
      if (types.length > 0) ext.requestCapability('calls', { reason: 'Calls the extensions under test.', types });
    },
  );
}
