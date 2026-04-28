ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS observacoes_updated_at TIMESTAMPTZ;