import type { VercelRequest, VercelResponse } from "./_lib/http.js";

export default function handler(
  _request: VercelRequest,
  response: VercelResponse,
): void {
  response.status(200).json({
    ok: true,
    service: "drdiente-tracking-core",
  });
}
