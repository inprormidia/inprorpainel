import { useState, useEffect, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Btn, EmptyState, Badge, CellPicker, MenuItem, MenuData, cls,
} from "../../components/ui/InprorComponents";
import TextoFormatado from "../../components/ui/TextoFormatado";
import { useAuth, useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

interface ReportRow {
  id: string; client_id: string | null;
  title: string; period: string | null; url: string | null;
  content: string | null; publicado: boolean;
  reference_date: string | null;
  department_id: string | null;
  tags: string[];
  created_at: string; updated_at?: string | null;
}

interface ArquivoRow {
  id: string; name: string; storage_path: string;
  mime: string | null; size_bytes: number | null;
  created_at: string;
}

interface DeptLite { id: string; name: string; color: string; ordem: number; active: boolean; }

const hoje = () => new Date().toISOString().slice(0, 10);

const fmtDataCurta = (d: string | null) => {
  if (!d) return "Sem data";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const LIMITE_MB = 25;

const fmtTamanho = (b: number | null) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

// Marcador curto no lugar de icone: le melhor e nao depende de imagem.
// Sai do caminho guardado, nao do nome exibido, porque o nome pode ser
// trocado por um rotulo sem extensao, tipo "Recibo de fevereiro".
const extensao = (nome: string) => {
  const e = /\.([a-z0-9]{1,5})$/i.exec(nome);
  return e ? e[1].toUpperCase().slice(0, 4) : "ARQ";
};

const lastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (p: string | null) => {
  if (!p) return "Sem periodo";
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const nome = new Date(Number(m[1]), Number(m[2]) - 1)
    .toLocaleString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};

const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const MODELO = `## Resumo do periodo

Escreva aqui a leitura geral do mes.

## Numeros

- Alcance:
- Seguidores ganhos:
- Pedidos:

## Destaques

1. O que funcionou e por que
2. O que nao funcionou

## Proximos passos

- [ ] Acao para o proximo periodo
`;

// Descobre o endereco da imagem em uma colagem que nao trouxe o
// arquivo. O Notion e parecidos mandam ora html com <img>, ora o
// texto em markdown, ora so o endereco solto.
function enderecoDaColagem(dados: DataTransfer): string | null {
  const html = dados.getData("text/html");
  const noHtml = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (noHtml && /^https?:\/\//i.test(noHtml[1])) return noHtml[1];

  const texto = (dados.getData("text/plain") || "").trim();
  if (!texto || texto.includes("\n")) return null;

  const markdown = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/.exec(texto);
  if (markdown) return markdown[1];

  if (/^https?:\/\/\S+$/.test(texto) &&
      /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i.test(texto)) return texto;

  return null;
}

export default function Relatorios() {
  const { user } = useAuth();
  const { scopedClientId, authLoading, isStaff, adminClientId, setAdminClientId, adminClients } = useClientScope();

  const [rows, setRows]       = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState<string | null>(null);

  // documento aberto
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [corpo, setCorpo]       = useState("");
  const [tituloDraft, setTituloDraft] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // documentos guardados junto do relatorio, fora do texto
  const [anexos, setAnexos] = useState<ArquivoRow[]>([]);
  const [confirmAnexo, setConfirmAnexo] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeDraft, setNomeDraft]   = useState("");

  const [criando, setCriando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [depts, setDepts]     = useState<DeptLite[]>([]);
  // filtros da lista
  const [filtroDept, setFiltroDept] = useState<string>("todos");
  const [filtroTag, setFiltroTag]   = useState<string>("todas");

  const fileRef  = useRef<HTMLInputElement>(null);
  const anexoRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    let q = supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (!isStaff && scopedClientId) q = q.eq("client_id", scopedClientId);
    else if (isStaff && adminClientId) q = q.eq("client_id", adminClientId);
    Promise.all([
      q,
      supabase.from("departments").select("id,name,color,ordem,active").order("ordem"),
    ]).then(([r, d]) => {
      setRows((r.data as ReportRow[]) ?? []);
      setDepts((d.data as DeptLite[]) ?? []);
      setLoading(false);
    });
  }, [scopedClientId, adminClientId, isStaff, authLoading]);

  const aberto = rows.find(r => r.id === abertoId) ?? null;

  useEffect(() => {
    setConfirmAnexo(null);
    if (!abertoId) { setAnexos([]); return; }
    let vivo = true;
    supabase.from("report_files")
      .select("id,name,storage_path,mime,size_bytes,created_at")
      .eq("report_id", abertoId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (vivo) setAnexos((data as ArquivoRow[]) ?? []); });
    return () => { vivo = false; };
  }, [abertoId]);

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";
  const dept = (id: string | null) => (id ? depts.find(d => d.id === id) : undefined);

  // etiquetas ja usadas, para sugerir em vez de digitar de novo
  const tagsExistentes = [...new Set(rows.flatMap(r => r.tags ?? []))].sort();

  async function alternarTag(r: ReportRow, tag: string) {
    const atuais = r.tags ?? [];
    const novas = atuais.includes(tag)
      ? atuais.filter(t => t !== tag)
      : [...atuais, tag];
    await salvarCampos(r.id, { tags: novas });
  }

  function abrir(r: ReportRow) {
    setAbertoId(r.id);
    setCorpo(r.content ?? "");
    setTituloDraft(r.title);
    setEditando(!r.content);
    setConfirmDel(false);
    setErro(null);
  }

  async function salvarCampos(id: string, mudancas: Partial<ReportRow>) {
    const backup = rows;
    setRows(cur => cur.map(r => r.id === id ? { ...r, ...mudancas } : r));
    const { error } = await supabase.from("reports").update(mudancas).eq("id", id);
    if (error) { setRows(backup); setErro("Nao foi possivel salvar: " + error.message); }
  }

  async function salvarCorpo() {
    if (!aberto) return;
    setSalvando(true);
    await salvarCampos(aberto.id, { content: corpo || null });
    setSalvando(false);
    setEditando(false);
  }

  // cria e ja abre o documento: os campos sao editados nele mesmo
  async function criar() {
    const alvo = isStaff ? (adminClientId || null) : scopedClientId;
    const periodo = lastMonth();
    setCriando(true);
    const { data, error } = await supabase.from("reports").insert({
      client_id: alvo,
      title: `Relatorio de ${periodLabel(periodo)}`,
      period: periodo,
      reference_date: hoje(),
      tags: [],
      content: MODELO,
      publicado: false,
      author_id: user?.id ?? null,
    }).select().single();
    setCriando(false);
    if (error) { setErro("Nao foi possivel criar: " + error.message); return; }
    const novo = data as ReportRow;
    setRows(cur => [novo, ...cur]);
    abrir(novo);
  }

  async function excluir() {
    if (!aberto) return;
    const { error } = await supabase.from("reports").delete().eq("id", aberto.id);
    if (error) { setErro("Nao foi possivel excluir."); return; }
    setRows(cur => cur.filter(r => r.id !== aberto.id));
    setAbertoId(null);
  }

  // Colar imagem funciona em qualquer ponto do relatorio aberto,
  // inclusive em modo leitura: o print vai direto da area de
  // transferencia para o texto, sem precisar salvar arquivo antes.
  useEffect(() => {
    if (!abertoId || !isStaff) return;

    const aoColar = (e: ClipboardEvent) => {
      const dados = e.clipboardData;
      if (!dados) return;

      // 1. print de tela e arquivo copiado vem como arquivo
      for (const item of dados.items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const arq = item.getAsFile();
          if (arq) {
            e.preventDefault();
            if (!editando) { setCorpo(aberto?.content ?? ""); setEditando(true); }
            enviarImagem(arq);
          }
          return;
        }
      }

      // 2. copiado de uma pagina, como o Notion, o arquivo nao vem
      // junto: vem so o endereco, ora dentro de um trecho de html,
      // ora como texto. Em ambos os casos precisamos buscar a imagem
      // e guardar aqui, porque esses enderecos expiram em horas.
      const endereco = enderecoDaColagem(dados);
      if (!endereco) return;

      e.preventDefault();
      if (!editando) { setCorpo(aberto?.content ?? ""); setEditando(true); }
      setSubindo(true);
      setErro(null);

      fetch(endereco)
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
        .then(blob => {
          if (!blob.type.startsWith("image/")) throw new Error("tipo inesperado");
          const nome = (endereco.split("/").pop() ?? "imagem")
            .split("?")[0].slice(0, 60) || "imagem.png";
          return enviarImagem(new File([blob], nome, { type: blob.type }));
        })
        .catch(() => {
          setSubindo(false);
          setErro(
            "O site de origem nao deixa o painel baixar essa imagem. " +
            "Abra a imagem la, clique com o botao direito, escolha " +
            "copiar imagem e cole de novo. Arrastar o arquivo para ca " +
            "tambem funciona."
          );
        });
    };

    const aoArrastar = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setArrastando(true); }
    };
    const aoSair = (e: DragEvent) => {
      if (e.relatedTarget === null) setArrastando(false);
    };
    const aoSoltar = (e: DragEvent) => {
      const arq = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith("image/"));
      e.preventDefault();
      setArrastando(false);
      if (!arq) return;
      if (!editando) { setCorpo(aberto?.content ?? ""); setEditando(true); }
      enviarImagem(arq);
    };

    window.addEventListener("paste", aoColar);
    window.addEventListener("dragover", aoArrastar);
    window.addEventListener("dragleave", aoSair);
    window.addEventListener("drop", aoSoltar);
    return () => {
      window.removeEventListener("paste", aoColar);
      window.removeEventListener("dragover", aoArrastar);
      window.removeEventListener("dragleave", aoSair);
      window.removeEventListener("drop", aoSoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertoId, isStaff, editando, corpo, aberto?.content]);

  // sobe a imagem e insere a marcacao na posicao do cursor
  async function enviarImagem(file: File) {
    if (!aberto || !user) return;
    if (file.size > LIMITE_MB * 1024 * 1024) {
      setErro(`Arquivo acima de ${LIMITE_MB} MB.`); return;
    }
    setSubindo(true);
    setErro(null);
    const limpo = file.name.replace(/[^\w.-]+/g, "_");
    const caminho = `relatorios/${aberto.id}/${Date.now()}-${limpo}`;

    const up = await supabase.storage.from("anexos").upload(caminho, file, { upsert: false });
    if (up.error) { setSubindo(false); setErro("Falha no envio: " + up.error.message); return; }

    const { error } = await supabase.from("report_files").insert({
      report_id: aberto.id,
      author_id: user.id,
      name: file.name,
      storage_path: caminho,
      mime: file.type || null,
      size_bytes: file.size,
    });
    if (error) {
      await supabase.storage.from("anexos").remove([caminho]);
      setSubindo(false);
      setErro("Nao foi possivel registrar a imagem: " + error.message);
      return;
    }

    // sem legenda: nomes automaticos como "image.png" nao dizem nada
    // e so ocupariam espaco embaixo da imagem
    const marcacao = `\n![](anexo:${caminho})\n`;
    // fora do editor o rascunho pode estar desatualizado; nesse caso
    // o texto salvo e a fonte certa, senao o relatorio seria apagado
    const base = editando ? corpo : (aberto.content ?? "");
    const area = areaRef.current;
    const pos = editando ? (area?.selectionStart ?? base.length) : base.length;
    const novo = base.slice(0, pos) + marcacao + base.slice(pos);
    setCorpo(novo);
    await salvarCampos(aberto.id, { content: novo });
    setSubindo(false);
  }

  // ── Documentos guardados junto do relatorio ──────────────────
  // Recibo de faturamento, contrato, planilha: coisas que acompanham
  // o relatorio sem precisar aparecer no meio do texto.
  async function anexarDocumento(file: File) {
    if (!aberto || !user) return;
    if (file.size > LIMITE_MB * 1024 * 1024) {
      setErro(`Arquivo acima de ${LIMITE_MB} MB.`); return;
    }
    setSubindo(true);
    setErro(null);
    const limpo = file.name.replace(/[^\w.-]+/g, "_");
    const caminho = `relatorios/${aberto.id}/documentos/${Date.now()}-${limpo}`;

    const up = await supabase.storage.from("anexos").upload(caminho, file, { upsert: false });
    if (up.error) { setSubindo(false); setErro("Falha no envio: " + up.error.message); return; }

    const { data, error } = await supabase.from("report_files").insert({
      report_id: aberto.id,
      author_id: user.id,
      name: file.name,
      storage_path: caminho,
      mime: file.type || null,
      size_bytes: file.size,
    }).select("id,name,storage_path,mime,size_bytes,created_at").single();

    if (error || !data) {
      await supabase.storage.from("anexos").remove([caminho]);
      setSubindo(false);
      setErro("Nao foi possivel registrar o documento: " + (error?.message ?? ""));
      return;
    }
    setAnexos(a => [data as ArquivoRow, ...a]);
    setSubindo(false);
  }

  // O bucket e privado: cada abertura pede um endereco temporario
  async function abrirDocumento(a: ArquivoRow) {
    const { data, error } = await supabase.storage
      .from("anexos").createSignedUrl(a.storage_path, 300);
    if (error || !data) { setErro("Nao foi possivel abrir esse documento."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removerDocumento(a: ArquivoRow) {
    setConfirmAnexo(null);
    const { error } = await supabase.from("report_files").delete().eq("id", a.id);
    if (error) { setErro("Nao foi possivel remover: " + error.message); return; }
    await supabase.storage.from("anexos").remove([a.storage_path]);
    setAnexos(lista => lista.filter(x => x.id !== a.id));
  }

  // Print colado chega com nome automatico. Um recibo precisa de nome
  // que diga o que e, senao a lista vira varias linhas iguais.
  async function renomearDocumento(a: ArquivoRow) {
    const novo = nomeDraft.trim();
    setRenomeando(null);
    if (!novo || novo === a.name) return;
    const { error } = await supabase.from("report_files")
      .update({ name: novo }).eq("id", a.id);
    if (error) { setErro("Nao foi possivel renomear: " + error.message); return; }
    setAnexos(lista => lista.map(x => x.id === a.id ? { ...x, name: novo } : x));
  }

  // ── Documento aberto ─────────────────────────────────────────
  if (aberto) {
    const podeEditar = isStaff;
    const corpoAtual = editando ? corpo : (aberto.content ?? "");
    const documentos = anexos.filter(a => !corpoAtual.includes(a.storage_path));
    return (
      <>
        <PageMeta title={`${aberto.title} | inProR`} />
        <div className="p-4 sm:p-5 md:p-7 max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-[12px] mb-4 flex-wrap">
            <button onClick={() => setAbertoId(null)}
              className="opacity-55 hover:opacity-100 underline underline-offset-2">
              Relatorios
            </button>
            <span className="opacity-30">/</span>
            <span className="opacity-40">{periodLabel(aberto.period)}</span>
          </div>

          {erro && (
            <div className="mb-4 border hairline rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
              style={{ borderColor: "var(--bad)" }}>
              <span className="text-[13px]" style={{ color: "var(--bad)" }}>{erro}</span>
              <button className="text-[11px] opacity-60" onClick={() => setErro(null)}>fechar</button>
            </div>
          )}

          {/* Cabecalho do documento */}
          <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
            <div className="min-w-0 flex-1">
              {podeEditar ? (
                <input
                  className="font-display font-bold text-2xl sm:text-3xl tracking-tight bg-transparent w-full
                             border-0 outline-none focus:bg-black/[0.03] dark:focus:bg-white/[0.04] rounded px-1 -mx-1"
                  style={{ color: "var(--brand)" }}
                  value={tituloDraft}
                  onChange={e => setTituloDraft(e.target.value)}
                  onBlur={() => {
                    const v = tituloDraft.trim();
                    if (v && v !== aberto.title) salvarCampos(aberto.id, { title: v });
                  }}
                />
              ) : (
                <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight"
                  style={{ color: "var(--brand)" }}>{aberto.title}</h1>
              )}
              {podeEditar ? (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="inline-block w-[150px]">
                    <CellPicker variante="campo" title="Alterar cliente"
                      busca={adminClients.length > 8} placeholder="Buscar cliente..."
                      trigger={
                        aberto.client_id
                          ? <span className="text-[12px] truncate">{clientName(aberto.client_id)}</span>
                          : <span className="text-[12px]" style={{ color: "var(--bad)" }}>Sem cliente</span>
                      }>
                      {(fechar, termo) => adminClients
                        .filter(c => !termo || c.name.toLowerCase().includes(termo))
                        .map(c => (
                          <MenuItem key={c.id} selecionado={aberto.client_id === c.id}
                            onClick={() => { salvarCampos(aberto.id, { client_id: c.id }); fechar(); }}>
                            {c.name}
                          </MenuItem>
                        ))}
                    </CellPicker>
                  </span>

                  <span className="inline-block w-[175px]">
                    <CellPicker variante="campo" title="Alterar departamento"
                      busca={depts.length > 8} placeholder="Buscar departamento..."
                      trigger={
                        dept(aberto.department_id)
                          ? <span className="inline-flex items-center gap-1.5 min-w-0 text-[12px]">
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: dept(aberto.department_id)!.color }} />
                              <span className="truncate">{dept(aberto.department_id)!.name}</span>
                            </span>
                          : <span className="text-[12px] opacity-40">Sem departamento</span>
                      }>
                      {(fechar, termo) => (
                        <>
                          <MenuItem selecionado={!aberto.department_id}
                            onClick={() => { salvarCampos(aberto.id, { department_id: null }); fechar(); }}>
                            <span className="opacity-50">Sem departamento</span>
                          </MenuItem>
                          {depts.filter(d => d.active && (!termo || d.name.toLowerCase().includes(termo)))
                            .map(d => (
                              <MenuItem key={d.id} selecionado={aberto.department_id === d.id}
                                onClick={() => { salvarCampos(aberto.id, { department_id: d.id }); fechar(); }}>
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                  <span className="truncate">{d.name}</span>
                                </span>
                              </MenuItem>
                            ))}
                        </>
                      )}
                    </CellPicker>
                  </span>

                  <span className="inline-block w-[130px]">
                    <CellPicker variante="campo" title="Alterar data" width={210}
                      trigger={<span className="text-[12px] truncate">{fmtDataCurta(aberto.reference_date)}</span>}>
                      {fechar => (
                        <MenuData
                          valor={aberto.reference_date}
                          atalhos={false}
                          permiteLimpar={false}
                          onFechar={fechar}
                          onSalvar={d => salvarCampos(aberto.id, {
                            reference_date: d,
                            // o periodo acompanha o mes escolhido
                            period: d ? d.slice(0, 7) : aberto.period,
                          })}
                        />
                      )}
                    </CellPicker>
                  </span>

                  <span className="text-[11px] opacity-45">
                    criado em {fmtData(aberto.created_at)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] opacity-55">
                  <span>{fmtDataCurta(aberto.reference_date)}</span>
                  {dept(aberto.department_id) && <span>{dept(aberto.department_id)!.name}</span>}
                  <span>criado em {fmtData(aberto.created_at)}</span>
                </div>
              )}

              {/* etiquetas */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {(aberto.tags ?? []).map(t => (
                  <span key={t}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>
                    {t}
                    {podeEditar && (
                      <button className="opacity-50 hover:opacity-100"
                        onClick={() => alternarTag(aberto, t)}
                        aria-label={`Remover etiqueta ${t}`}>x</button>
                    )}
                  </span>
                ))}

                {podeEditar && (
                  <CellPicker title="Adicionar etiqueta" width={220}
                    aoCriar={async nome => { await alternarTag(aberto, nome); }}
                    criarRotulo="Criar etiqueta"
                    busca={tagsExistentes.length > 8}
                    placeholder="Buscar etiqueta..."
                    trigger={<span className="text-[11px] opacity-50">+ etiqueta</span>}>
                    {(_, termo) => {
                      const livres = tagsExistentes
                        .filter(t => !(aberto.tags ?? []).includes(t))
                        .filter(t => !termo || t.toLowerCase().includes(termo));
                      if (!livres.length)
                        return <p className="text-[12px] opacity-45 px-2 py-1.5">
                          Nenhuma etiqueta pronta. Crie uma abaixo.
                        </p>;
                      return livres.map(t => (
                        <MenuItem key={t} onClick={() => alternarTag(aberto, t)}>{t}</MenuItem>
                      ));
                    }}
                  </CellPicker>
                )}
              </div>
            </div>
            {!aberto.publicado && <Badge label="Rascunho" color="yellow" />}
          </div>

          {podeEditar && !aberto.client_id && (
            <div className="mt-3 border hairline rounded-lg px-3 py-2 text-[12px]"
              style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
              Este relatorio ainda nao tem cliente. Escolha acima, senao ele fica
              solto e nenhum cliente consegue ve-lo.
            </div>
          )}

          {aberto.url && (
            <a href={aberto.url} target="_blank" rel="noopener noreferrer"
              className="text-[12px] underline underline-offset-2 inline-block mt-1"
              style={{ color: "var(--copper)" }}>
              Abrir material externo
            </a>
          )}

          <div className="mt-5">
            <SectionCard>
              {editando && podeEditar ? (
                <>
                  <textarea
                    ref={areaRef}
                    className={cls(
                      "text-[13px] leading-relaxed font-mono bg-transparent w-full resize-none",
                      "border-0 outline-none rounded p-1 -m-1 min-h-[420px]",
                      arrastando && "ring-2 ring-offset-2",
                    )}
                    style={arrastando ? { outline: "2px dashed var(--copper)", outlineOffset: 4 } : undefined}
                    value={corpo}
                    placeholder={MODELO}
                    onChange={e => setCorpo(e.target.value)}
                    // arrastar arquivo para dentro do texto
                  />
                  <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t hairline">
                    <Btn size="sm" onClick={salvarCorpo} disabled={salvando}>
                      {salvando ? "Salvando..." : "Salvar"}
                    </Btn>
                    <button
                      className="text-[12px] px-2.5 py-1.5 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      onClick={() => fileRef.current?.click()} disabled={subindo}>
                      {subindo ? "Enviando..." : "Inserir imagem"}
                    </button>
                    <button className="text-[12px] opacity-55"
                      onClick={() => { setCorpo(aberto.content ?? ""); setEditando(false); }}>
                      Descartar
                    </button>
                    <span className="text-[11px] opacity-35 ml-auto hidden sm:inline">
                      Titulos com ##, passos numerados, itens a marcar, links e imagens
                    </span>
                  </div>
                </>
              ) : (
                <div className="group">
                  {aberto.content?.trim()
                    ? <TextoFormatado texto={aberto.content} />
                    : <p className="text-[13px] opacity-40 py-6 text-center">
                        Relatorio ainda sem conteudo.
                      </p>}
                  {podeEditar && (
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t hairline">
                      <Btn size="sm" variant="ghost"
                        onClick={() => { setCorpo(aberto.content ?? ""); setEditando(true); }}>
                        Editar relatorio
                      </Btn>
                      {/* atalho: entra em edicao ja abrindo o seletor de arquivo */}
                      <button
                        className="text-[12px] px-2.5 py-1.5 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        onClick={() => {
                          setCorpo(aberto.content ?? "");
                          setEditando(true);
                          setTimeout(() => fileRef.current?.click(), 50);
                        }}>
                        Inserir imagem
                      </button>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Documentos que acompanham o relatorio sem entrar no texto.
              Imagens ja usadas no corpo nao se repetem aqui. */}
          <div className="mt-4">
            <SectionCard>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <h3 className="text-[13px] font-semibold">Documentos</h3>
                {podeEditar && (
                  <button
                    className="text-[12px] px-2.5 py-1.5 rounded border hairline
                               hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    onClick={() => anexoRef.current?.click()} disabled={subindo}>
                    {subindo ? "Enviando..." : "Anexar documento"}
                  </button>
                )}
              </div>

              {documentos.length === 0 ? (
                <p className="text-[12px] opacity-40 py-2">
                  Nenhum documento anexado. Recibo de faturamento, contrato, nota
                  fiscal e planilha ficam aqui, separados do texto.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-[color:var(--line-light)]">
                  {documentos.map(a => (
                    <li key={a.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                      <span className="text-[9px] font-mono font-semibold px-1.5 py-1 rounded shrink-0 mt-0.5"
                        style={{ background: "rgba(12,33,24,.07)", color: "var(--brand)" }}>
                        {extensao(a.storage_path)}
                      </span>

                      <div className="min-w-0 flex-1">
                        {renomeando === a.id ? (
                          <input
                            autoFocus
                            className="text-[13px] w-full bg-transparent border-b outline-none pb-0.5"
                            style={{ borderColor: "var(--copper)" }}
                            value={nomeDraft}
                            onChange={e => setNomeDraft(e.target.value)}
                            onBlur={() => renomearDocumento(a)}
                            onKeyDown={e => {
                              if (e.key === "Enter") renomearDocumento(a);
                              if (e.key === "Escape") setRenomeando(null);
                            }}
                          />
                        ) : (
                          <button onClick={() => abrirDocumento(a)}
                            className="text-[13px] text-left w-full truncate
                                       hover:underline underline-offset-2"
                            title={a.name}>
                            {a.name}
                          </button>
                        )}
                        <div className="text-[11px] opacity-40 tabular-nums mt-0.5">
                          {[fmtTamanho(a.size_bytes), fmtData(a.created_at)]
                            .filter(Boolean).join(" · ")}
                        </div>
                      </div>

                      {podeEditar && (confirmAnexo === a.id ? (
                        <span className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          <button className="text-[11px] font-semibold"
                            style={{ color: "var(--bad)" }}
                            onClick={() => removerDocumento(a)}>Remover</button>
                          <button className="text-[11px] opacity-50"
                            onClick={() => setConfirmAnexo(null)}>nao</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 shrink-0 mt-0.5">
                          <button className="text-[11px] opacity-40 hover:opacity-100"
                            onClick={() => { setNomeDraft(a.name); setRenomeando(a.id); }}>
                            renomear
                          </button>
                          <button className="text-[11px] opacity-35 hover:opacity-100 px-1"
                            onClick={() => setConfirmAnexo(a.id)}
                            aria-label={`Remover ${a.name}`}>x</button>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <input ref={anexoRef} type="file" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) anexarDocumento(f);
              e.target.value = "";
            }} />

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) enviarImagem(f);
              e.target.value = "";
            }} />

          {podeEditar && (
            <div className="flex items-center gap-3 flex-wrap mt-4">
              <Btn size="sm" variant={aberto.publicado ? "ghost" : "primary"}
                disabled={!aberto.publicado && !aberto.client_id}
                onClick={() => salvarCampos(aberto.id, { publicado: !aberto.publicado })}>
                {aberto.publicado ? "Voltar para rascunho" : "Publicar para o cliente"}
              </Btn>
              {!aberto.publicado && !aberto.client_id && (
                <span className="text-[11px] opacity-50">Escolha o cliente para poder publicar</span>
              )}
              {confirmDel ? (
                <span className="flex items-center gap-2">
                  <span className="text-[12px] opacity-60">Excluir este relatorio?</span>
                  <button className="text-[12px] font-semibold px-2.5 py-1.5 rounded"
                    style={{ background: "var(--bad)", color: "white" }}
                    onClick={excluir}>Excluir</button>
                  <button className="text-[12px] px-2 py-1.5 opacity-55"
                    onClick={() => setConfirmDel(false)}>Cancelar</button>
                </span>
              ) : (
                <button className="text-[12px] opacity-50 hover:opacity-100"
                  style={{ color: "var(--bad)" }}
                  onClick={() => setConfirmDel(true)}>Excluir relatorio</button>
              )}
              <span className="text-[11px] opacity-40 ml-auto">
                {aberto.publicado ? "Visivel para o cliente" : "So a equipe enxerga"}
              </span>
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Lista ────────────────────────────────────────────────────
  const visiveis = rows.filter(r => {
    if (filtroDept === "sem" && r.department_id) return false;
    if (filtroDept !== "todos" && filtroDept !== "sem" && r.department_id !== filtroDept) return false;
    if (filtroTag !== "todas" && !(r.tags ?? []).includes(filtroTag)) return false;
    return true;
  });

  const porPeriodo: Record<string, ReportRow[]> = {};
  visiveis.forEach(r => { (porPeriodo[r.period ?? "sem"] ??= []).push(r); });
  const periodos = Object.keys(porPeriodo).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <PageMeta title="Relatorios | inProR" />
      <PageWrap
        title="Relatorios"
        subtitle="Documentacao e entregas por periodo"
        action={
          <div className="flex items-center gap-2">
            {isStaff && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {isStaff && (
              <Btn size="sm" onClick={criar} disabled={criando}>
                {criando ? "Criando..." : "+ Novo relatorio"}
              </Btn>
            )}
          </div>
        }
      >
        {erro && (
          <div className="mb-4 border hairline rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderColor: "var(--bad)" }}>
            <span className="text-[13px]" style={{ color: "var(--bad)" }}>{erro}</span>
            <button className="text-[11px] opacity-60" onClick={() => setErro(null)}>fechar</button>
          </div>
        )}

        <KpiGrid>
          <KpiCard label="Total"      value={rows.length} />
          <KpiCard label="Periodos"   value={new Set(rows.map(r => r.period).filter(Boolean)).size} />
          <KpiCard label="Publicados" value={rows.filter(r => r.publicado).length} />
          <KpiCard label="Rascunhos"  value={rows.filter(r => !r.publicado).length} />
        </KpiGrid>

        {/* filtros por departamento e etiqueta */}
        {rows.length > 0 && (
          <div className="filter-row mb-4">
            <button className="chip"
              style={filtroDept === "todos" && filtroTag === "todas"
                ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}}
              onClick={() => { setFiltroDept("todos"); setFiltroTag("todas"); }}>
              Todos {rows.length}
            </button>

            {depts.filter(d => rows.some(r => r.department_id === d.id)).map(d => {
              const n = rows.filter(r => r.department_id === d.id).length;
              return (
                <button key={d.id} className="chip"
                  style={filtroDept === d.id
                    ? { background: d.color, color: "white", borderColor: d.color } : {}}
                  onClick={() => setFiltroDept(filtroDept === d.id ? "todos" : d.id)}>
                  {d.name} <span className="opacity-70">{n}</span>
                </button>
              );
            })}

            {tagsExistentes.map(t => {
              const n = rows.filter(r => (r.tags ?? []).includes(t)).length;
              return (
                <button key={t} className="chip"
                  style={filtroTag === t
                    ? { background: "var(--copper)", color: "white", borderColor: "var(--copper)" } : {}}
                  onClick={() => setFiltroTag(filtroTag === t ? "todas" : t)}>
                  {t} <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : rows.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="Nenhum relatorio"
              sub={isStaff
                ? "Crie o primeiro relatorio e escreva direto no painel."
                : "Assim que a agencia publicar, o relatorio aparece aqui."}
              action={isStaff && <Btn size="sm" onClick={criar} disabled={criando}>+ Novo relatorio</Btn>}
            />
          </SectionCard>
        ) : visiveis.length === 0 ? (
          <SectionCard>
            <EmptyState title="Nenhum relatorio neste filtro"
              sub="Ajuste o departamento ou a etiqueta para ver mais."
              action={
                <Btn size="sm" variant="ghost"
                  onClick={() => { setFiltroDept("todos"); setFiltroTag("todas"); }}>
                  Limpar filtros
                </Btn>
              } />
          </SectionCard>
        ) : (
          <div className="flex flex-col gap-4">
            {periodos.map(p => (
              <SectionCard key={p} title={periodLabel(p === "sem" ? null : p)}>
                <div className="flex flex-col">
                  {porPeriodo[p].map(r => (
                    <button key={r.id} onClick={() => abrir(r)}
                      className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 border-b hairline last:border-0
                                 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded px-1 -mx-1">
                      {/* titulo e cliente ocupam a esquerda */}
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium leading-snug flex items-center gap-2 flex-wrap">
                          {r.title}
                          {!r.publicado && <Badge label="Rascunho" color="yellow" />}
                          {isStaff && !r.client_id && <Badge label="Sem cliente" color="red" />}
                        </div>
                        {isStaff && r.client_id && (
                          <div className="text-[12px] opacity-55 mt-0.5 truncate">
                            {clientName(r.client_id)}
                          </div>
                        )}
                      </div>

                      {/* etiquetas no meio, quando houver */}
                      {(r.tags ?? []).length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap shrink-0">
                          {(r.tags ?? []).slice(0, 3).map(t => (
                            <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>
                              {t}
                            </span>
                          ))}
                          {(r.tags ?? []).length > 3 && (
                            <span className="text-[11px] opacity-45">+{(r.tags ?? []).length - 3}</span>
                          )}
                        </div>
                      )}

                      {/* departamento e data alinhados a direita, no lugar do vazio */}
                      <div className="flex items-center gap-4 shrink-0 text-[12px]">
                        {dept(r.department_id) && (
                          <span className="inline-flex items-center gap-1.5 opacity-70 sm:w-[170px]">
                            <span className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: dept(r.department_id)!.color }} />
                            <span className="truncate">{dept(r.department_id)!.name}</span>
                          </span>
                        )}
                        <span className="font-mono opacity-55 sm:w-[90px] sm:text-right">
                          {fmtDataCurta(r.reference_date)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </PageWrap>
    </>
  );
}
