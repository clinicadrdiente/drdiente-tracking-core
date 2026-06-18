import type { DailyBranchReport } from "../../types/domain.js";
import type { WindsorSourceSummary } from "../windsor/client.js";

export interface EffortsSummary {
  range: { fromIso: string; toIso: string };
  platforms: Array<{
    source: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
  }>;
  totals: { spend: number; impressions: number; reach: number; clicks: number };
  manual: {
    postsPublished: number;
    leadsReceived: number;
    leadsContacted: number;
    callsReceived: number;
    emailsSent: number;
    promoWhatsappSent: number;
    followUpsSent: number;
    reportingBranches: number;
    daysWithReports: number;
  };
}

export function aggregateEfforts(
  windsor: {
    bySource: WindsorSourceSummary[];
    totals: {
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
    };
  } | null,
  dailyReports: DailyBranchReport[],
  range: { fromIso: string; toIso: string },
): EffortsSummary {
  // Windsor platforms
  const platforms = windsor
    ? windsor.bySource.map((s) => ({
        source: s.source,
        spend: s.spend,
        impressions: s.impressions,
        reach: s.reach,
        clicks: s.clicks,
      }))
    : [];

  const totals = windsor
    ? {
        spend: windsor.totals.spend,
        impressions: windsor.totals.impressions,
        reach: windsor.totals.reach,
        clicks: windsor.totals.clicks,
      }
    : { spend: 0, impressions: 0, reach: 0, clicks: 0 };

  // Manual aggregates from daily reports
  let postsPublished = 0;
  let leadsReceived = 0;
  let leadsContacted = 0;
  let callsReceived = 0;
  let emailsSent = 0;
  let promoWhatsappSent = 0;
  let followUpsSent = 0;
  const branchSet = new Set<string>();
  const daySet = new Set<string>();

  for (const r of dailyReports) {
    postsPublished += r.postsPublished;
    leadsReceived += r.leadsReceived;
    leadsContacted += r.leadsContacted;
    emailsSent += r.emailsSent;
    promoWhatsappSent += r.promoWhatsappSent;
    followUpsSent += r.followUpsSent;
    branchSet.add(r.branch);
    daySet.add(r.date);

    for (const contact of r.contacts) {
      if (contact.channel === "llamada") {
        callsReceived += contact.count;
      }
    }
  }

  return {
    range,
    platforms,
    totals,
    manual: {
      postsPublished,
      leadsReceived,
      leadsContacted,
      callsReceived,
      emailsSent,
      promoWhatsappSent,
      followUpsSent,
      reportingBranches: branchSet.size,
      daysWithReports: daySet.size,
    },
  };
}
