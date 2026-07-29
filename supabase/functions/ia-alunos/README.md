# Edge Function `ia-alunos`

Interpreta perguntas em português sobre a base de alunos usando a Claude
(via *tool use*) e consulta a tabela `alunos` no Supabase para dar a
resposta real. É chamada pela página `ia.html`.

## Pré-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado
- Estar logado: `supabase login`
- Projeto já linkado: `supabase link --project-ref paadzisqttrkbscehcmh`
- Uma chave de API da Anthropic (https://console.anthropic.com → API Keys)

## Estrutura de pastas esperada no seu repositório

```
supabase/
  functions/
    ia-alunos/
      index.ts
```

(Se você ainda não tem a pasta `supabase/` na raiz do projeto, crie-a com
`supabase init` — o repositório já tem `supabase/migrations`, então essa
pasta provavelmente já existe.)

## 1. Configurar a chave secreta

A `SUPABASE_URL` e a `SUPABASE_SERVICE_ROLE_KEY` já ficam disponíveis
automaticamente dentro de toda Edge Function — **não precisa configurar
essas duas**. Só falta a chave da Anthropic:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
```

## 2. Deploy

```bash
supabase functions deploy ia-alunos
```

Isso publica a função em:
```
https://paadzisqttrkbscehcmh.supabase.co/functions/v1/ia-alunos
```

Esse endereço já está configurado em `ia.html` (constante
`EDGE_FUNCTION_URL`), então não precisa alterar nada no front-end.

## 3. Segurança

Por padrão, a função **exige um usuário autenticado** (o Supabase CLI já
protege por JWT automaticamente ao fazer o deploy sem a flag
`--no-verify-jwt`). Isso significa que só quem estiver logado no sistema
(`index.html`) consegue chamá-la — importante para não deixar sua chave da
Anthropic ser consumida por qualquer visitante.

Se um dia quiser desabilitar essa exigência (não recomendado), o deploy
seria:
```bash
supabase functions deploy ia-alunos --no-verify-jwt
```

## 4. Testando

```bash
curl -i --location --request POST \
  'https://paadzisqttrkbscehcmh.supabase.co/functions/v1/ia-alunos' \
  --header 'Authorization: Bearer SEU_ACCESS_TOKEN_DE_USUARIO_LOGADO' \
  --header 'apikey: sb_publishable_FQsB5Jx26X9H6eD77heXtw_jzda0lcC' \
  --header 'Content-Type: application/json' \
  --data '{"pergunta":"quantas alunas do sexo feminino estão ativas"}'
```

Resposta esperada:
```json
{
  "resumo_filtro": "alunas ativas do sexo feminino",
  "total": 42,
  "amostra": [ { "id": 12, "nome": "...", "projetos": ["1"], "ativo": true }, ... ],
  "filtros_aplicados": { "ativo": true, "genero": "FEMININO", "resumo_filtro": "..." }
}
```

## 5. Custos

Cada pergunta gera 1 chamada à API da Anthropic usando o modelo
`claude-haiku-4-5-20251001` (rápido e econômico, ideal para essa tarefa de
extração estruturada). Se quiser respostas mais sofisticadas em perguntas
muito ambíguas, troque o valor de `model` em `index.ts` por
`claude-sonnet-5`.

## 6. Se a função cair ou não estiver implantada

A página `ia.html` tem um **interpretador local (regras/regex)** como
fallback automático — se a chamada à Edge Function falhar por qualquer
motivo (rede, função não implantada, erro na Anthropic), o assistente
continua respondendo localmente, apenas avisando na conversa que está no
"modo offline".
