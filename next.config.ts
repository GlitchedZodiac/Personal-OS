import type { NextConfig } from "next";

// Security headers (audit 2026-10, SEC-059). Production carried only Vercel's
// HSTS. This is the SAFE set — none of it limits what scripts may load, so it
// cannot blank a screen:
//  - frame-ancestors 'self' / SAMEORIGIN, NOT 'none': the iPad desk home
//    embeds the app's own pages in an iframe (app/(desk)/home/page.tsx, the
//    compact pane). Every other site is still refused.
//  - nosniff: served blobs (recording segments, photos) are never re-read as
//    HTML or script.
//  - camera, microphone, geolocation for this origin only — what the app
//    uses (dictation, sermon recording, label and meal photos, trails), and
//    exactly what the TestFlight shell grants (ios/iOSApp/WebShellView.swift).
// A full Content-Security-Policy (scripts, workers, tiles) is a followup: it
// needs testing on the iPad desk and the TestFlight shell (PLAN D5).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // OFF, deliberately (2026-10-05). Next 16.3 turned Turbopack's on-disk
    // build cache on by default (.next/cache/turbopack), and Vercel restores
    // .next/cache between deployments. The first production build after the
    // chat/push round came out with NEW JavaScript and a stylesheet missing
    // every rule that round added to globals.css — the chat screen shipped
    // without its layout. A warm cache is worth a few seconds of build time;
    // it is not worth a production build that cannot be trusted to contain
    // the CSS in the commit. (`npm run build` also deletes the directory, so
    // a cache written before this flag existed cannot be read either.)
    turbopackFileSystemCacheForBuild: false,
  },
  env: {
    // Which commit is this bundle? Without it nobody — including Michael — can tell what his
    // iPad is actually executing, and a whole round of Pencil fixes was once diagnosed against
    // a build that had never been installed. Shown in the pen readout and the desk settings.
    NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  },
};

export default nextConfig;
