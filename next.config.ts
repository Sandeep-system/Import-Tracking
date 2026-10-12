import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? (process.env.GITHUB_PAGES === 'true' ? '/Import-Tracking' : ''),
  trailingSlash: true,
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
