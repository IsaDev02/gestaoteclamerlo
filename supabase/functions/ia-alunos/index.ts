// supabase/functions/ia-alunos/index.ts
//
// Edge Function que recebe uma pergunta em português sobre a base de alunos,
// pede para a Claude (via tool use) traduzi-la em filtros estruturados, e então
// consulta a tabela `alunos` no Supabase (com a service role key, sem expor
// nenhuma chave no navegador) para calcular a resposta real.
//
// Deploy:
//   supabase functions deploy ia-alunos
//
// Secrets necessárias (a SUPABASE_URL e a SUPABASE_SERVICE_ROLE_KEY já ficam
// disponíveis automaticamente dentro de toda Edge Function — não precisa configurar):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOMES_PROJETOS: Record<string, string> = {
  "1": "Adolescer para Crescer",
  "2": "Criança Certeza",
  "3": "Sempre Criança",
  "4": "Valorizando a Infância",
  "5": "Clube de Mães",
  "6": "Animar e Celebrar",
};

// ── Ferramenta que a Claude deve preencher a partir da pergunta ──────────
const TOOL_BUSCAR_ALUNOS = {
  name: "buscar_alunos",
  description:
    "Filtra a base de alunos do Centro Social de acordo com os critérios identificados na pergunta do usuário.",
  input_schema: {
    type: "object",
    properties: {
      ativo: {
        type: ["boolean", "null"],
        description: "true = somente ativos, false = somente inativos, null = não filtrar por status",
      },
      genero: { type: ["string", "null"], enum: ["MASCULINO", "FEMININO", null] },
      etnia_contem: {
        type: ["string", "null"],
        description: "trecho a procurar no campo etnia, ex: 'pardo', 'negro', 'branco'",
      },
      situacao_mae: { type: ["string", "null"], enum: ["PRESENTE", "AUSENTE", "FALECIDA", null] },
      situacao_pai: { type: ["string", "null"], enum: ["PRESENTE", "AUSENTE", "FALECIDO", null] },
      situacao_pai_ou_mae: {
        type: ["string", "null"],
        description: "usar quando a pergunta disser 'pai OU mãe' com a mesma condição, em vez de preencher os dois campos acima",
        enum: ["PRESENTE", "AUSENTE", "FALECIDO", null],
      },
      projeto_id: { type: ["string", "null"], enum: ["1", "2", "3", "4", "5", "6", null] },
      idade_min: { type: ["number", "null"] },
      idade_max: { type: ["number", "null"] },
      bairro_contem: { type: ["string", "null"] },
      escola_contem: { type: ["string", "null"] },
      cidade_contem: { type: ["string", "null"] },
      periodo: { type: ["string", "null"], enum: ["Matutino", "Vespertino", "Noturno", "Integral", null] },
      tem_foto: { type: ["boolean", "null"] },
      tem_whatsapp: { type: ["boolean", "null"] },
      autorizacao_imagem: { type: ["boolean", "null"] },
      resumo_filtro: {
        type: "string",
        description: "frase curta e natural em português descrevendo o filtro aplicado, para mostrar ao usuário",
      },
    },
    required: ["resumo_filtro"],
  },
};

