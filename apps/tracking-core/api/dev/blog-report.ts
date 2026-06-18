import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import {
  createWindsorClient,
  WindsorRequestError,
  type WindsorSearchConsoleRow,
} from "../../src/modules/windsor/client.js";
import {
  extractBlogPages,
  getBlogReportConfig,
  joinSearchConsoleMetrics,
  parseSitemapUrls,
  rollupByTreatment,
} from "../../src/modules/content/blog-report.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  const config = getBlogReportConfig();
  const dateFrom = readQueryString(request.query?.from);
  const dateTo = readQueryString(request.query?.to);

  let sitemapXml: string;
  try {
    const sitemapResponse = await fetch(config.sitemapUrl, {
      headers: { Accept: "application/xml,text/xml" },
    });
    if (!sitemapResponse.ok) {
      throw new Error(`sitemap returned status ${sitemapResponse.status}`);
    }
    sitemapXml = await sitemapResponse.text();
  } catch (error) {
    send(response, {
      status: 502,
      body: {
        ok: false,
        error: "failed to fetch sitemap",
        details: {
          sitemapUrl: config.sitemapUrl,
          message: error instanceof Error ? error.message : "unknown error",
        },
      },
    });
    return;
  }

  const blogPages = extractBlogPages(
    parseSitemapUrls(sitemapXml),
    config.blogPathPrefix,
  );

  const windsor = createWindsorClient();
  let gscConfigured = windsor.isConfigured();
  let gscError: string | null = null;
  let gscPageRows: WindsorSearchConsoleRow[] = [];
  let gscQueryRows: WindsorSearchConsoleRow[] = [];

  if (gscConfigured) {
    try {
      const [pageReport, queryReport] = await Promise.all([
        windsor.getSearchConsoleReport({
          dimension: "page",
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          datePreset: dateFrom && dateTo ? undefined : "last_30d",
        }),
        windsor.getSearchConsoleReport({
          dimension: "query",
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          datePreset: dateFrom && dateTo ? undefined : "last_30d",
        }),
      ]);
      gscPageRows = pageReport.rows;
      gscQueryRows = queryReport.rows;
    } catch (error) {
      gscConfigured = false;
      gscError =
        error instanceof WindsorRequestError
          ? `Windsor searchconsole status ${error.status}`
          : error instanceof Error
            ? error.message
            : "unknown error";
    }
  }

  const pagesWithMetrics = joinSearchConsoleMetrics(blogPages, gscPageRows);
  const byTreatment = rollupByTreatment(pagesWithMetrics);
  const blogClicks = pagesWithMetrics.reduce(
    (sum, page) => sum + page.clicks,
    0,
  );
  const blogImpressions = pagesWithMetrics.reduce(
    (sum, page) => sum + page.impressions,
    0,
  );
  const siteClicks = gscPageRows.reduce((sum, row) => sum + row.clicks, 0);
  const siteImpressions = gscPageRows.reduce(
    (sum, row) => sum + row.impressions,
    0,
  );

  send(response, {
    status: 200,
    body: {
      ok: true,
      range: {
        from: dateFrom,
        to: dateTo,
        preset: dateFrom && dateTo ? null : "last_30d",
      },
      sitemapUrl: config.sitemapUrl,
      totalBlogs: blogPages.length,
      byTreatment,
      topPages: pagesWithMetrics
        .slice()
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, 15),
      searchConsole: {
        configured: gscConfigured,
        error: gscError,
        siteClicks,
        siteImpressions,
        blogClicks,
        blogImpressions,
        blogShareOfClicks: siteClicks > 0 ? (blogClicks / siteClicks) * 100 : 0,
        topQueries: gscQueryRows.slice(0, 15),
      },
    },
  });
}

function readQueryString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
