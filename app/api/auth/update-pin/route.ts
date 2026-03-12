import { NextRequest, NextResponse } from "next/server";
import { updatePin } from "@/lib/pin-auth";

// POST - Update PIN
export async function POST(request: NextRequest) {
  try {
    const { currentPin, newPin } = await request.json();

    if (typeof newPin !== "string" || newPin.length < 4) {
      return NextResponse.json(
        { error: "New PIN must be at least 4 digits" },
        { status: 400 }
      );
    }

    const success = await updatePin(currentPin, newPin);
    if (!success) {
      return NextResponse.json(
        { error: "Current PIN is incorrect" },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update PIN error:", error);
    return NextResponse.json(
      { error: "Failed to update PIN" },
      { status: 500 }
    );
  }
}
