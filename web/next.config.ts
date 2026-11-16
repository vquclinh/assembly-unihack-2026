import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // The floating dev badge would show up in every panel of the judge demo.
  devIndicators: false,
};

export default nextConfig;
