import { slashCommands } from "../constants/commands.js";

export function fuzzyMatchCommand(input: string): string {
  const lower = input.toLowerCase();
  for (const s of slashCommands) {
    if (s.toLowerCase() === lower) return s;
  }
  const matches = slashCommands.filter((s) =>
    s.toLowerCase().startsWith(lower),
  );
  if (matches.length === 0) return input;
  const hasSub = matches.some((m) => m.includes(" "));
  let best = "";
  for (const m of matches) {
    if (hasSub && !m.includes(" ")) continue;
    if (!best || m.length < best.length) best = m;
  }
  return best || input;
}

export function completeSlashCommand(line: string): [string[], string] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return [[], line];
  const lower = trimmed.toLowerCase();
  const hits =
    lower === "/"
      ? [...slashCommands]
      : slashCommands.filter((s) => s.toLowerCase().startsWith(lower));
  return [hits, line];
}