import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The flyer renderer reads font files at runtime; make sure deploys bundle them.
  outputFileTracingIncludes: {
    "/flyer/[id]": ["./src/assets/fonts/**/*"],
  },
};

export default nextConfig;
