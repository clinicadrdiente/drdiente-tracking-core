import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { CierreForm } from "./cierre/CierreForm";

const root = document.getElementById("cierre-root");

if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <CierreForm />
    <Analytics />
  </StrictMode>,
);
