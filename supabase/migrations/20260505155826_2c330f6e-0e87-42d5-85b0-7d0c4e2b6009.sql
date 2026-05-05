CREATE TABLE public.validacoes_tardias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_tarefa_retroativa INTEGER NOT NULL,
  data_tarefa_retroativa TIMESTAMP WITH TIME ZONE,
  id_tarefa_original INTEGER,
  data_tarefa_original TIMESTAMP WITH TIME ZONE,
  data_validacao_cliente TIMESTAMP WITH TIME ZONE NOT NULL,
  motivo TEXT NOT NULL,
  observacao TEXT,
  empresa TEXT,
  registrado_por TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.validacoes_tardias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all" ON public.validacoes_tardias FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_validacoes_tardias_data_validacao ON public.validacoes_tardias(data_validacao_cliente DESC);
CREATE INDEX idx_validacoes_tardias_id_tarefa_retro ON public.validacoes_tardias(id_tarefa_retroativa);