const titleLimit = 60;
const commandLimit = 200;

/** What a call is called for the person: its title, or the start of its description when it has none (ADR 0009, 186 and 195). */
export function callTitle(title: string | undefined, description: string | undefined): string | undefined {
  if (title !== undefined && title.trim() !== '') return title;
  const text = description?.trim() ?? '';
  if (text === '') return undefined;
  return text.length > titleLimit ? `${text.slice(0, titleLimit)}…` : text;
}

/** A command cut to the length a card's row shows (ADR 0009, 195). */
export function shortCommand(command: string): string {
  return command.length > commandLimit ? `${command.slice(0, commandLimit)}…` : command;
}
