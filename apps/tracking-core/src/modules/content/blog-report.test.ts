import { describe, expect, it } from "vitest";
import {
  classifyTreatment,
  extractBlogPages,
  joinSearchConsoleMetrics,
  parseSitemapUrls,
  rollupByTreatment,
} from "./blog-report.js";

describe("parseSitemapUrls", () => {
  it("extracts loc entries, trimming whitespace", () => {
    const xml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>
          https://www.clinicadrdiente.com/
        </loc></url>
        <url><loc>https://www.clinicadrdiente.com/blog-drdiente/carillas-cdmx</loc></url>
      </urlset>`;
    expect(parseSitemapUrls(xml)).toEqual([
      "https://www.clinicadrdiente.com/",
      "https://www.clinicadrdiente.com/blog-drdiente/carillas-cdmx",
    ]);
  });
});

describe("classifyTreatment", () => {
  it("maps implant slugs to Implantes dentales", () => {
    expect(classifyTreatment("full-mouth-dental-implants-mexico-price")).toBe(
      "Implantes dentales",
    );
    expect(classifyTreatment("protesis-hibrida-all-on-4")).toBe(
      "Implantes dentales",
    );
  });

  it("maps smile design and veneer slugs to Diseño de sonrisa", () => {
    expect(classifyTreatment("duele-diseno-de-sonrisa-en-polanco")).toBe(
      "Diseño de sonrisa",
    );
    expect(classifyTreatment("cuanto-duran-las-carillas-de-porcelana")).toBe(
      "Diseño de sonrisa",
    );
  });

  it("maps cleaning slugs to Limpieza / Higiene", () => {
    expect(classifyTreatment("airflow-dental-en-ciudad-de-mexico")).toBe(
      "Limpieza / Higiene",
    );
  });

  it("falls back to General / Marca", () => {
    expect(classifyTreatment("nueva-clinica-premium-en-la-roma")).toBe(
      "General / Marca",
    );
  });
});

describe("extractBlogPages", () => {
  const urls = [
    "https://www.clinicadrdiente.com/",
    "https://www.clinicadrdiente.com/precios",
    "https://www.clinicadrdiente.com/blog-drdiente/carillas-cdmx",
    "https://www.clinicadrdiente.com/blog-drdiente/carillas-cdmx",
    "https://www.clinicadrdiente.com/blog-drdiente/implantes-roma/",
    "not a url",
  ];

  it("keeps only blog posts, dedupes, and classifies", () => {
    const pages = extractBlogPages(urls, "/blog-drdiente/");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      slug: "carillas-cdmx",
      treatment: "Diseño de sonrisa",
    });
    expect(pages[1]).toMatchObject({
      slug: "implantes-roma",
      treatment: "Implantes dentales",
    });
  });
});

describe("joinSearchConsoleMetrics", () => {
  it("joins by path ignoring host and trailing slash", () => {
    const pages = extractBlogPages(
      ["https://www.clinicadrdiente.com/blog-drdiente/carillas-cdmx"],
      "/blog-drdiente/",
    );
    const joined = joinSearchConsoleMetrics(pages, [
      {
        page: "https://clinicadrdiente.com/blog-drdiente/carillas-cdmx/",
        clicks: 12,
        impressions: 300,
        position: 8.4,
      },
      {
        page: "https://clinicadrdiente.com/precios",
        clicks: 50,
        impressions: 900,
        position: 3,
      },
    ]);
    expect(joined[0].clicks).toBe(12);
    expect(joined[0].impressions).toBe(300);
    expect(joined[0].position).toBe(8.4);
  });

  it("defaults to zero metrics when there is no GSC row", () => {
    const pages = extractBlogPages(
      ["https://www.clinicadrdiente.com/blog-drdiente/sin-trafico"],
      "/blog-drdiente/",
    );
    const joined = joinSearchConsoleMetrics(pages, []);
    expect(joined[0]).toMatchObject({
      clicks: 0,
      impressions: 0,
      position: null,
    });
  });
});

describe("rollupByTreatment", () => {
  it("aggregates posts and clicks per treatment, sorted by posts", () => {
    const rollup = rollupByTreatment([
      {
        url: "u1",
        slug: "s1",
        treatment: "Diseño de sonrisa",
        clicks: 5,
        impressions: 100,
        position: null,
      },
      {
        url: "u2",
        slug: "s2",
        treatment: "Diseño de sonrisa",
        clicks: 3,
        impressions: 50,
        position: null,
      },
      {
        url: "u3",
        slug: "s3",
        treatment: "Implantes dentales",
        clicks: 9,
        impressions: 200,
        position: null,
      },
    ]);
    expect(rollup[0]).toMatchObject({
      treatment: "Diseño de sonrisa",
      posts: 2,
      clicks: 8,
    });
    expect(rollup[1]).toMatchObject({
      treatment: "Implantes dentales",
      posts: 1,
      clicks: 9,
    });
  });
});
