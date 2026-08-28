import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  serverExternalPackages: ["jsdom", "@mozilla/readability", "unpdf", "isomorphic-dompurify", "playwright-core"],
  transpilePackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/playwright-core/**/*"],
  },
  outputFileTracingExcludes: {
    "*": ["./data/**", "./release/**"],
  },
};

export default nextConfig;
