export interface MonthBucket {
  monthKey: string;
  label: string;
  revenue: number;
  payments: number;
}

export interface MonthlyDashboard {
  ok: boolean;
  month: {
    label: string;
    fromIso: string;
    toIso: string;
  };
  range?: {
    days: number | null;
    fromIso: string;
    toIso: string;
  };
  months?: MonthBucket[];
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  days: DayBlock[];
  patients: PaymentBlock[];
  treatmentShare: Array<{
    category: string;
    revenue: number;
    share: number;
  }>;
  branchShare: BranchSummary[];
  comparison?: {
    fromIso: string;
    toIso: string;
    revenueTotal: number;
    paymentsTotal: number;
    uniquePatientsTotal: number;
    averagePaymentValue: number;
    branchShare: Array<{ branch: string; revenue: number; payments: number }>;
  };
  cache?: {
    hit: boolean;
    stale: boolean;
    cachedAt: string;
    ttlSeconds: number;
  };
}

export interface SystemStatus {
  ok: boolean;
  service: string;
  generatedAt: string;
  config: {
    elevatorMode: string;
    dentalinkMode: string;
    stapeMode: string;
    stateStoreMode: string;
    defaultCurrency: string;
    highTicketThreshold: number;
    paymentsSyncLookbackMinutes: number;
    trackingSecretConfigured: boolean;
  };
  paymentSync: {
    lastCheckIso: string | null;
    processedPaymentCount: number;
  };
  integrations: {
    elevator: string;
    dentalink: string;
    stape: string;
  };
}

export interface BranchSummary {
  branch: string;
  revenue: number;
  payments: number;
  uniquePatients: number;
  averagePaymentValue: number;
  share: number;
  topPatients: PaymentBlock[];
}

export interface DayBlock {
  day: number;
  date: string;
  label: string;
  revenue: number;
  payments: number;
  patients: PaymentBlock[];
}

export interface PaymentBlock {
  paymentId: number;
  patientId: number;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientReference: string | null;
  treatmentId: number;
  treatmentName: string | null;
  treatmentBudgetTotal: number;
  branch: string | null;
  paymentMethod: string | null;
  folio: string | null;
  reference: string | null;
  amount: number;
  createdAt: string | null;
}

export interface PaymentsSyncResult {
  processed: number;
  skipped: number;
  sinceIso: string | null;
  paymentsFound: number;
  alreadyProcessed: number;
  newPayments: number;
  maxPayments: number | null;
  matchedLeads: number;
  unmatchedLeads: number;
  createdLeads: number;
  existingLeads?: number;
  failed?: number;
  rateLimitedPatients: number;
  dispatched: number;
  results?: ElevatorImportResult[];
}

export interface ElevatorImportResult {
  paymentId: number | null;
  patientId: number | null;
  patientName: string;
  contact: string;
  reference: string;
  branch: string;
  status: "created" | "existing" | "skipped_missing_contact" | "failed";
  elevatorId: string | null;
  readyForStape: boolean;
  reason: string;
}

export interface ReferenceDiagnostic {
  ok: boolean;
  configuredPatientReferenceField: string;
  recommendation: string;
  catalogProbes: Array<{
    path: string;
    ok: boolean;
    status: number;
    returnedCount: number | null;
    sample: Array<{
      id: string | null;
      label: string | null;
      keys: string[];
    }>;
  }>;
  patientProbes: Array<{
    patientId: number;
    patientName: string | null;
    fields: Array<{
      key: string;
      value: string;
    }>;
    checkedPaths?: Array<{
      path: string;
      status: number;
      fields: Array<{
        key: string;
        value: string;
      }>;
    }>;
  }>;
}

export interface StapeTestResult {
  ping: unknown;
  event: unknown;
}

export interface WindsorMarketingSummary {
  ok?: boolean;
  configured?: boolean;
  connector?: string;
  datePreset?: string;
  filters?: {
    includeText: string[];
    excludeText: string[];
  };
  rawRowCount?: number;
  filteredRowCount?: number;
  message?: string;
  rows?: WindsorMarketingRow[];
  totals?: {
    spend: number;
    clicks: number;
    impressions: number;
    reach?: number;
    videoTrueviewViews?: number;
  };
  bySource?: WindsorSourceSummary[];
}

export interface WindsorMarketingRow {
  date?: string | null;
  datasource?: string | null;
  source?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  accountName?: string | null;
  accountId?: string | null;
  adAccountName?: string | null;
  adAccountId?: string | null;
  businessManager?: string | null;
  spend?: number;
  clicks?: number;
  impressions?: number;
  reach?: number;
  videoTrueviewViews?: number;
  currency?: string | null;
  accountCurrency?: string | null;
}

export interface WindsorSourceSummary {
  source: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach?: number;
  videoTrueviewViews?: number;
  campaigns: number;
}

export interface WindsorAccountSummary {
  key: string;
  accountName: string | null;
  accountId: string | null;
  adAccountName: string | null;
  adAccountId: string | null;
  businessManager: string | null;
  sources: string[];
  campaigns: string[];
  rows: number;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  videoTrueviewViews: number;
}

export interface WindsorAccountsResult {
  ok?: boolean;
  configured?: boolean;
  connector?: string;
  datePreset?: string;
  rowCount?: number;
  accounts?: WindsorAccountSummary[];
  message?: string;
}

export interface WindsorTestResult {
  ping: unknown;
  summary: WindsorMarketingSummary;
}
