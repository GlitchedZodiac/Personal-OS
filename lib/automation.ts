export type AutomationMetric = "proteinPct" | "hydrationPct" | "workoutMinutes";
export type AutomationComparator = "<" | ">" | "<=" | ">=";
export type AutomationActionType = "todo" | "reminder";

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  metric: AutomationMetric;
  comparator: AutomationComparator;
  threshold: number;
  triggerHour: number; // local 24h clock
  actionType: AutomationActionType;
  actionTitle: string;
}

export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "protein-check-7pm",
    name: "Protein check-in",
    enabled: true,
    metric: "proteinPct",
    comparator: "<",
    threshold: 70,
    triggerHour: 19,
    actionType: "todo",
    actionTitle: "Add a high-protein meal before bed",
  },
  {
    id: "hydration-check-5pm",
    name: "Hydration check-in",
    enabled: true,
    metric: "hydrationPct",
    comparator: "<",
    threshold: 65,
    triggerHour: 17,
    actionType: "reminder",
    actionTitle: "Finish hydration target for today",
  },
  {
    id: "workout-check-6pm",
    name: "Workout consistency check",
    enabled: true,
    metric: "workoutMinutes",
    comparator: "<",
    threshold: 20,
    triggerHour: 18,
    actionType: "todo",
    actionTitle: "Do a quick 20-minute workout session",
  },
];

function isMetric(value: unknown): value is AutomationMetric {
  return (
    value === "proteinPct" ||
    value === "hydrationPct" ||
    value === "workoutMinutes"
  );
}

function isComparator(value: unknown): value is AutomationComparator {
  return value === "<" || value === ">" || value === "<=" || value === ">=";
}

function isActionType(value: unknown): value is AutomationActionType {
  return value === "todo" || value === "reminder";
}

function clampHour(value: number) {
  if (!Number.isFinite(value)) return 18;
  return Math.min(23, Math.max(0, Math.round(value)));
}

function isRuleLike(value: unknown): value is Partial<AutomationRule> {
  return typeof value === "object" && value !== null;
}

export function normalizeAutomationRules(value: unknown): AutomationRule[] {
  if (!Array.isArray(value)) return DEFAULT_AUTOMATION_RULES;

  const normalized = value
    .filter(isRuleLike)
    .map((rule, index) => {
      const metric = isMetric(rule.metric) ? rule.metric : "proteinPct";
      const comparator = isComparator(rule.comparator) ? rule.comparator : "<";
      const actionType = isActionType(rule.actionType) ? rule.actionType : "todo";
      const threshold = Number(rule.threshold);
      const triggerHour = clampHour(Number(rule.triggerHour));
      const id =
        typeof rule.id === "string" && rule.id.trim().length > 0
          ? rule.id.trim()
          : `rule-${index + 1}`;
      const name =
        typeof rule.name === "string" && rule.name.trim().length > 0
          ? rule.name.trim()
          : `Rule ${index + 1}`;
      const actionTitle =
        typeof rule.actionTitle === "string" && rule.actionTitle.trim().length > 0
          ? rule.actionTitle.trim()
          : "Follow up on your health target";

      return {
        id,
        name,
        enabled: Boolean(rule.enabled),
        metric,
        comparator,
        threshold: Number.isFinite(threshold) ? threshold : 70,
        triggerHour,
        actionType,
        actionTitle,
      };
    });

  return normalized.length > 0 ? normalized : DEFAULT_AUTOMATION_RULES;
}

export function evaluateRule(
  value: number,
  comparator: AutomationComparator,
  threshold: number
) {
  if (comparator === "<") return value < threshold;
  if (comparator === "<=") return value <= threshold;
  if (comparator === ">") return value > threshold;
  return value >= threshold;
}
