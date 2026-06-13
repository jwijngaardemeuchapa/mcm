import { useEffect, useState } from "react";
import { openUrl as tauriOpen } from "@tauri-apps/plugin-opener";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Carteira from "./pages/Carteira";
import Importar from "./pages/Importar";
import Historico from "./pages/Historico";
import Consultor from "./pages/Consultor";
import BIDDashboard from "./pages/BIDDashboard";
import ContadorTarefas from "./pages/ContadorTarefas";
import Configuracoes from "./pages/Configuracoes";
import Integracoes from "./pages/Integracoes";
import Ajuda from "./pages/Ajuda";
import AnaliseBase from "./pages/AnaliseBase";
import FillrateDetalhe from "./pages/FillrateDetalhe";
import Tendencias from "./pages/Tendencias";
import ChapaBook from "./pages/ChapaBook";
import ClienteBook from "./pages/ClienteBook";
import Agenda from "./pages/Agenda";
import Lembretes from "./pages/Lembretes";
import DisparosUmbler from "./pages/DisparosUmbler";
import RespostaLog from "./pages/RespostaLog";
import NotFound from "./pages/NotFound";
import { UndoProvider } from "./lib/undo";
import { WatcherProvider } from "./lib/WatcherContext";
import { IntroScreen } from "./components/IntroScreen";
import { shouldShowIntro } from "./lib/introLogic";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const isTauri = "__TAURI_INTERNALS__" in window;

function useExternalLinks() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("http")) return;
      if (isTauri) {
        e.preventDefault();
        tauriOpen(href).catch(() => {
          window.open(href, "_blank", "noopener,noreferrer");
        });
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
}

const App = () => {
  useExternalLinks();
  const [showIntro, setShowIntro] = useState(() => shouldShowIntro());

  useEffect(() => {
    const handler = () => setShowIntro(true);
    window.addEventListener("mcm:show-intro", handler);
    return () => window.removeEventListener("mcm:show-intro", handler);
  }, []);

  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    {showIntro && <IntroScreen onDone={() => setShowIntro(false)} />}
    <TooltipProvider>
      <UndoProvider>
        <WatcherProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/carteira" element={<Carteira />} />
              <Route path="/importar" element={<Importar />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/consultor" element={<Consultor />} />
              <Route path="/bid" element={<BIDDashboard />} />
              <Route path="/contador" element={<ContadorTarefas />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/integracoes" element={<Integracoes />} />
              <Route path="/ajuda" element={<Ajuda />} />
              <Route path="/analise" element={<AnaliseBase />} />
              <Route path="/fillrate" element={<FillrateDetalhe />} />
              <Route path="/tendencias" element={<Tendencias />} />
              <Route path="/chapas" element={<ChapaBook />} />
              <Route path="/clientes" element={<ClienteBook />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/lembretes" element={<Lembretes />} />
              <Route path="/disparos" element={<DisparosUmbler />} />
              <Route path="/respostas" element={<RespostaLog />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </WatcherProvider>
      </UndoProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
