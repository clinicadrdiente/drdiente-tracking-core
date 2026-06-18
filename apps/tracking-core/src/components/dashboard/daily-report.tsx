"use client";

import { useEffect, useState } from "react";
import { ModuleFrame } from "@/components/dashboard/module-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyBranchReport, LeadContactChannel } from "@/types/domain";

const CHANNELS: LeadContactChannel[] = [
  "llamada",
  "whatsapp",
  "google_maps",
  "email",
  "visita_directa",
  "otro",
];

const CHANNEL_LABELS: Record<LeadContactChannel, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  google_maps: "Google Maps",
  email: "Email",
  visita_directa: "Visita directa",
  otro: "Otro",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  branch: string;
  date: string;
  leadsReceived: string;
  leadsContacted: string;
  followUpsSent: string;
  promoWhatsappSent: string;
  emailsSent: string;
  postsPublished: string;
  notes: string;
  channelCounts: Record<LeadContactChannel, string>;
}

function defaultForm(): FormState {
  return {
    branch: "",
    date: todayIso(),
    leadsReceived: "0",
    leadsContacted: "0",
    followUpsSent: "0",
    promoWhatsappSent: "0",
    emailsSent: "0",
    postsPublished: "0",
    notes: "",
    channelCounts: {
      llamada: "0",
      whatsapp: "0",
      google_maps: "0",
      email: "0",
      visita_directa: "0",
      otro: "0",
    },
  };
}

export function DailyReport({ secret }: { secret: string }) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reports, setReports] = useState<DailyBranchReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isAutofilling, setIsAutofilling] = useState(false);

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  async function loadReports() {
    if (!secret.trim()) return;
    setIsLoadingReports(true);
    try {
      const res = await fetch("/api/reports/daily", {
        headers: { "x-tracking-secret": secret.trim() },
      });
      const body = (await res.json()) as {
        ok: boolean;
        reports?: DailyBranchReport[];
        error?: string;
      };
      if (res.ok && body.ok && Array.isArray(body.reports)) {
        setReports(body.reports);
      }
    } catch {
      // non-critical
    } finally {
      setIsLoadingReports(false);
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setChannelCount(channel: LeadContactChannel, value: string) {
    setForm((prev) => ({
      ...prev,
      channelCounts: { ...prev.channelCounts, [channel]: value },
    }));
  }

  async function handleAutofill() {
    if (!secret.trim() || !form.date) return;
    setIsAutofilling(true);
    try {
      const res = await fetch(
        `/api/dev/dentalink-day-summary?date=${form.date}`,
        {
          headers: { "x-tracking-secret": secret.trim() },
        },
      );
      const body = (await res.json()) as {
        ok: boolean;
        revenueTotal?: number;
        paymentsCount?: number;
        uniquePatients?: number;
        branches?: Array<{ branch: string; revenue: number; payments: number }>;
      };
      if (!res.ok || !body.ok) return;

      const fmt = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0,
      });
      const branches = body.branches ?? [];
      const primaryBranch = branches[0]?.branch ?? "";
      const noteLines: string[] = [
        `Dentalink ${form.date}: ${fmt.format(body.revenueTotal ?? 0)} en ${body.paymentsCount ?? 0} pagos, ${body.uniquePatients ?? 0} pacientes`,
        ...branches.map(
          (b) =>
            `  ${b.branch}: ${fmt.format(b.revenue)} (${b.payments} pagos)`,
        ),
      ];

      setForm((prev) => ({
        ...prev,
        branch: prev.branch || primaryBranch,
        notes: noteLines.join("\n") + (prev.notes ? "\n" + prev.notes : ""),
      }));
    } catch {
      // non-critical
    } finally {
      setIsAutofilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) {
      setSubmitError(
        "Configura el TRACKING_API_SECRET en la pantalla principal.",
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const contacts = CHANNELS.map((ch) => ({
      channel: ch,
      count: parseInt(form.channelCounts[ch] || "0", 10),
    })).filter((c) => c.count > 0);

    const payload = {
      branch: form.branch.trim(),
      date: form.date,
      contacts,
      leadsReceived: parseInt(form.leadsReceived || "0", 10),
      leadsContacted: parseInt(form.leadsContacted || "0", 10),
      followUpsSent: parseInt(form.followUpsSent || "0", 10),
      promoWhatsappSent: parseInt(form.promoWhatsappSent || "0", 10),
      emailsSent: parseInt(form.emailsSent || "0", 10),
      postsPublished: parseInt(form.postsPublished || "0", 10),
      notes: form.notes.trim() || null,
    };

    try {
      const res = await fetch("/api/reports/daily", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tracking-secret": secret.trim(),
        },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Error al enviar reporte.");
      }

      setSubmitSuccess(
        `Reporte de ${payload.branch} para ${payload.date} enviado.`,
      );
      setForm(defaultForm);
      void loadReports();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Group reports by date for display
  const byDate = reports.reduce<Record<string, DailyBranchReport[]>>(
    (acc, r) => {
      (acc[r.date] ??= []).push(r);
      return acc;
    },
    {},
  );
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <ModuleFrame accent="reports" title="Reporte diario de sucursal">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Sucursal</label>
            <Input
              placeholder="ej. Centro, Norte, Sur"
              value={form.branch}
              onChange={(e) => setField("branch", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Fecha</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isAutofilling || !secret.trim() || !form.date}
            onClick={() => void handleAutofill()}
          >
            {isAutofilling
              ? "Cargando Dentalink..."
              : "Autocompletar desde Dentalink"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ["leadsReceived", "Leads recibidos"],
              ["leadsContacted", "Leads contactados"],
              ["followUpsSent", "Seguimientos"],
              ["promoWhatsappSent", "WhatsApp promo"],
              ["emailsSent", "Emails enviados"],
              ["postsPublished", "Posts publicados"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm font-medium">{label}</label>
              <Input
                type="number"
                min="0"
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Contactos por canal</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CHANNELS.map((ch) => (
              <div key={ch} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {CHANNEL_LABELS[ch]}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={form.channelCounts[ch]}
                  onChange={(e) => setChannelCount(ch, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Notas (opcional)</label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px] resize-y"
            placeholder="Observaciones del dia..."
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        </div>

        {submitSuccess ? (
          <p className="text-sm text-green-600 dark:text-green-400">
            {submitSuccess}
          </p>
        ) : null}
        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Enviando..." : "Enviar reporte"}
        </Button>
      </form>

      <section className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Ultimos reportes</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadReports()}
            disabled={isLoadingReports}
          >
            {isLoadingReports ? "Cargando..." : "Actualizar"}
          </Button>
        </div>

        {sortedDates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay reportes en los ultimos 30 dias.
          </p>
        ) : (
          sortedDates.map((date) => (
            <Card key={date} className="border-border/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm">{date}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1">
                  {byDate[date]!.map((r) => {
                    const rate =
                      r.leadsReceived > 0
                        ? Math.round((r.leadsContacted / r.leadsReceived) * 100)
                        : null;
                    return (
                      <div
                        key={r.reportId}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-medium">{r.branch}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {r.leadsContacted}/{r.leadsReceived} leads
                          </span>
                          {rate !== null ? (
                            <Badge
                              variant={
                                rate >= 80
                                  ? "default"
                                  : rate >= 50
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {rate}%
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </ModuleFrame>
  );
}
