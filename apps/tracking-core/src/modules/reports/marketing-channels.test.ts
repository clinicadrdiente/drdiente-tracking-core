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

  it("clasifica orgánico/recomendación", () => {
    expect(referenceToChannel("Recomendación")).toBe("referral_organic");
    expect(referenceToChannel("PASANDO POR CLÍNICA")).toBe("referral_organic");
    expect(referenceToChannel("REFERIDO SUCURSAL POLANCO")).toBe(
      "referral_organic",
    );
  });

  it("vacío o desconocido cae en unknown", () => {
    expect(referenceToChannel("")).toBe("unknown");
    expect(referenceToChannel(null)).toBe("unknown");
    expect(referenceToChannel("IA")).toBe("unknown");
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
