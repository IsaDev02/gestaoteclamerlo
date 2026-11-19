// supabase/functions/ia-alunos/index.ts
// Deploy:  supabase functions deploy ia-alunos
// Segredo: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Fluxo: pergunta -> Claude (tool use) -> consulta estruturada validada
//        -> execução no Supabase COM o JWT do usuário (RLS vale) -> resultado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ======================= CONFIGURAÇÃO (AJUSTE AQUI) =======================
const MODELO = Deno.env.get("MODELO_IA") ?? "claude-haiku-5-5";

// Colunas da tabela `alunos` que a IA pode filtrar e o tipo de cada uma.
// Ajuste conforme o seu esquema real.
const COLUNAS: Record<string, "texto" | "booleano" | "data" | "presenca" | "projetos"> = {
  nome: "texto",
  genero: "texto",
  etnia: "texto",
  situacao_mae: "texto",
  situacao_pai: "texto",
  bairro: "texto",
  escola: "texto",
  cidade: "texto",
  periodo: "texto",
  ativo: "booleano",
  autorizacao_imagem: "booleano",
  foto: "presenca",
  whatsapp: "presenca",
  data_nascimento: "data",
  projetos: "projetos",
};

// "array" se `projetos` é text[]/jsonb; "texto" se for "1,3,5".
const PROJETOS_TIPO: "array" | "texto" = "array";

const NOMES_PROJETOS: Record<string, string> = {
  "1": "Adolescer para Crescer",
  "2": "Criança Certeza",
  "3": "Sempre Criança",
  "4": "Valorizando a Infância",
  "5": "Clube de Mães",
  "6": "Animar e Celebrar",
};

// Colunas devolvidas na lista de resultados.
const COLUNAS_AMOSTRA = "id,nome,data_nascimento,projetos,ativo";
// ==========================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VERSAO = "2026-11-19-b";
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ versao: VERSAO, ...body }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ----------------------------- datas / idade -----------------------------
function dataHaAnos(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}
function idadeDe(nasc: string | null): number | null {
  if (!nasc) return null;
  const n = new Date(nasc + "T00:00:00");
  if (isNaN(n.getTime())) return null;
  const h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) i--;
  return i;
}

// ------------------------------- filtros ---------------------------------
type Filtro = { campo: string; operador: string; valor?: string };

// deno-lint-ignore no-explicit-any
function aplicarFiltro(q: any, f: Filtro) {
  const { campo, operador } = f;
  const valor = f.valor ?? "";

  if (campo === "idade") {
    const n = Number(valor);
    if (!Number.isFinite(n)) throw new Error("Valor de idade inválido");
    q = q.not("data_nascimento", "is", null);
    switch (operador) {
      case "igual": return q.gt("data_nascimento", dataHaAnos(n + 1)).lte("data_nascimento", dataHaAnos(n));
      case "maior": return q.lte("data_nascimento", dataHaAnos(n + 1));
      case "maior_igual": return q.lte("data_nascimento", dataHaAnos(n));
      case "menor": return q.gt("data_nascimento", dataHaAnos(n));
      case "menor_igual": return q.gt("data_nascimento", dataHaAnos(n + 1));
      default: throw new Error(`Operador ${operador} não vale para idade`);
    }
  }

  const tipo = COLUNAS[campo];
  if (!tipo) throw new Error(`Campo não permitido: ${campo}`);

  if (tipo === "presenca") {
    if (operador === "vazio") return q.or(`${campo}.is.null,${campo}.eq.`);
    if (operador === "preenchido") return q.not(campo, "is", null).neq(campo, "");
    throw new Error(`Operador ${operador} não vale para ${campo}`);
  }

  if (tipo === "booleano") {
    const b = ["true", "sim", "1"].includes(valor.toLowerCase());
    return operador === "diferente" ? q.eq(campo, !b) : q.eq(campo, b);
  }

  if (tipo === "projetos") {
    if (!NOMES_PROJETOS[valor]) throw new Error("ID de projeto inválido");
    const cond = PROJETOS_TIPO === "array"
      ? (x: any) => x.contains("projetos", [valor])
      : (x: any) => x.ilike("projetos", `%${valor}%`);
    return operador === "diferente" ? q.not("projetos", PROJETOS_TIPO === "array" ? "cs" : "ilike", PROJETOS_TIPO === "array" ? `{${valor}}` : `%${valor}%`) : cond(q);
  }

  // texto / data
  switch (operador) {
    case "igual": return tipo === "texto" ? q.ilike(campo, valor) : q.eq(campo, valor);
    case "diferente": return tipo === "texto" ? q.not(campo, "ilike", valor) : q.neq(campo, valor);
    case "contem": return q.ilike(campo, `%${valor}%`);
    case "maior": return q.gt(campo, valor);
    case "maior_igual": return q.gte(campo, valor);
    case "menor": return q.lt(campo, valor);
    case "menor_igual": return q.lte(campo, valor);
    case "vazio": return q.or(`${campo}.is.null,${campo}.eq.`);
    case "preenchido": return q.not(campo, "is", null).neq(campo, "");
    default: throw new Error(`Operador desconhecido: ${operador}`);
  }
}

