import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { AppShell } from "@/components/app-shell";
import { AgndexShell } from "@/components/agndex-shell";
import { Dashboard } from "@/components/dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles.css";

// #/reunion-nueva estrena el armazón con la estructura de Agndex. El resto del
// panel sigue con AppShell, así se pueden comparar lado a lado sin dejar a
// medias la vista que usan los dueños. Cuando se apruebe, AgndexShell pasa a
// ser el armazón de todas las rutas y esto se simplifica.
const RUTAS_ARMAZON_NUEVO = ["reunion-nueva"];

function useArmazonNuevo() {
  const leer = () =>
    RUTAS_ARMAZON_NUEVO.includes(
      window.location.hash.replace(/^#\/?/, "").split("?")[0],
    );
  const [nuevo, setNuevo] = useState(leer);
  useEffect(() => {
    const alCambiar = () => setNuevo(leer());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);
  return nuevo;
}

function App() {
  const armazonNuevo = useArmazonNuevo();
  const Armazon = armazonNuevo ? AgndexShell : AppShell;
  return (
    <TooltipProvider>
      <Armazon>
        <Dashboard />
      </Armazon>
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
