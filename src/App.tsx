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
import BID from "./pages/BID";
import ContadorTarefas from "./pages/ContadorTarefas";
import NotFound from "./pages/NotFound";
import { UndoProvider } from "./lib/undo";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <UndoProvider>
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
              <Route path="/bid" element={<BID />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </UndoProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