// ── Helpers de dados (mesma lógica usada no front-end) ────────────────────
function normalizar(s: unknown): string {
  return (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isAtivo(a: any): boolean {
  if (typeof a.ativo === "boolean") return a.ativo;
  return ["sim", "true", "ativo", "1", "s", "t"].includes(normalizar(a.ativo));
}

function calcularIdade(a: any): number | null {
  if (a.data_nascimento) {
    const nasc = new Date(a.data_nascimento + "T00:00:00");
    if (!isNaN(nasc.getTime())) {
      const hoje = new Date();
      let idade = hoje.getFullYear() - nasc.getFullYear();
      if (
        hoje.getMonth() < nasc.getMonth() ||
        (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())
      ) {
        idade--;
      }
      return idade;
    }
  }
  return a.idade ?? null;
}

function alunoTemProjeto(a: any, id: string): boolean {
  const arr = Array.isArray(a.projetos) ? a.projetos.map(String) : a.projetos ? String(a.projetos).split(",") : [];
  return arr.map((x: string) => x.trim()).includes(String(id));
}

function aplicarFiltros(alunos: any[], f: any) {
  return alunos.filter((a) => {
    if (f.ativo === true && !isAtivo(a)) return false;
    if (f.ativo === false && isAtivo(a)) return false;
    if (f.genero && normalizar(a.genero) !== normalizar(f.genero)) return false;
    if (f.etnia_contem && !normalizar(a.etnia).includes(normalizar(f.etnia_contem))) return false;
    if (f.situacao_mae && !normalizar(a.situacao_mae).startsWith(normalizar(f.situacao_mae).slice(0, 5))) return false;
    if (f.situacao_pai && !normalizar(a.situacao_pai).startsWith(normalizar(f.situacao_pai).slice(0, 5))) return false;
    if (f.situacao_pai_ou_mae) {
      const alvo = normalizar(f.situacao_pai_ou_mae).slice(0, 5);
      const okMae = normalizar(a.situacao_mae).startsWith(alvo);
      const okPai = normalizar(a.situacao_pai).startsWith(alvo);
      if (!okMae && !okPai) return false;
    }
    if (f.projeto_id && !alunoTemProjeto(a, f.projeto_id)) return false;
    if (f.idade_min != null || f.idade_max != null) {
      const idade = calcularIdade(a);
      if (idade == null) return false;
      if (f.idade_min != null && idade < f.idade_min) return false;
      if (f.idade_max != null && idade > f.idade_max) return false;
    }
    if (f.bairro_contem && !normalizar(a.bairro).includes(normalizar(f.bairro_contem))) return false;
    if (f.escola_contem && !normalizar(a.escola).includes(normalizar(f.escola_contem))) return false;
    if (f.cidade_contem && !normalizar(a.cidade).includes(normalizar(f.cidade_contem))) return false;
    if (f.periodo && normalizar(a.periodo) !== normalizar(f.periodo)) return false;
    if (f.tem_foto === true && !a.foto) return false;
    if (f.tem_foto === false && a.foto) return false;
    if (f.tem_whatsapp === true && !a.whatsapp) return false;
    if (f.tem_whatsapp === false && a.whatsapp) return false;
    if (f.autorizacao_imagem === true && !a.autorizacao_imagem) return false;
    if (f.autorizacao_imagem === false && a.autorizacao_imagem) return false;
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pergunta, historico } = await req.json();

    if (!pergunta || typeof pergunta !== "string") {
      return new Response(JSON.stringify({ erro: "Campo 'pergunta' é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ erro: "ANTHROPIC_API_KEY não configurada. Rode: supabase secrets set ANTHROPIC_API_KEY=..." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 1) Pede para a Claude traduzir a pergunta em filtros estruturados ──
    const hojeStr = new Date().toISOString().slice(0, 10);
    const listaProjetos = Object.entries(NOMES_PROJETOS)
      .map(([id, nome]) => `${id}: ${nome}`)
      .join("\n");

    const systemPrompt = `Você é um interpretador de perguntas para o sistema de gestão do Centro Social Irmã Tecla Merlo (projeto social infantil no Brasil).
Sua única tarefa é analisar a pergunta do usuário sobre a base de alunos e chamar a ferramenta "buscar_alunos" com os filtros corretos. Não responda em texto livre, apenas chame a ferramenta.

Data de hoje: ${hojeStr}.

Projetos disponíveis (id: nome):
${listaProjetos}

Regras:
- Preencha SOMENTE os campos que a pergunta realmente menciona ou implica claramente. Deixe os demais como null.
- Se a pergunta mencionar "pai ou mãe" com a mesma condição (ex: "pai ou mãe ausente"), use o campo situacao_pai_ou_mae e NÃO preencha situacao_pai/situacao_mae separadamente.
- Palavras como "cadastrados", "no total", "no geral" normalmente significam que NÃO há filtro de status — deixe "ativo" como null.
- Considere o histórico da conversa para perguntas de acompanhamento (ex: "e dessas, quantas têm foto?" deve herdar o filtro da pergunta anterior).
- Sempre preencha "resumo_filtro" com uma frase curta e natural em português descrevendo o filtro aplicado (ex.: "alunas ativas do sexo feminino").`;

    const mensagens: { role: string; content: string }[] = [];
    if (Array.isArray(historico)) {
      for (const h of historico.slice(-6)) {
        if (h && typeof h.content === "string") {
          mensagens.push({ role: h.role === "user" ? "user" : "assistant", content: h.content });
        }
      }
    }
    mensagens.push({ role: "user", content: pergunta });

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: mensagens,
        tools: [TOOL_BUSCAR_ALUNOS],
        tool_choice: { type: "tool", name: "buscar_alunos" },
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("Erro Claude API:", errText);
      return new Response(JSON.stringify({ erro: "Erro ao consultar a Claude API.", detalhe: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeResp.json();
    const toolUse = (claudeData.content || []).find((b: any) => b.type === "tool_use" && b.name === "buscar_alunos");

    if (!toolUse) {
      return new Response(JSON.stringify({ erro: "A IA não retornou um filtro estruturado." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filtros = toolUse.input || {};

    // ── 2) Consulta a base real no Supabase (service role — bypassa RLS) ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    let todos: any[] = [];
    let inicio = 0;
    const tamanhoPagina = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin.from("alunos").select("*").range(inicio, inicio + tamanhoPagina - 1);
      if (error) {
        return new Response(JSON.stringify({ erro: "Erro ao consultar Supabase.", detalhe: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!data || data.length === 0) break;
      todos = todos.concat(data);
      if (data.length < tamanhoPagina) break;
      inicio += tamanhoPagina;
    }

    const resultadoCompleto = aplicarFiltros(todos, filtros);
    const amostra = resultadoCompleto.slice(0, 20).map((a) => ({
      id: a.id,
      nome: a.nome,
      projetos: a.projetos,
      ativo: isAtivo(a),
    }));

    return new Response(
      JSON.stringify({
        resumo_filtro: filtros.resumo_filtro || "critério identificado",
        total: resultadoCompleto.length,
        amostra,
        filtros_aplicados: filtros,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ erro: "Erro interno na função.", detalhe: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
