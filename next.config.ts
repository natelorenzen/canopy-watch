import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Specs are read from disk (raw for agents, rendered for humans); ship them with every function.
  outputFileTracingIncludes: {
    "/**": ["./specs/**/*.md"],
  },
};

export default nextConfig;
