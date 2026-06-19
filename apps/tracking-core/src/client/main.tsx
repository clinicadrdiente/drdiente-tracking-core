import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClientApp } from "./client-app";
import "../ui/styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <ClientApp />
  </StrictMode>,
);
