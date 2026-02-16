import { NextRequest, NextResponse } from "next/server";

// POST - Verify PIN
export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();
    const correctPin = process.env.APP_PIN || "1234";

    if (pin === correctPin) {
      // Set a simple cookie for auth
      const response = NextResponse.json({ success: true });
      response.cookies.set("auth", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

// GET - Check auth status
export async function GET(request: NextRequest) {
  const auth = request.cookies.get("auth");
  if (auth?.value === "authenticated") {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

// DELETE - Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("auth");
  return response;
}
