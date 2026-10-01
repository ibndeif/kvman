/** One thing `kvman-check` found (ADR 0009, 116): `file` is relative to the project, with `:line:col` when it has one. */
export type Finding = { file?: string; message: string; hint: string };

/** A finding and whether it's only a warning, which doesn't fail the check. */
export type CheckedFinding = Finding & { warning: boolean };
