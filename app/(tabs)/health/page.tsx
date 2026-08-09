import { redirect } from "next/navigation";

// The legacy health hub is sunset — Today is the hub now. The old page
// lives in git history (pre-2026-08-09); its features live on in the
// Pitaya screens.
export default function HealthHub() {
  redirect("/dashboard");
}
