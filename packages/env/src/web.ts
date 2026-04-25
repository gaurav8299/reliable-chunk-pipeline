/**
 * Simplified, fail-proof environment variables.
 * Completely removed @t3-oss/env-nextjs to guarantee Vercel does not crash at build time.
 */

export const env = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
};
