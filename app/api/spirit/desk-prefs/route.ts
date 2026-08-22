import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mergeDeskPrefs, type DeskPrefs } from "@/lib/desk-prefs";

// The desk's user-level prefs (11 — Settings): handedness, Bible defaults,
// pen defaults + palettes, recording consent, sermon header defaults, layouts.

export async function GET() {
  try {
    const row = await prisma.spiritPref.findUnique({ where: { id: "main" } });
    return NextResponse.json({ prefs: mergeDeskPrefs(row?.desk ?? null) });
  } catch (error) {
    console.error("Spirit desk prefs error:", error);
    return NextResponse.json({ error: "Failed to load prefs" }, { status: 500 });
  }
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export async function PATCH(request: NextRequest) {
  try {
    const patch = (await request.json()) as Record<string, unknown>;
    const row = await prisma.spiritPref.findUnique({ where: { id: "main" } });
    const current = mergeDeskPrefs(row?.desk ?? null) as unknown as Record<string, unknown>;
    const next = mergeDeskPrefs(deepMerge(current, patch)) as DeskPrefs;
    const saved = await prisma.spiritPref.upsert({
      where: { id: "main" },
      create: { id: "main", desk: JSON.parse(JSON.stringify(next)) },
      update: { desk: JSON.parse(JSON.stringify(next)) },
    });
    return NextResponse.json({ prefs: mergeDeskPrefs(saved.desk) });
  } catch (error) {
    console.error("Spirit desk prefs update error:", error);
    return NextResponse.json({ error: "Failed to save prefs" }, { status: 500 });
  }
}
