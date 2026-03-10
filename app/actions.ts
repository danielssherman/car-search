"use server";

import { runScrape } from "@/lib/cron";

export async function triggerScrape(): Promise<{
  found: number;
  newCount: number;
} | null> {
  try {
    return await runScrape();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }
}
