import { NextResponse } from "next/server";
import { availableTranslations } from "@/lib/bible-source";

// GET — which Bibles can actually serve text right now. Availability is a server
// fact (the api.bible lane needs env keys), so the switcher asks rather than
// guessing; the list is tiny and joins the offline read allowlist so the picker
// still renders in a basement.

export async function GET() {
  try {
    const translations = availableTranslations().map((t) => ({
      id: t.id,
      label: t.label,
      name: t.name,
      lang: t.lang,
    }));
    return NextResponse.json({ translations });
  } catch (error) {
    console.error("Spirit translations error:", error);
    return NextResponse.json({ error: "Failed to list translations" }, { status: 500 });
  }
}
