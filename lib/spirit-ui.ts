// Shared Spirit UI constants — the prescribed study system
// (docs/spirit-journal-plan.md §8). Six categories, fixed; five note
// kinds; three link reasons. These are product decisions, not config.

export const HIGHLIGHT_CATEGORIES = [
  { name: "God", short: "God", color: "#D9A23E" },
  { name: "Promise & Covenant", short: "Promise", color: "#4C7DBF" },
  { name: "Command", short: "Command", color: "#3E7A54" },
  { name: "Sin & Consequence", short: "Sin", color: "#B4533F" },
  { name: "Christ", short: "Christ", color: "#7B5EA7" },
  { name: "Context", short: "Context", color: "#4E7C8A" },
] as const;

export const categoryColor = (name: string) =>
  HIGHLIGHT_CATEGORIES.find((c) => c.name === name)?.color ?? "#96949B";

export const NOTE_KINDS = [
  "Observation",
  "Question",
  "Connection",
  "Conviction",
  "Doctrine",
] as const;

export const LINK_REASONS = ["Fulfills", "Parallels", "Tension"] as const;
