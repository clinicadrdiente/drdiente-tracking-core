import { trackingHttpHandlers } from "../../src/index.js";
import {
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

const HEARTBEAT_KEY = "payments-sync-cron";
const STALE_AFTER_HOURS = 30;

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const lastRan = await trackingHttpHandlers.stateStore.readHeartbeat(HEARTBEAT_KEY);

  if (!lastRan) {
    response.status(200).json({
      status: "unknown",
      message: "No heartbeat recorded yet. Cron has not run or heartbeat was not written.",
      lastRan: null,
      staleAfterHours: STALE_AFTER_HOURS,
    });
    return;
  }

  const lastRanDate = new Date(lastRan);
  const ageHours = (Date.now() - lastRanDate.getTime()) / (1000 * 60 * 60);
  const isStale = ageHours > STALE_AFTER_HOURS;

  response.status(200).json({
    status: isStale ? "stale" : "ok",
    lastRan,
    ageHours: Math.round(ageHours * 10) / 10,
    staleAfterHours: STALE_AFTER_HOURS,
  });
}
