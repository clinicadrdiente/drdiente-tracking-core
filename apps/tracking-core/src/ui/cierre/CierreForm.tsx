import * as React from "react";
import SendButton, { type SendStatus } from "@/components/ui/send-button";
import "./cierre.css";

// --- Vocabularios controlados (deben coincidir con la validación del backend) ---
const ORIGINS = [
  ["meta_ads", "Meta/Instagram Ads"],
  ["facebook_organico", "Facebook orgánico"],
  ["instagram_organico", "Instagram orgánico"],
  ["google", "Google"],
  ["google_maps", "Google Maps"],
  ["whatsapp_directo", "WhatsApp directo"],
  ["referido", "Referido"],
  ["walk_in", "Walk-in"],
  ["tiktok", "TikTok"],
  ["otro", "Otro"],
] as const;
const INTERESTS = [
  ["limpieza", "Limpieza"],
  ["blanqueamiento", "Blanqueamiento"],
  ["ortodoncia", "Ortodoncia"],
  ["implantes", "Implantes"],
  ["endodoncia", "Endodoncia"],
  ["estetica", "Estética"],
  ["urgencia", "Urgencia"],
  ["protesis", "Prótesis"],
  ["otro", "Otro"],
] as const;
const QUESTIONS = [
  ["precio", "Precio"],
  ["disponibilidad", "Disponibilidad/horarios"],
  ["ubicacion", "Ubicación"],
  ["financiamiento", "Financiamiento/cuotas"],
  ["duracion", "Duración tratamiento"],
  ["garantia", "Garantía"],
  ["dolor_miedo", "Dolor/miedo"],
  ["solo_info", "Solo info"],
  ["otro", "Otro"],
] as const;
const STATUSES = [
  ["solo_consulto", "Solo consultó"],
  ["agendo", "Agendó"],
  ["asistio", "Asistió"],
  ["convirtio", "Convirtió (pagó)"],
  ["no_contesto", "No contestó"],
  ["perdido", "Perdido"],
] as const;
const LOST = [
  ["", "—"],
  ["precio", "Precio"],
  ["no_respondio", "No respondió"],
  ["eligio_otra_clinica", "Eligió otra clínica"],
  ["solo_curioseaba", "Solo curioseaba"],
  ["sin_horario", "Sin horario"],
  ["otro", "Otro"],
] as const;

interface LeadRow {
  name: string;
  contact: string;
  origin: string;
  campaign: string;
  interest: string;
  question: string;
  status: string;
  appointmentDate: string;
  lostReason: string;
  quotedValue: string;
  note: string;
}

