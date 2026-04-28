-- Overnight flag on tarefas
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS is_overnight BOOLEAN DEFAULT false;

-- Validation tracking on tarefas
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS validacao_status TEXT DEFAULT 'aguardando';
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS data_validacao_recebida TIMESTAMPTZ;
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS data_upload_meu_chapa TIMESTAMPTZ;
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS obs_validacao TEXT;

-- Per-chapa validation
ALTER TABLE public.chapas ADD COLUMN IF NOT EXISTS validacao_presenca TEXT DEFAULT 'pendente';
ALTER TABLE public.chapas ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMPTZ;

-- Backfill overnight flag using São Paulo timezone
UPDATE public.tarefas
SET is_overnight = true
WHERE EXTRACT(HOUR FROM (data_tarefa AT TIME ZONE 'America/Sao_Paulo')) >= 20
  AND (is_overnight IS NULL OR is_overnight = false);