// deno-lint-ignore no-explicit-any
function aplicarFiltros(q: any, filtros: Filtro[]) {
  for (const f of filtros) q = aplicarFiltro(q, f);
  return q;
}

// ------------------- valores reais das colunas categóricas ----------------
let cacheValores: { quando: number; texto: string } | null = null;

// deno-lint-ignore no-explicit-any
async function valoresDistintos(supa: any): Promise<string> {
  if (cacheValores && Date.now() - cacheValores.quando < 10 * 60 * 1000) return cacheValores.texto;
  const cats = ["genero", "etnia", "situacao_mae", "situacao_pai", "periodo", "bairro", "escola", "cidade"];
  const sets: Record<string, Set<string>> = Object.fromEntries(cats.map((c) => [c, new Set<string>()]));
  for (let ini = 0; ini < 20000; ini += 1000) {
    const { data, error } = await supa.from("alunos").select(cats.join(",")).range(ini, ini + 999);
    if (error || !data?.length) break;
    for (const r of data) for (const c of cats) if (r[c]) sets[c].add(String(r[c]));
    if (data.length < 1000) break;
  }
  const linhas = cats
    .filter((c) => sets[c].size > 0 && sets[c].size <= 40)
    .map((c) => `- ${c}: ${[...sets[c]].map((v) => JSON.stringify(v)).join(", ")}`);
  const texto = linhas.join("\n");
  cacheValores = { quando: Date.now(), texto };
  return texto;
}

// ------------------------------ ferramentas ------------------------------
const CAMPOS_FILTRO = [...Object.keys(COLUNAS).filter((c) => c !== "data_nascimento"), "idade"];
const CAMPOS_AGRUPAR = ["genero", "etnia", "situacao_mae", "situacao_pai", "periodo", "bairro", "escola", "cidade", "ativo", "projetos", "idade"];