function emptyLead(): LeadRow {
  return {
    name: "",
    contact: "",
    origin: "meta_ads",
    campaign: "",
    interest: "limpieza",
    question: "precio",
    status: "solo_consulto",
    appointmentDate: "",
    lostReason: "",
    quotedValue: "",
    note: "",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const toInt = (v: string): number => (v === "" ? 0 : parseInt(v, 10));
const toNum = (v: string): number | null => (v === "" ? null : Number(v));

const options = (arr: ReadonlyArray<readonly [string, string]>) =>
  arr.map(([value, labelText]) => (
    <option key={value} value={value}>
      {labelText}
    </option>
  ));

export function CierreForm() {
  const [branch, setBranch] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [recepcionist, setRecepcionist] = React.useState("");
  const [agg, setAgg] = React.useState({
    leadsReceived: "0",
    leadsContacted: "0",
    appointmentsCreated: "",
    appointmentsAttended: "",
    noShows: "",
    conversions: "",
    revenueTotal: "",
    adSpend: "",
    followUpsSent: "0",
    promoWhatsappSent: "0",
    emailsSent: "0",
    postsPublished: "0",
  });
  const [notes, setNotes] = React.useState("");
  const [leads, setLeads] = React.useState<LeadRow[]>([emptyLead()]);
  const [status, setStatus] = React.useState<SendStatus>("idle");
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const setAggField = (key: keyof typeof agg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAgg((prev) => ({ ...prev, [key]: e.target.value }));

  const updateLead = (index: number, key: keyof LeadRow, value: string) =>
    setLeads((prev) => prev.map((l, i) => (i === index ? { ...l, [key]: value } : l)));

  const addLead = () => setLeads((prev) => [...prev, emptyLead()]);
  const removeLead = (index: number) =>
    setLeads((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMsg(null);

    const payload = {
      branch: branch.trim(),
      date,
      recepcionist: recepcionist.trim() || null,
      contacts: [] as Array<{ channel: string; count: number }>,
      leadsReceived: toInt(agg.leadsReceived),
      leadsContacted: toInt(agg.leadsContacted),
      followUpsSent: toInt(agg.followUpsSent),
      promoWhatsappSent: toInt(agg.promoWhatsappSent),
      emailsSent: toInt(agg.emailsSent),
      postsPublished: toInt(agg.postsPublished),
      appointmentsCreated: toNum(agg.appointmentsCreated),
      appointmentsAttended: toNum(agg.appointmentsAttended),
      noShows: toNum(agg.noShows),
      conversions: toNum(agg.conversions),
      revenueTotal: toNum(agg.revenueTotal),
      adSpend: toNum(agg.adSpend),
      leads: leads
        .filter((l) => l.name.trim() !== "")
        .map((l) => ({
          name: l.name.trim(),
          contact: l.contact.trim() || null,
          origin: l.origin,
          campaign: l.campaign.trim() || null,
          interest: l.interest,
          question: l.question,
          status: l.status,
          appointmentDate: l.appointmentDate || null,
          lostReason: l.lostReason || null,
          quotedValue: toNum(l.quotedValue),
          note: l.note.trim() || null,
        })),
      notes: notes.trim() || null,
    };

    setStatus("loading");
    try {
      const res = await fetch("/api/reports/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (res.ok) {
        setStatus("success");
        setMsg({
          kind: "ok",
          text: `✓ Cierre guardado: ${payload.leads.length} lead(s) registrados.`,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        // Reset suave para el siguiente cierre.
        setBranch("");
        setRecepcionist("");
        setNotes("");
        setLeads([emptyLead()]);
        setAgg({
          leadsReceived: "0",
          leadsContacted: "0",
          appointmentsCreated: "",
          appointmentsAttended: "",
          noShows: "",
          conversions: "",
          revenueTotal: "",
          adSpend: "",
          followUpsSent: "0",
          promoWhatsappSent: "0",
          emailsSent: "0",
          postsPublished: "0",
        });
        setDate(today());
        window.setTimeout(() => setStatus("idle"), 2200);
      } else {
        setStatus("error");
        setMsg({ kind: "err", text: `Error: ${data.error ?? `HTTP ${res.status}`}` });
        window.setTimeout(() => setStatus("idle"), 2200);
      }
    } catch (err) {
      setStatus("error");
      setMsg({
        kind: "err",
        text: `Error de red: ${err instanceof Error ? err.message : "desconocido"}`,
      });
      window.setTimeout(() => setStatus("idle"), 2200);
    }
  }

  return (
    <div className="origin">
      <div className="sky" aria-hidden="true" />
      <header className="hero reveal">
        <div className="eyebrow">
          <span className="dot" />
          <span>Recepción · Cierre de caja</span>
        </div>
        <h1>
          <span className="em">Cierre</span> diario
        </h1>
        <p>
          Clínica Dr. Diente — completa el formulario al cerrar caja. Cada dato
          viaja a la base de datos para leer patrones y decidir con precisión.
        </p>
      </header>

      <div className="wrap">
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <form onSubmit={handleSubmit}>
          <section className="card reveal d1">
            <div className="eyebrow">
              <span className="dot" />
              <span>Datos del cierre</span>
            </div>
            <h2>¿Quién y cuándo?</h2>
            <div className="grid">
              <div>
                <label>Sucursal *</label>
                <input
                  required
                  placeholder="centro"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
              <div>
                <label>Fecha *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <label>Recepcionista que cierra</label>
            <input
              placeholder="Nombre"
              value={recepcionist}
              onChange={(e) => setRecepcionist(e.target.value)}
            />
          </section>

          <section className="card reveal d2">
            <div className="eyebrow">
              <span className="dot" />
              <span>Bloque A · Resumen</span>
            </div>
            <h2>El día en números</h2>
            <p className="desc">Totales que cuadran con caja.</p>
            <div className="grid">
              <div>
                <label>Leads nuevos</label>
                <input type="number" min="0" value={agg.leadsReceived} onChange={setAggField("leadsReceived")} />
              </div>
              <div>
                <label>Leads contactados</label>
                <input type="number" min="0" value={agg.leadsContacted} onChange={setAggField("leadsContacted")} />
              </div>
              <div>
                <label>Citas agendadas</label>
                <input type="number" min="0" value={agg.appointmentsCreated} onChange={setAggField("appointmentsCreated")} />
              </div>
              <div>
                <label>Asistieron (show)</label>
                <input type="number" min="0" value={agg.appointmentsAttended} onChange={setAggField("appointmentsAttended")} />
              </div>
              <div>
                <label>No-show / cancel.</label>
                <input type="number" min="0" value={agg.noShows} onChange={setAggField("noShows")} />
              </div>
              <div>
                <label>Convirtieron (pagaron)</label>
                <input type="number" min="0" value={agg.conversions} onChange={setAggField("conversions")} />
              </div>
              <div>
                <label>Ingreso del día ($)</label>
                <input type="number" min="0" step="0.01" value={agg.revenueTotal} onChange={setAggField("revenueTotal")} />
              </div>
              <div>
                <label>Gasto publicitario ($)</label>
                <input type="number" min="0" step="0.01" value={agg.adSpend} onChange={setAggField("adSpend")} />
              </div>
            </div>
            <details>
              <summary>Actividad de recepción (opcional)</summary>
              <div className="grid" style={{ marginTop: 12 }}>
                <div>
                  <label>Follow-ups enviados</label>
                  <input type="number" min="0" value={agg.followUpsSent} onChange={setAggField("followUpsSent")} />
                </div>
                <div>
                  <label>Promos WhatsApp</label>
                  <input type="number" min="0" value={agg.promoWhatsappSent} onChange={setAggField("promoWhatsappSent")} />
                </div>
                <div>
                  <label>Emails enviados</label>
                  <input type="number" min="0" value={agg.emailsSent} onChange={setAggField("emailsSent")} />
                </div>
                <div>
                  <label>Posts publicados</label>
                  <input type="number" min="0" value={agg.postsPublished} onChange={setAggField("postsPublished")} />
                </div>
              </div>
            </details>
          </section>

          <section className="card reveal d3">
            <div className="eyebrow">
              <span className="dot" />
              <span>Bloque B · Detalle por lead</span>
            </div>
            <h2>¿Quién preguntó qué?</h2>
            <p className="desc">
              Una tarjeta por cada persona que escribió, llamó o llegó hoy. Esto
              es lo que habilita el análisis de patrones.
            </p>

            {leads.map((lead, i) => (
              <div className="lead" key={i}>
                {leads.length > 1 && (
                  <button type="button" className="rm" onClick={() => removeLead(i)}>
                    Quitar
                  </button>
                )}
                <div className="lead-head">
                  <span className="dot" />
                  <span>Lead {i + 1}</span>
                </div>
                <label>Nombre *</label>
                <input
                  placeholder="Nombre del lead"
                  value={lead.name}
                  onChange={(e) => updateLead(i, "name", e.target.value)}
                />
                <div className="grid">
                  <div>
                    <label>Teléfono / WhatsApp</label>
                    <input placeholder="ID único" value={lead.contact} onChange={(e) => updateLead(i, "contact", e.target.value)} />
                  </div>
                  <div>
                    <label>Origen *</label>
                    <select value={lead.origin} onChange={(e) => updateLead(i, "origin", e.target.value)}>
                      {options(ORIGINS)}
                    </select>
                  </div>
                  <div>
                    <label>Campaña</label>
                    <input placeholder="Ej. Blanqueamiento Junio" value={lead.campaign} onChange={(e) => updateLead(i, "campaign", e.target.value)} />
                  </div>
                  <div>
                    <label>Tratamiento de interés *</label>
                    <select value={lead.interest} onChange={(e) => updateLead(i, "interest", e.target.value)}>
                      {options(INTERESTS)}
                    </select>
                  </div>
                  <div>
                    <label>¿Qué preguntó? *</label>
                    <select value={lead.question} onChange={(e) => updateLead(i, "question", e.target.value)}>
                      {options(QUESTIONS)}
                    </select>
                  </div>
                  <div>
                    <label>Estado *</label>
                    <select value={lead.status} onChange={(e) => updateLead(i, "status", e.target.value)}>
                      {options(STATUSES)}
                    </select>
                  </div>
                  <div>
                    <label>Fecha cita (si agendó)</label>
                    <input type="date" value={lead.appointmentDate} onChange={(e) => updateLead(i, "appointmentDate", e.target.value)} />
                  </div>
                  <div>
                    <label>Motivo si perdido</label>
                    <select value={lead.lostReason} onChange={(e) => updateLead(i, "lostReason", e.target.value)}>
                      {options(LOST)}
                    </select>
                  </div>
                  <div>
                    <label>Valor cotizado/pagado ($)</label>
                    <input type="number" min="0" step="0.01" value={lead.quotedValue} onChange={(e) => updateLead(i, "quotedValue", e.target.value)} />
                  </div>
                </div>
                <label>Nota (opcional)</label>
                <input placeholder="Solo lo que no entra arriba" value={lead.note} onChange={(e) => updateLead(i, "note", e.target.value)} />
              </div>
            ))}

            <button type="button" className="add" onClick={addLead}>
              + Agregar lead
            </button>
          </section>

          <section className="card reveal d4">
            <label>Observación general del día (opcional)</label>
            <textarea
              rows={2}
              placeholder="Solo si pasó algo relevante"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>

          <div className="submit-wrap reveal d4">
            <SendButton
              status={status}
              idleLabel="Enviar cierre"
              loadingLabel="Enviando…"
              successLabel="Cierre guardado"
              errorLabel="Reintentar"
            />
          </div>
          <p className="foot">Los datos se guardan de forma segura en la base de datos de la clínica.</p>
        </form>
      </div>
    </div>
  );
}

export default CierreForm;
