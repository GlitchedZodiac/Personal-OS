import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  env: {
    // Which commit is this bundle? Without it nobody — including Michael — can tell what his
    // iPad is actually executing, and a whole round of Pencil fixes was once diagnosed against
    // a build that had never been installed. Shown in the pen readout and the desk settings.
    NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  },
};

export default nextConfig;
