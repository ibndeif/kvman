// Where the run's preset came from (plan 01 §1.2, ADR 0010, 4): bundled with kvman, a person's
// `<home>/presets/` copy (which replaces a bundled preset of the same name), or the file `--preset` named.
export type PresetSource = { origin: 'bundled' } | { origin: 'home' | 'file'; file: string };
