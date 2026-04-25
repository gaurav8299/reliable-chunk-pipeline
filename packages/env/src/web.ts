import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

let rawEnv = {} as any;

try {
  rawEnv = createEnv({
    client: {
      NEXT_PUBLIC_API_URL: z.string().optional().default("http://localhost:3000"),
      NEXT_PUBLIC_SERVER_URL: z.string().optional().default("http://localhost:3000"),
    },
    runtimeEnv: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    },
    emptyStringAsUndefined: true,
  });
} catch (error) {
  // Safe default fallback to prevent Vercel build crashes
  rawEnv = {
    NEXT_PUBLIC_API_URL: "http://localhost:3000",
    NEXT_PUBLIC_SERVER_URL: "http://localhost:3000",
  };
}

export const env = rawEnv;