const TOOLS = [
  {
    name: "consultar_alunos",
    description: "Consulta a tabela de alunos aplicando filtros e devolve contagem, lista, ranking ou agrupamento.",
    input_schema: {
      type: "object",
      properties: {
        modo: {
          type: "string",
          enum: ["contagem", "lista", "ranking", "agrupamento"],
          description: "contagem = 'quantos'; lista = 'quais/quem/liste'; ranking = mais velho/mais novo; agrupamento = 'por bairro', 'distribuição de'.",
        },
        filtros: {
          type: "array",
          description: "Todos os filtros são combinados com E. Vazio = todos os alunos.",
          items: {
            type: "object",
            properties: {
              campo: { type: "string", enum: CAMPOS_FILTRO },
              operador: {
                type: "string",
                enum: ["igual", "diferente", "contem", "maior", "maior_igual", "menor", "menor_igual", "vazio", "preenchido"],
              },
              valor: { type: "string", description: "Texto. Booleano: 'true'/'false'. Idade: número. Projeto: ID '1' a '6'." },
            },
            required: ["campo", "operador"],
          },
        },
        ordenar_por: { type: "string", enum: ["idade_desc", "idade_asc", "nome"], description: "Para ranking (idade_desc = mais velho) ou lista." },
        limite: { type: "integer", description: "Itens na lista/ranking. Padrão 20, máximo 100." },
        agrupar_por: { type: "string", enum: CAMPOS_AGRUPAR, description: "Só para modo agrupamento." },
        resumo_filtro: { type: "string", description: "Descrição curta em português do filtro aplicado. Ex: 'ativos, sexo feminino, projeto Sempre Criança'." },
      },
      required: ["modo", "filtros", "resumo_filtro"],
    },
  },
  {
    name: "nao_consigo_responder",
    description: "Use quando a pergunta não é sobre os dados dos alunos ou está ambígua demais para consultar.",
    input_schema: {
      type: "object",
      properties: { mensagem: { type: "string", description: "Resposta curta em português explicando o que falta ou o que posso responder." } },
      required: ["mensagem"],
    },
  },
];

function montarSistema(valores: string): string {
  const hoje = new Date().toISOString().slice(0, 10);
  return `Você é o assistente de dados do Centro Social Irmã Tecla Merlo. Converta a pergunta do usuário em UMA chamada de ferramenta sobre a tabela "alunos". Hoje é ${hoje}.

Campos: nome, genero, etnia, situacao_mae, situacao_pai (presente/ausente/falecido), bairro, escola, cidade, periodo, ativo (booleano), autorizacao_imagem (booleano), foto e whatsapp (preenchido/vazio), projetos (ID 1 a 6) e idade (calculada).
Projetos: ${Object.entries(NOMES_PROJETOS).map(([id, n]) => `${id}=${n}`).join("; ")}.

Valores reais encontrados na base (use-os EXATAMENTE como estão; para variações use operador "contem" com um trecho):
${valores || "(sem valores categóricos disponíveis)"}

Regras:
- "ativos" => ativo igual 'true'; "inativos" => ativo igual 'false'. Se a pergunta não disser, NÃO filtre por status.
- "pai ou mãe ausente" não tem OU nativo: use o campo mais provável e explique em resumo_filtro; se precisar dos dois, prefira responder com nao_consigo_responder pedindo para perguntar separadamente.
- Idade: "mais de 12 anos" => idade maior 12; "12 anos ou mais" => maior_igual; "entre 8 e 10" => dois filtros (maior_igual 8 e menor_igual 10).
- "Quantos" => contagem. "Quais/quem/liste" => lista. "Mais velho/novo" => ranking com limite 1 (ou o número pedido).
- Perguntas de acompanhamento ("e dessas...", "e só as ativas?") herdam os filtros da consulta anterior, que aparece no histórico como "Consulta executada: {...}".
- Nunca invente campos. Se a pergunta não for sobre alunos, use nao_consigo_responder.`;
}

