import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicKey, pushConfigured, sendPush } from "@/lib/push";

// The PWA's push registration.
//
// GET    — is push configured, is this install registered, and the
//          VAPID public key the browser needs to subscribe.
// POST   — register (or refresh) this install's endpoint.
// DELETE — unregister it.
// POST ?test=1 — fire one notification to every install, so he can see
//          it work rather than wait until evening to find out it didn't.

export async function GET(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  const existing = endpoint
    ? await prisma.pushSubscription.findUnique({ where: { endpoint } })
    : null;
  const count = await prisma.pushSubscription.count();
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: publicKey(),
    registered: Boolean(existing),
    installs: count,
  });
}

export async function POST(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("test") === "1") {
      const result = await sendPush({
        title: "Pitaya · notifications are on",
        body: "This is the only kind of thing you'll get: a reminder of something you chose.",
        url: "/spirit",
        tag: "pitaya-test",
      });
      return NextResponse.json(result);
    }

    const body = (await request.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      label?: string;
    };
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "endpoint and keys required" }, { status: 400 });
    }

    const row = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, label: body.label ?? null },
      update: { p256dh, auth, label: body.label ?? undefined },
    });
    return NextResponse.json({ id: row.id, registered: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ deleted: true });
}
