/**
 * Blog content report: reads the public sitemap, classifies each post by
 * treatment (keyword match on the slug) and joins organic Search Console
 * metrics per page when Windsor is configured.
 */

export interface BlogPage {
  url: string;
  slug: string;
  treatment: string;
}

export interface TreatmentRollup {
  treatment: string;
  posts: number;
  clicks: number;
  impressions: number;
}

export interface BlogPageWithMetrics extends BlogPage {
  clicks: number;
  impressions: number;
  position: number | null;
}

/**
 * Keyword → treatment map. First match wins, so more specific terms go first.
 * Slugs are kebab-case Spanish/English (e.g. "duele-diseno-de-sonrisa-en-polanco").
 */
const TREATMENT_KEYWORDS: Array<{ treatment: string; keywords: string[] }> = [
  {
    treatment: "Implantes dentales",
    keywords: ["implant", "all-on-4", "all-on-6", "protesis", "full-mouth"],
  },
  {
    treatment: "Diseño de sonrisa",
    keywords: [
      "diseno-de-sonrisa",
      "diseno-sonrisa",
      "smile-makeover",
      "carilla",
      "veneer",
      "mock-up",
      "sonrisa",
      "ceramic",
      "zirconio",
      "porcelana",
      "fluorescencia",
      "cromatico",
      "armonizacion",
      "incisivo",
      "diente",
    ],
  },
  {
    treatment: "Alineadores / Ortodoncia",
    keywords: ["alineador", "ortodoncia", "invisalign", "bracket"],
  },
  {
    treatment: "Blanqueamiento",
    keywords: ["blanqueamiento", "whitening"],
  },
  {
    treatment: "Limpieza / Higiene",
    keywords: ["limpieza", "airflow", "higiene", "profilaxis"],
  },
  {
    treatment: "Coronas",
    keywords: ["corona", "crown"],
  },
  {
    treatment: "Endodoncia",
    keywords: ["endodoncia", "conducto", "root-canal"],
  },
  {
    treatment: "Bichectomía",
    keywords: ["bichectomia"],
  },
  {
    treatment: "Turismo dental",
    keywords: [
      "turismo",
      "tourism",
      "mexico-price",
      "mexico-cost",
      "dental-implants-mexico",
    ],
  },
];

export function classifyTreatment(slug: string): string {
  const normalized = slug.toLowerCase();
  for (const entry of TREATMENT_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.treatment;
    }
  }
  return "General / Marca";
}

/** Extracts all <loc> URLs from a sitemap XML document. */
export function parseSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/g)].map(
    (match) => match[1],
  );
}

/** Filters sitemap URLs down to blog posts and classifies each one. */
export function extractBlogPages(
  sitemapUrls: string[],
  blogPathPrefix: string,
): BlogPage[] {
  const seen = new Set<string>();
  const pages: BlogPage[] = [];

  for (const url of sitemapUrls) {
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      continue;
    }

    if (!path.startsWith(blogPathPrefix)) continue;
    const slug = path.slice(blogPathPrefix.length).replace(/\/+$/, "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    pages.push({ url, slug, treatment: classifyTreatment(slug) });
  }

  return pages;
}

/**
 * Joins GSC page rows onto blog pages. Matching is by URL path so that
 * www / protocol / trailing-slash differences don't break the join.
 */
export function joinSearchConsoleMetrics(
  pages: BlogPage[],
  gscRows: Array<{
    page: string | null;
    clicks: number;
    impressions: number;
    position: number | null;
  }>,
): BlogPageWithMetrics[] {
  const byPath = new Map<
    string,
    { clicks: number; impressions: number; position: number | null }
  >();

  for (const row of gscRows) {
    if (!row.page) continue;
    const path = toComparablePath(row.page);
    if (!path) continue;
    const existing = byPath.get(path);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
    } else {
      byPath.set(path, {
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      });
    }
  }

  return pages.map((page) => {
    const metrics = byPath.get(toComparablePath(page.url) ?? "");
    return {
      ...page,
      clicks: metrics?.clicks ?? 0,
      impressions: metrics?.impressions ?? 0,
      position: metrics?.position ?? null,
    };
  });
}

export function rollupByTreatment(
  pages: BlogPageWithMetrics[],
): TreatmentRollup[] {
  const groups = new Map<string, TreatmentRollup>();

  for (const page of pages) {
    const group = groups.get(page.treatment) ?? {
      treatment: page.treatment,
      posts: 0,
      clicks: 0,
      impressions: 0,
    };
    group.posts += 1;
    group.clicks += page.clicks;
    group.impressions += page.impressions;
    groups.set(page.treatment, group);
  }

  return [...groups.values()].sort(
    (a, b) => b.posts - a.posts || b.clicks - a.clicks,
  );
}

function toComparablePath(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path || "/";
  } catch {
    return null;
  }
}

export interface BlogReportConfig {
  sitemapUrl: string;
  blogPathPrefix: string;
}

export function getBlogReportConfig(): BlogReportConfig {
  return {
    sitemapUrl:
      process.env.BLOG_SITEMAP_URL ??
      "https://www.clinicadrdiente.com/sitemap.xml",
    blogPathPrefix: process.env.BLOG_PATH_PREFIX ?? "/blog-drdiente/",
  };
}
