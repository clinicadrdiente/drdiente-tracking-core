import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles.css";

function App() {
  return (
    <TooltipProvider>
      <AppShell>
        <Dashboard />
      </AppShell>
      <Analytics />
    </TooltipProvider>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
