import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  getConfiguredPin,
  isPinConfigured,
  setAuthCookie,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    if (!isPinConfigured()) {
      return NextResponse.json(
        { error: "APP_PIN is not configured. Set APP_PIN before updating it." },
        { status: 503 }
      );
    }

    const rateLimit = checkRateLimit(request, "auth-update-pin");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const { currentPin, newPin } = await request.json();
    const correctPin = getConfiguredPin();

    if (currentPin !== correctPin) {
      rateLimit.registerFailure();
      return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });
    }

    if (!newPin || !/^\d{4,8}$/.test(newPin)) {
      return NextResponse.json({ error: "New PIN must be 4 to 8 digits" }, { status: 400 });
    }

    try {
      const envPath = join(process.cwd(), ".env.local");
      let envContent = "";

      try {
        envContent = await readFile(envPath, "utf-8");
      } catch {
        envContent = "";
      }

      if (envContent.includes("APP_PIN=")) {
        envContent = envContent.replace(/APP_PIN=.*/, `APP_PIN=${newPin}`);
      } else {
        envContent += `${envContent.endsWith("\n") || envContent.length === 0 ? "" : "\n"}APP_PIN=${newPin}\n`;
      }

      await writeFile(envPath, envContent, "utf-8");
      process.env.APP_PIN = newPin;
    } catch (writeError) {
      console.error("Failed to write .env.local:", writeError);
      process.env.APP_PIN = newPin;
    }

    const response = NextResponse.json({ success: true });
    setAuthCookie(response);
    rateLimit.reset();
    return response;
  } catch (error) {
    console.error("Update PIN error:", error);
    return NextResponse.json({ error: "Failed to update PIN" }, { status: 500 });
  }
}
