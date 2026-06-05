import { trackingHttpHandlers } from "../../src/index.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const result = await trackingHttpHandlers.postLead({
    ...toHttpRequest(request),
    body: {
      firstName: "Paciente",
      lastName: "Demo",
      phone: "+52 55 1234 5678",
      email: "paciente@example.com",
      branch: "Polanco",
      attribution: {
        fbclid: "demo_fbclid",
        gclid: null,
        ttclid: null,
        utmSource: "dashboard",
        utmMedium: "internal_test",
        utmCampaign: "tracking_core_demo",
        landingUrl: "https://drdiente.mx/demo",
      },
    },
  });

  send(response, result);
}
