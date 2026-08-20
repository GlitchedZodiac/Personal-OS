import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Web push for the installed PWA.
//
// iOS only delivers push to a PWA added to the home screen (16.4+), and
// only after the user grants permission from a real tap — so the
// subscribe call lives behind a button in Settings, never on load.
//
// One rule for anything sent from here: a notification is a REMINDER of
// something he chose, never a summons to open the app. Today that means
// exactly one sender — the homework he is already carrying.

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping it lands. */
  url?: string;
  tag?: string;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function publicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function configure() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:michael@blacksheepglobal.net",
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

/**
 * Send to every registered install. Dead endpoints (404/410) are pruned
 * on the spot — a reinstalled PWA mints a new subscription, and keeping
 * the corpse would fail every future send.
 */
export async function sendPush(payload: PushPayload): Promise<{
  sent: number;
  pruned: number;
  failed: number;
}> {
  if (!pushConfigured()) return { sent: 0, pruned: 0, failed: 0 };
  configure();

  const subs = await prisma.pushSubscription.findMany();
  let sent = 0;
  let pruned = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
          pruned += 1;
        } else {
          console.error("Push send failed:", status, (error as Error)?.message);
          failed += 1;
        }
      }
    }),
  );

  return { sent, pruned, failed };
}
