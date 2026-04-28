
-- Carteira (portfolio companies)
CREATE TABLE public.carteira (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_fantasia TEXT NOT NULL,
  cnpj TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(nome_fantasia)
);

-- Tarefas
CREATE TABLE public.tarefas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  id_tarefa INTEGER NOT NULL,
  data_tarefa TIMESTAMPTZ NOT NULL,
  cidade_uf TEXT,
  empresa TEXT NOT NULL,
  cnpj TEXT,
  status_tarefa TEXT NOT NULL,
  quantidade_chapas INTEGER DEFAULT 0,
  importado_em TIMESTAMPTZ DEFAULT now(),
  ativo BOOLEAN DEFAULT true
);
CREATE INDEX idx_tarefas_id_tarefa ON public.tarefas(id_tarefa);
CREATE INDEX idx_tarefas_data ON public.tarefas(data_tarefa);

-- Chapas
CREATE TABLE public.chapas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  id_tarefa INTEGER NOT NULL,
  nome_chapa TEXT,
  telefone_chapa TEXT,
  cpf TEXT,
  status_contato TEXT DEFAULT 'pendente',
  canal_contato TEXT,
  data_contato TIMESTAMPTZ,
  data_remocao TIMESTAMPTZ,
  motivo_remocao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chapas_id_tarefa ON public.chapas(id_tarefa);

-- FUP dispatch log
CREATE TABLE public.fup_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  id_tarefa INTEGER NOT NULL,
  data_disparo TIMESTAMPTZ DEFAULT now(),
  canal TEXT NOT NULL,
  observacao TEXT
);
CREATE INDEX idx_fup_log_id_tarefa ON public.fup_log(id_tarefa);

-- Notifications sent log
CREATE TABLE public.notificacoes_enviadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  id_tarefa INTEGER,
  referencia_data DATE NOT NULL,
  disparada_em TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notif_lookup ON public.notificacoes_enviadas(tipo, id_tarefa, referencia_data);

-- RLS: single-user internal tool, permissive public access
ALTER TABLE public.carteira ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_enviadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all" ON public.carteira FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.tarefas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.chapas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.fup_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.notificacoes_enviadas FOR ALL USING (true) WITH CHECK (true);
