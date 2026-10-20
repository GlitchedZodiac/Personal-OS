import { NextResponse } from "next/server";
import { MissingSecretError } from "@/lib/security";

/** A missing or refused signing secret, answered as a 503 that names the variable — never an unnamed 500. */
export function secretErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof MissingSecretError)) return null;
  console.error(`[auth] ${error.message}`);
  return NextResponse.json({ error: error.message, missing: [error.variable] }, { status: 503 });
}
