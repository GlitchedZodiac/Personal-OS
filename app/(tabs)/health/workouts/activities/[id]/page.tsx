"use client";

// Dedicated activity route (2026-08-28) — the detail used to live inside the
// list page as a ?id= overlay; a real URL gives browser back/share links and
// keeps the MapLibre bundle off the list. Old ?id= deep links redirect here.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ActivityDetail, {
  type ActivityDetailData,
} from "@/components/activity-detail";

export default function ActivityDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ActivityDetailData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const id = params?.id;
    if (!id) return;
    fetch(`/api/health/workouts/activity?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && !d.error ? setDetail(d) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [params?.id]);

  const toList = () => router.push("/health/workouts/activities");

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F2F1F2] px-8 text-center">
        <p className="text-[14px] font-semibold text-foreground">
          That workout isn&apos;t here anymore.
        </p>
        <button
          onClick={toList}
          className="mt-4 rounded-full bg-[#232227] px-5 py-2 text-[12.5px] font-semibold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Back to Activities
        </button>
      </div>
    );
  }

  if (!detail) return <div className="min-h-screen bg-[#F2F1F2]" />;

  return <ActivityDetail detail={detail} onBack={toList} onDeleted={toList} />;
}
