import { NextRequest, NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_AUTOMATION_RULES,
  evaluateRule,
  normalizeAutomationRules,
  type AutomationRule,
} from "@/lib/automation";
import { estimateFluidMlFromFoodLogs } from "@/lib/hydration";
import { getUtcDayBounds, parseLocalDate } from "@/lib/utils";

type SettingsData = Record<string, unknown>;

function toLocalDateTimeUtc(
  dateStr: string,
  hour: number,
  minute: number,
  tzOffsetMinutes: number
) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcMillis =
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) +
    tzOffsetMinutes * 60_000;
  return new Date(utcMillis);
}

async function getSettingsData() {
  const row = await prisma.userSettings.findUnique({
    where: { id: "default" },
    select: { data: true },
  });
  return (row?.data as SettingsData | null) ?? null;
}

async function saveRules(rules: AutomationRule[]) {
  const existing = await getSettingsData();
  const nextData: SettingsData = {
    ...(existing ?? {}),
    automationRules: rules,
  };
  await prisma.userSettings.upsert({
    where: { id: "default" },
    create: { id: "default", data: nextData as Prisma.InputJsonValue },
    update: { data: nextData as Prisma.InputJsonValue },
  });
}

export async function GET() {
  try {
    const data = await getSettingsData();
    const rules = normalizeAutomationRules(data?.automationRules);
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Automation settings fetch error:", error);
    return NextResponse.json({ rules: DEFAULT_AUTOMATION_RULES });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const rules = normalizeAutomationRules(body?.rules);
    await saveRules(rules);
    return NextResponse.json({ success: true, rules });
  } catch (error) {
    console.error("Automation settings save error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save automation rules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const dateStr =
      typeof body?.date === "string" && body.date.length > 0
        ? body.date
        : new Date().toISOString().slice(0, 10);
    const localHour =
      typeof body?.localHour === "number" && Number.isFinite(body.localHour)
        ? Math.round(body.localHour)
        : new Date().getHours();
    const tzOffsetMinutes =
      typeof body?.tzOffsetMinutes === "number" &&
      Number.isFinite(body.tzOffsetMinutes)
        ? body.tzOffsetMinutes
        : new Date().getTimezoneOffset();

    const parsedOffset = Number(tzOffsetMinutes);
    const { dayStart, dayEnd } =
      Number.isFinite(parsedOffset)
        ? getUtcDayBounds(dateStr, parsedOffset)
        : {
            dayStart: startOfDay(parseLocalDate(dateStr)),
            dayEnd: endOfDay(parseLocalDate(dateStr)),
          };

    const [settingsData, foodAgg, foods, waterAgg, workoutAgg] = await Promise.all([
      getSettingsData(),
      prisma.foodLog.aggregate({
        where: { loggedAt: { gte: dayStart, lte: dayEnd } },
        _sum: { proteinG: true },
      }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: dayStart, lte: dayEnd } },
        select: { foodDescription: true, notes: true },
      }),
      prisma.waterLog.aggregate({
        where: { loggedAt: { gte: dayStart, lte: dayEnd } },
        _sum: { amountMl: true },
      }),
      prisma.workoutLog.aggregate({
        where: { startedAt: { gte: dayStart, lte: dayEnd } },
        _sum: { durationMinutes: true },
      }),
    ]);

    const rules = normalizeAutomationRules(settingsData?.automationRules);
    const calorieTarget = Number(settingsData?.calorieTarget ?? 2000);
    const proteinPct = Number(settingsData?.proteinPct ?? 30);
    const proteinTarget = Math.round((calorieTarget * proteinPct) / 100 / 4);
    const proteinPctValue =
      proteinTarget > 0
        ? ((foodAgg._sum.proteinG ?? 0) / proteinTarget) * 100
        : 0;

    const workoutMinutes = workoutAgg._sum.durationMinutes ?? 0;
    const workoutAdjustmentMl = Math.round((workoutMinutes / 30) * 350);
    const hydrationTargetMl = 2500 + workoutAdjustmentMl;
    const hydrationMl =
      (waterAgg._sum.amountMl ?? 0) + estimateFluidMlFromFoodLogs(foods);
    const hydrationPctValue =
      hydrationTargetMl > 0 ? (hydrationMl / hydrationTargetMl) * 100 : 0;

    const metricValues = {
      proteinPct: proteinPctValue,
      hydrationPct: hydrationPctValue,
      workoutMinutes: workoutMinutes,
    };

    const triggered: Array<{
      ruleId: string;
      ruleName: string;
      metric: string;
      value: number;
      threshold: number;
      actionType: string;
      actionTitle: string;
      created: boolean;
    }> = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (localHour < rule.triggerHour) continue;

      const value = metricValues[rule.metric];
      const matches = evaluateRule(value, rule.comparator, rule.threshold);
      if (!matches) continue;

      const marker = `AUTO_RULE:${rule.id}:${dateStr}`;
      let created = false;

      if (!dryRun) {
        if (rule.actionType === "todo") {
          const existingTodo = await prisma.todo.findFirst({
            where: { notes: { contains: marker } },
          });
          if (!existingTodo) {
            const dueDate = toLocalDateTimeUtc(
              dateStr,
              Math.min(23, rule.triggerHour + 1),
              0,
              parsedOffset
            );
            await prisma.todo.create({
              data: {
                title: rule.actionTitle,
                dueDate,
                category: "automation",
                priority: "normal",
                notes: marker,
              },
            });
            created = true;
          }
        } else {
          const existingReminder = await prisma.reminder.findFirst({
            where: { body: { contains: marker } },
          });
          if (!existingReminder) {
            const remindAt = toLocalDateTimeUtc(
              dateStr,
              Math.min(23, rule.triggerHour + 1),
              0,
              parsedOffset
            );
            await prisma.reminder.create({
              data: {
                title: rule.actionTitle,
                body: marker,
                remindAt,
                url: "/health/automations",
              },
            });
            created = true;
          }
        }
      }

      triggered.push({
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        value: Math.round(value),
        threshold: rule.threshold,
        actionType: rule.actionType,
        actionTitle: rule.actionTitle,
        created,
      });
    }

    return NextResponse.json({
      dryRun,
      evaluatedRules: rules.length,
      triggered,
      metricSnapshot: {
        proteinPct: Math.round(metricValues.proteinPct),
        hydrationPct: Math.round(metricValues.hydrationPct),
        workoutMinutes: metricValues.workoutMinutes,
      },
    });
  } catch (error) {
    console.error("Automation run error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate automation rules" },
      { status: 500 }
    );
  }
}
