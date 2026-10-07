import { extensionInfoSchema, presetStateSchema, z, type Ctx } from '@kvman/sdk';
import { guideListSchema, listGuides } from '../docs/guides.ts';

type Extension = z.output<typeof extensionInfoSchema>;
type Preset = z.output<typeof presetStateSchema>;
type Guides = z.output<typeof guideListSchema>;

const lastLine = 'This is what ran when /build-kvman was typed. `kvman extensions-list` and `docs list` are current.';
const maximumBytes = 16 * 1024;
const alphabetical = (left: string, right: string): number => left.localeCompare(right);

function extensionBlock(extension: Extension, guides: Guides): string {
  const lines = [`- ${extension.name} (${extension.namespace}), ${extension.source}, ${extension.version}`];
  const settings = extension.settings.map((setting) => setting.key).sort(alphabetical);
  const commands = extension.commands.filter((command) => command.public).map((command) => command.name).sort(alphabetical);
  const queries = extension.queries.filter((query) => query.public).map((query) => query.name).sort(alphabetical);
  if (settings.length > 0) lines.push(`  settings: ${settings.join(', ')}`);
  if (commands.length > 0) lines.push(`  public commands: ${commands.join(', ')}`);
  if (queries.length > 0) lines.push(`  public queries: ${queries.join(', ')}`);
  const failed = guides.problems.some((problem) => problem.extension === extension.name);
  const pages = failed ? [] : guides.pages.filter((page) => page.extension === extension.name).sort((left, right) => alphabetical(left.topic, right.topic));
  lines.push(`  pages: ${pages.length === 0 ? 'none' : pages.map((page) => `${page.topic} (${page.title})`).join(', ')}`);
  return lines.join('\n');
}

/** A snapshot of the installed extensions and their pages, limited to a whole-block 16 KB section. */
export function installedIndex(preset: Preset, extensions: readonly Extension[], guides: Guides): string {
  const header = `Preset: ${preset.name} (${preset.origin})`;
  const blocks = extensions.toSorted((left, right) => alphabetical(left.name, right.name)).map((extension) => extensionBlock(extension, guides));
  let included = blocks.length;
  const text = (): string => [header, ...blocks.slice(0, included), `${lastLine}${included === blocks.length ? '' : ` ${String(blocks.length - included)} more extensions aren't listed here.`}`].join('\n');
  while (Buffer.byteLength(text(), 'utf8') > maximumBytes && included > 0) included -= 1;
  return text();
}

/** Reads the snapshot at the time /build-kvman runs. */
export async function readInstalledIndex(ctx: Ctx): Promise<string> {
  const preset = await ctx.exec('kernel.preset.get', {});
  const extensions = await ctx.exec('kernel.extensions.list', {});
  const guides = await listGuides(ctx);
  return installedIndex(preset, extensions, guides);
}
