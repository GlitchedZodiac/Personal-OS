import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";

// POST - Update PIN
export async function POST(request: NextRequest) {
  try {
    const { currentPin, newPin } = await request.json();
    const correctPin = process.env.APP_PIN || "1234";

    // Verify current PIN
    if (currentPin !== correctPin) {
      return NextResponse.json(
        { error: "Current PIN is incorrect" },
        { status: 401 }
      );
    }

    // Validate new PIN
    if (!newPin || newPin.length < 4) {
      return NextResponse.json(
        { error: "New PIN must be at least 4 digits" },
        { status: 400 }
      );
    }

    // Update the .env.local file with the new PIN
    try {
      const envPath = join(process.cwd(), ".env.local");
      let envContent = "";
      try {
        envContent = await readFile(envPath, "utf-8");
      } catch {
        envContent = "";
      }

      // Replace or add APP_PIN
      if (envContent.includes("APP_PIN=")) {
        envContent = envContent.replace(
          /APP_PIN=.*/,
          `APP_PIN=${newPin}`
        );
      } else {
        envContent += `\nAPP_PIN=${newPin}`;
      }

      await writeFile(envPath, envContent, "utf-8");

      // Update the process.env for the current session
      process.env.APP_PIN = newPin;

      return NextResponse.json({ success: true });
    } catch (writeError) {
      console.error("Failed to write .env.local:", writeError);
      // Even if file write fails, update the runtime env
      process.env.APP_PIN = newPin;
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Update PIN error:", error);
    return NextResponse.json(
      { error: "Failed to update PIN" },
      { status: 500 }
    );
  }
}
