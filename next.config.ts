import type { NextConfig } from "next";
import { validateEnv } from "./lib/env";

// Validate environment variables at build and startup time.
const envResult = validateEnv();
if (!envResult.success) {
  throw envResult.error;
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