// --------------------------------- handler -------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ erro: "Não autenticado" }, 401);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: erroAuth } = await supa.auth.getUser(token);
    if (erroAuth || !user) return json({ erro: "Sessão inválida" }, 401);

    const { pergunta, historico, ping } = await req.json();
    if (ping) return json({ ok: true });
    if (!pergunta || typeof pergunta !== "string" || pergunta.length > 1000) return json({ erro: "Pergunta inválida" }, 400);

    const valores = await valoresDistintos(supa);

    const msgs = (Array.isArray(historico) ? historico : [])
      .filter((m: any) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
      .slice(-6)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    msgs.push({ role: "user", content: pergunta });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1024,
        system: montarSistema(valores),
        tools: TOOLS,
        tool_choice: { type: "any" },
        messages: msgs,
      }),
    });
    if (!r.ok) {
      const corpo = await r.text();
      console.error("Anthropic respondeu", r.status, corpo);
      return json({ erro: `Falha na IA (${r.status}): ${corpo.slice(0, 300)}` }, 502);
    }
    const resp = await r.json();
    const uso = resp.content?.find((b: any) => b.type === "tool_use");
    if (!uso) return json({ modo: "mensagem", mensagem: "Não consegui interpretar a pergunta." });

    if (uso.name === "nao_consigo_responder") return json({ modo: "mensagem", mensagem: uso.input.mensagem });

    const c = uso.input;
    const filtros: Filtro[] = Array.isArray(c.filtros) ? c.filtros : [];
    const limite = Math.min(Math.max(Number(c.limite) || 20, 1), 100);
    const base = (sel: string, opts?: Record<string, unknown>) => aplicarFiltros(supa.from("alunos").select(sel, opts), filtros);

    // ---- contagem ----
    if (c.modo === "contagem") {
      const { count, error } = await base("id", { count: "exact", head: true });
      if (error) throw error;
      return json({ modo: "contagem", total: count ?? 0, amostra: [], resumo_filtro: c.resumo_filtro, consulta: c });
    }

    // ---- agrupamento ----
    if (c.modo === "agrupamento") {
      const g = c.agrupar_por;
      if (!CAMPOS_AGRUPAR.includes(g)) return json({ modo: "mensagem", mensagem: "Não sei agrupar por esse campo." });
      const coluna = g === "idade" ? "data_nascimento" : g;
      const contagem = new Map<string, number>();
      let total = 0;
      for (let ini = 0; ini < 20000; ini += 1000) {
        const { data, error } = await base(`id,${coluna}`).order("id").range(ini, ini + 999);
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data) {
          total++;
          let chaves: string[];
          if (g === "idade") chaves = [String(idadeDe(row.data_nascimento) ?? "Sem data")];
          else if (g === "projetos") {
            const arr = Array.isArray(row.projetos) ? row.projetos : String(row.projetos ?? "").split(",");
            chaves = arr.map((x: unknown) => NOMES_PROJETOS[String(x).trim()] ?? "").filter(Boolean);
            if (!chaves.length) chaves = ["Sem projeto"];
          } else if (g === "ativo") chaves = [row.ativo ? "Ativo" : "Inativo"];
          else chaves = [row[g] ? String(row[g]) : "Não informado"];
          for (const k of chaves) contagem.set(k, (contagem.get(k) ?? 0) + 1);
        }
        if (data.length < 1000) break;
      }
      const grupos = [...contagem.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
      return json({ modo: "agrupamento", total, grupos, agrupar_por: g, amostra: [], resumo_filtro: c.resumo_filtro, consulta: c });
    }

    // ---- lista / ranking ----
    let q = base(COLUNAS_AMOSTRA, { count: "exact" });
    if (c.modo === "ranking" || c.ordenar_por?.startsWith("idade")) {
      q = q.not("data_nascimento", "is", null).order("data_nascimento", { ascending: c.ordenar_por !== "idade_asc" });
    } else {
      q = q.order("nome");
    }
    const { data, count, error } = await q.limit(limite);
    if (error) throw error;
    const amostra = (data ?? []).map((a: any) => ({ ...a, idade: idadeDe(a.data_nascimento) }));
    return json({
      modo: c.modo === "ranking" ? "ranking" : "lista",
      ordenar_por: c.ordenar_por ?? null,
      total: count ?? amostra.length,
      amostra,
      resumo_filtro: c.resumo_filtro,
      consulta: c,
    });
  } catch (e) {
    console.error(e);
    return json({ erro: String((e as Error).message ?? e) }, 500);
  }
});
