ALTER TABLE public.turmas
ADD COLUMN IF NOT EXISTS subcategoria text;

COMMENT ON COLUMN public.turmas.subcategoria IS 'Subcategoria/modalidade da turma dentro do projeto.';

CREATE INDEX IF NOT EXISTS idx_turmas_projeto_subcategoria
ON public.turmas (projeto_id, subcategoria);
