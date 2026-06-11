import { InMemoryStateStore } from "../src/modules/state/state-store.js";

const DEMO_RECORDS = [
  { treatmentId: 101, treatmentName: "Diseño de Sonrisa",        budgetTotal: 95000, currency: "MXN", firstPaymentAt: "2024-03-10T10:00:00.000Z", lastPaymentAt: "2024-09-15T10:00:00.000Z", patientId: 101, patientName: "María López",      branch: "Polanco"   },
  { treatmentId: 102, treatmentName: "Ortodoncia Transparente",  budgetTotal: 55000, currency: "MXN", firstPaymentAt: "2024-06-01T10:00:00.000Z", lastPaymentAt: "2024-11-20T10:00:00.000Z", patientId: 101, patientName: "María López",      branch: "Polanco"   },
  { treatmentId: 103, treatmentName: "Blanqueamiento Dental",    budgetTotal:  8500, currency: "MXN", firstPaymentAt: "2024-11-20T10:00:00.000Z", lastPaymentAt: "2024-11-20T10:00:00.000Z", patientId: 101, patientName: "María López",      branch: "Polanco"   },
  { treatmentId: 201, treatmentName: "Implante Dental",          budgetTotal: 32000, currency: "MXN", firstPaymentAt: "2024-04-05T10:00:00.000Z", lastPaymentAt: "2024-07-10T10:00:00.000Z", patientId: 202, patientName: "Carlos Ramírez",   branch: "Santa Fe"  },
  { treatmentId: 202, treatmentName: "Corona Cerámica",          budgetTotal: 12000, currency: "MXN", firstPaymentAt: "2024-07-10T10:00:00.000Z", lastPaymentAt: "2024-07-10T10:00:00.000Z", patientId: 202, patientName: "Carlos Ramírez",   branch: "Santa Fe"  },
  { treatmentId: 301, treatmentName: "Limpieza Profunda",        budgetTotal:  4500, currency: "MXN", firstPaymentAt: "2024-01-15T10:00:00.000Z", lastPaymentAt: "2024-07-15T10:00:00.000Z", patientId: 303, patientName: "Ana Gutiérrez",    branch: "Polanco"   },
  { treatmentId: 302, treatmentName: "Ortodoncia Metálica",      budgetTotal: 38000, currency: "MXN", firstPaymentAt: "2024-07-15T10:00:00.000Z", lastPaymentAt: "2025-01-15T10:00:00.000Z", patientId: 303, patientName: "Ana Gutiérrez",    branch: "Polanco"   },
  { treatmentId: 401, treatmentName: "Extracción Simple",        budgetTotal:  2200, currency: "MXN", firstPaymentAt: "2024-05-20T10:00:00.000Z", lastPaymentAt: "2024-05-20T10:00:00.000Z", patientId: 404, patientName: "Pedro Hernández",  branch: "Santa Fe"  },
];

const store = new InMemoryStateStore();

for (const r of DEMO_RECORDS) {
  await store.recordPatientTreatment(r);
}

console.log("\n═══════════════════════════════════════════════════");
console.log("  TODOS LOS PACIENTES CON TRATAMIENTOS (min=1)");
console.log("═══════════════════════════════════════════════════");
const all = await store.listRecurringPatients(1);
for (const p of all) {
  console.log(`\n  ${p.patientName} (${p.branch})`);
  console.log(`  Tratamientos: ${p.treatmentCount}   Total presupuesto: $${p.totalBudget.toLocaleString("es-MX")} MXN`);
  console.log(`  Primer pago: ${p.firstPaymentAt.slice(0,10)}   Último: ${p.lastPaymentAt.slice(0,10)}`);
  for (const t of p.treatments) {
    console.log(`    • [${t.treatmentId}] ${t.treatmentName} — $${t.budgetTotal.toLocaleString("es-MX")} MXN`);
  }
}

console.log("\n═══════════════════════════════════════════════════");
console.log("  SOLO RECURRENTES (min=2 tratamientos)");
console.log("═══════════════════════════════════════════════════");
const recurring = await store.listRecurringPatients(2);
console.log(`\n  ${recurring.length} pacientes recurrentes encontrados\n`);
for (const p of recurring) {
  console.log(`  ★ ${p.patientName} — ${p.treatmentCount} tratamientos — $${p.totalBudget.toLocaleString("es-MX")} MXN total`);
}
console.log();
