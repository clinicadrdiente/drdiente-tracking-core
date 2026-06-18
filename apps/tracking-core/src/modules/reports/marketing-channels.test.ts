import { describe, expect, it } from "vitest";
import {
  isDigitalChannel,
  referenceToChannel,
  windsorSourceToChannel,
} from "./marketing-channels.js";

describe("referenceToChannel", () => {
  it("clasifica plataformas Meta (incluye variantes y acentos)", () => {
    expect(referenceToChannel("INSTAGRAM")).toBe("meta");
    expect(referenceToChannel("face")).toBe("meta");
    expect(referenceToChannel("Redes Sociales")).toBe("meta");
    expect(referenceToChannel("RED SOCIAL")).toBe("meta");
  });

  it("clasifica TikTok con y sin espacio", () => {
    expect(referenceToChannel("TikTok")).toBe("tiktok");
    expect(referenceToChannel("TIK TOK")).toBe("tiktok");
  });

  it("separa Google Maps (orgánico local) de Google (Ads + búsqueda)", () => {
    expect(referenceToChannel("GOOGLE MAPS")).toBe("google_maps");
    expect(referenceToChannel("GOOGLE")).toBe("google");
  });

  it("clasifica IA / buscadores de IA (incl. 'CHAT GPT' e 'IA' exacto)", () => {
    expect(referenceToChannel("CHAT GPT")).toBe("ai_search");
    expect(referenceToChannel("ChatGPT")).toBe("ai_search");
    expect(referenceToChannel("IA")).toBe("ai_search");
    expect(referenceToChannel("Perplexity")).toBe("ai_search");
    // token exacto: no debe matchear IA dentro de otras palabras
    expect(referenceToChannel("MARIA")).not.toBe("ai_search");
    expect(referenceToChannel("FAMILIA")).toBe("referral_organic");
  });

  it("clasifica recomendación vs pasando por la calle (walk_in)", () => {
    expect(referenceToChannel("Recomendación")).toBe("referral_organic");
    expect(referenceToChannel("REFERIDO SUCURSAL POLANCO")).toBe(
      "referral_organic",
    );
    expect(referenceToChannel("PASANDO POR CLÍNICA")).toBe("walk_in");
    expect(referenceToChannel("IBA PASANDO POR LA CLINICA")).toBe("walk_in");
    // walk_in gana cuando mezcla con un referido
    expect(referenceToChannel("PASANDO POR CLINICA VECINO")).toBe("walk_in");
  });

  it("vacío o desconocido cae en unknown", () => {
    expect(referenceToChannel("")).toBe("unknown");
    expect(referenceToChannel(null)).toBe("unknown");
    expect(referenceToChannel("PRUEBA")).toBe("unknown");
  });

  it("una plataforma social gana cuando la cadena mezcla fuentes", () => {
    expect(referenceToChannel("REDES SOCIALES / RECOMENDACION")).toBe("meta");
  });
});

describe("windsorSourceToChannel", () => {
  it("mapea las sources de Windsor al mismo canal", () => {
    expect(windsorSourceToChannel("facebook")).toBe("meta");
    expect(windsorSourceToChannel("instagram")).toBe("meta");
    expect(windsorSourceToChannel("tiktok")).toBe("tiktok");
    expect(windsorSourceToChannel("google")).toBe("google");
  });

  it("google_my_business cae en google_maps, no en google", () => {
    expect(windsorSourceToChannel("google_my_business")).toBe("google_maps");
  });

  it("sin source es unknown; fuente desconocida es other_digital", () => {
    expect(windsorSourceToChannel("")).toBe("unknown");
    expect(windsorSourceToChannel("searchconsole")).toBe("other_digital");
  });
});

describe("isDigitalChannel", () => {
  it("digital incluye los canales pagables; orgánico/unknown no", () => {
    expect(isDigitalChannel("google")).toBe(true);
    expect(isDigitalChannel("meta")).toBe(true);
    expect(isDigitalChannel("referral_organic")).toBe(false);
    expect(isDigitalChannel("unknown")).toBe(false);
  });
});
