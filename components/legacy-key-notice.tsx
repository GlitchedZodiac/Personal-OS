"use client";

// "N sessions still on the old key" (audit 2026-10, reviews of 3a). Until this
// reaches zero, those devices sign in through a key made from APP_PIN, so
// APP_PIN must not be removed or changed in Vercel. Self-contained on purpose —
// Settings is being restyled by another lane; this drops in as one line and
// renders nothing once everything has moved over (or after 17 Jan 2027).

import { useEffect, useState } from "react";
import { toast } from "sonner";

export function LegacyKeyNotice() {
  const [counts, setCounts] = useState<{ sessions: number; pin: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/health/devices")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setCounts({ sessions: Number(body.legacyKeySessions ?? 0), pin: Boolean(body.pinOnLegacyKey) });
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const revokeUnused = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/health/devices/legacy", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      toast.success(`${body.revoked ?? 0} unused old session${body.revoked === 1 ? "" : "s"} revoked`);
      await load();
    } catch {
      toast.error("Couldn't revoke them — try again");
    } finally {
      setBusy(false);
    }
  };

  if (!counts || (counts.sessions === 0 && !counts.pin)) return null;
  const parts = [
    counts.sessions > 0 ? `${counts.sessions} device ${counts.sessions === 1 ? "session is" : "sessions are"}` : null,
    counts.pin ? "your stored PIN is" : null,
  ].filter(Boolean);

  return (
    <div role="status" className="mt-3 rounded-[12px] bg-card p-3 text-[12px] leading-[1.6] text-muted-foreground">
      <span className="font-semibold text-foreground">{parts.join(" and ")} still on the old key.</span>{" "}
      Each device moves over the next time it refreshes its sign-in — within about a month for a phone or
      watch in use. Until this note is gone, do not remove or change APP_PIN in Vercel: those devices would
      be signed out, would delete their sign-in, and putting APP_PIN back would not bring them back.
      {counts.sessions > 0 && (
        <button
          type="button"
          onClick={revokeUnused}
          disabled={busy}
          className="mt-2 block rounded-[8px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-foreground disabled:opacity-60"
        >
          {busy ? "…" : "Revoke unused old sessions (not seen in 30 days)"}
        </button>
      )}
    </div>
  );
}
