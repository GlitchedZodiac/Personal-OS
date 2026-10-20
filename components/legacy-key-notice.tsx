"use client";

// "N sessions still on the old key" (audit 2026-10, review of 3a). Until this
// reaches zero, devices still sign in through a key derived from APP_PIN, so
// APP_PIN must not be removed or changed in Vercel. Self-contained on
// purpose — Settings is being restyled by another lane; this drops in as one
// line and renders nothing once everything has moved over.

import { useEffect, useState } from "react";

export function LegacyKeyNotice() {
  const [counts, setCounts] = useState<{ sessions: number; pin: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/health/devices")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setCounts({ sessions: Number(body.legacyKeySessions ?? 0), pin: Boolean(body.pinOnLegacyKey) });
      })
      .catch(() => {});
  }, []);

  if (!counts || (counts.sessions === 0 && !counts.pin)) return null;
  const parts = [
    counts.sessions > 0 ? `${counts.sessions} device ${counts.sessions === 1 ? "session is" : "sessions are"}` : null,
    counts.pin ? "your stored PIN is" : null,
  ].filter(Boolean);

  return (
    <div role="status" className="mt-3 rounded-[12px] bg-card p-3 text-[12px] leading-[1.6] text-muted-foreground">
      <span className="font-semibold text-foreground">{parts.join(" and ")} still on the old key.</span>{" "}
      They move over by themselves the next time they connect. Until this note is gone, do not remove or change
      APP_PIN in Vercel — it would sign them out.
    </div>
  );
}
