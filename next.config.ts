import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@darsh/design"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  agentRules: false,
};

export default nextConfig;
