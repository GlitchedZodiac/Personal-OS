import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
