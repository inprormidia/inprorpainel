import { useState, useEffect, useRef } from "react";
import { Avatar, Btn, cls } from "../../components/ui/InprorComponents";
import { useAuth, useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

// Comentarios e anexos da tarefa: arquivos, documentos e links.

interface Comentario {
  id: string; task_id: string;
  member_id: string | null; author_id: string | null;
  body: string; created_at: string;
}

interface Anexo {
  id: string; task_id: string;
  member_id: string | null; author_id: string | null;
  kind: "arquivo" | "link";
  name: string; url: string | null; storage_path: string | null;
  mime: string | null; size_bytes: number | null;
  created_at: string;
}

const LIMITE_MB = 25;

function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1)    return "agora";
  if (min < 60)   return `ha ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `ha ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1)    return "ontem";
  if (d < 30)     return `ha ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function tamanho(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Icone por tipo, em texto para nao destoar do restante do painel
function icone(a: Anexo): string {
  if (a.kind === "link") return "↗";
  const m = a.mime ?? "";
  if (m.startsWith("image/")) return "▣";
  if (m.startsWith("video/")) return "▶";
  if (m.includes("pdf"))      return "▤";
  if (m.includes("sheet") || m.includes("excel")) return "▦";
  return "▪";
}

export default function TarefaAtividade({ taskId, compacto }: { taskId: string; compacto?: boolean }) {
  const { user } = useAuth();
  const { team, myMemberId } = useClientScope();

  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [anexos, setAnexos]           = useState<Anexo[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [erro, setErro]               = useState<string | null>(null);

  const [texto, setTexto]       = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subindo, setSubindo]   = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const [mostrarLink, setMostrarLink] = useState(false);
  const [linkUrl, setLinkUrl]   = useState("");
  const [linkNome, setLinkNome] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!taskId) return;
    setCarregando(true);
    Promise.all([
      supabase.from("task_comments").select("*").eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      supabase.from("task_attachments").select("*").eq("task_id", taskId)
        .order("created_at", { ascending: false }),
    ]).then(([c, a]) => {
      setComentarios((c.data as Comentario[]) ?? []);
      setAnexos((a.data as Anexo[]) ?? []);
      setCarregando(false);
    });
  }, [taskId]);

  const autor = (memberId: string | null) => team.find(m => m.id === memberId);

  async function comentar() {
    const corpo = texto.trim();
    if (!corpo || !user) return;
    setEnviando(true);
    const { data, error } = await supabase.from("task_comments").insert({
      task_id: taskId,
      author_id: user.id,
      member_id: myMemberId,
      body: corpo,
    }).select().single();
    setEnviando(false);
    if (error) { setErro("Nao foi possivel comentar: " + error.message); return; }
    setComentarios(cur => [...cur, data as Comentario]);
    setTexto("");
    setErro(null);
  }

  async function apagarComentario(id: string) {
    const backup = comentarios;
    setComentarios(cur => cur.filter(c => c.id !== id));
    setConfirmar(null);
    const { error } = await supabase.from("task_comments").delete().eq("id", id);
    if (error) { setComentarios(backup); setErro("Nao foi possivel remover o comentario."); }
  }

  async function enviarArquivo(file: File) {
    if (!user) return;
    if (file.size > LIMITE_MB * 1024 * 1024) {
      setErro(`Arquivo acima de ${LIMITE_MB} MB.`);
      return;
    }
    setSubindo(true);
    setErro(null);
    // nome higienizado, com carimbo de tempo para nao colidir
    const limpo = file.name.replace(/[^\w.-]+/g, "_");
    const caminho = `${taskId}/${Date.now()}-${limpo}`;

    const up = await supabase.storage.from("anexos").upload(caminho, file, {
      cacheControl: "3600", upsert: false,
    });
    if (up.error) {
      setSubindo(false);
      setErro("Falha no envio: " + up.error.message);
      return;
    }

    const { data, error } = await supabase.from("task_attachments").insert({
      task_id: taskId,
      author_id: user.id,
      member_id: myMemberId,
      kind: "arquivo",
      name: file.name,
      storage_path: caminho,
      mime: file.type || null,
      size_bytes: file.size,
    }).select().single();
    setSubindo(false);
    if (error) {
      // registro falhou: nao deixa o arquivo orfao no armazenamento
      await supabase.storage.from("anexos").remove([caminho]);
      setErro("Nao foi possivel registrar o anexo: " + error.message);
      return;
    }
    setAnexos(cur => [data as Anexo, ...cur]);
  }

  async function adicionarLink() {
    const url = linkUrl.trim();
    if (!url || !user) return;
    const endereco = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const { data, error } = await supabase.from("task_attachments").insert({
      task_id: taskId,
      author_id: user.id,
      member_id: myMemberId,
      kind: "link",
      name: linkNome.trim() || endereco.replace(/^https?:\/\//i, "").slice(0, 60),
      url: endereco,
    }).select().single();
    if (error) { setErro("Nao foi possivel salvar o link: " + error.message); return; }
    setAnexos(cur => [data as Anexo, ...cur]);
    setLinkUrl(""); setLinkNome(""); setMostrarLink(false); setErro(null);
  }

  // bucket e privado: o endereco de leitura vale por poucos minutos
  async function abrirAnexo(a: Anexo) {
    if (a.kind === "link" && a.url) { window.open(a.url, "_blank", "noopener"); return; }
    if (!a.storage_path) return;
    const { data, error } = await supabase.storage.from("anexos")
      .createSignedUrl(a.storage_path, 300);
    if (error || !data) { setErro("Nao foi possivel abrir o arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function apagarAnexo(a: Anexo) {
    const backup = anexos;
    setAnexos(cur => cur.filter(x => x.id !== a.id));
    setConfirmar(null);
    const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
    if (error) { setAnexos(backup); setErro("Nao foi possivel remover o anexo."); return; }
    if (a.storage_path) await supabase.storage.from("anexos").remove([a.storage_path]);
  }

  const campo = "text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] w-full";

  if (carregando)
    return <p className="text-[13px] opacity-40 py-4">Carregando...</p>;

  return (
    <div className="flex flex-col gap-5">
      {erro && (
        <div className="border hairline rounded-lg px-3 py-2 flex items-center justify-between gap-3"
          style={{ borderColor: "var(--bad)" }}>
          <span className="text-[13px]" style={{ color: "var(--bad)" }}>{erro}</span>
          <button className="text-[11px] opacity-60" onClick={() => setErro(null)}>fechar</button>
        </div>
      )}

      {/* ── Anexos ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] uppercase tracking-wide opacity-50">
            Anexos {anexos.length > 0 && <span className="opacity-70">({anexos.length})</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="text-[12px] px-2 py-1 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              onClick={() => fileRef.current?.click()} disabled={subindo}>
              {subindo ? "Enviando..." : "Arquivo"}
            </button>
            <button
              className="text-[12px] px-2 py-1 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              onClick={() => setMostrarLink(v => !v)}>
              Link
            </button>
          </div>
        </div>

        <input ref={fileRef} type="file" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) enviarArquivo(f);
            e.target.value = "";
          }} />

        {mostrarLink && (
          <div className="flex flex-col gap-2 mb-3 border hairline rounded-lg p-3">
            <input className={campo} placeholder="https://" value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarLink(); }} autoFocus />
            <input className={campo} placeholder="Nome (opcional)" value={linkNome}
              onChange={e => setLinkNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarLink(); }} />
            <div className="flex gap-2">
              <Btn size="sm" onClick={adicionarLink} disabled={!linkUrl.trim()}>Adicionar</Btn>
              <button className="text-[12px] opacity-55" onClick={() => setMostrarLink(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {anexos.length === 0 ? (
          <p className="text-[12px] opacity-40">Nenhum arquivo ou link ainda.</p>
        ) : (
          <div className="flex flex-col">
            {anexos.map(a => (
              <div key={a.id}
                className="flex items-center gap-2.5 py-2 border-b hairline last:border-0 group">
                <span className="w-6 h-6 rounded shrink-0 flex items-center justify-center text-[12px]"
                  style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>
                  {icone(a)}
                </span>
                <button onClick={() => abrirAnexo(a)}
                  className="min-w-0 flex-1 text-left hover:underline underline-offset-2">
                  <div className="text-[13px] truncate">{a.name}</div>
                  <div className="text-[11px] opacity-45">
                    {a.kind === "link" ? "Link" : tamanho(a.size_bytes)}
                    {" · "}{quando(a.created_at)}
                    {autor(a.member_id) && <> · {autor(a.member_id)!.name}</>}
                  </div>
                </button>
                {confirmar === a.id ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button className="text-[11px] font-semibold px-2 py-1 rounded"
                      style={{ background: "var(--bad)", color: "white" }}
                      onClick={() => apagarAnexo(a)}>Remover</button>
                    <button className="text-[11px] px-1.5 py-1 rounded border hairline"
                      onClick={() => setConfirmar(null)}>Nao</button>
                  </span>
                ) : (
                  <button
                    className="text-[11px] opacity-0 group-hover:opacity-45 hover:!opacity-100 shrink-0 px-1"
                    style={{ color: "var(--bad)" }}
                    onClick={() => setConfirmar(a.id)}
                    title="Remover anexo">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Comentarios ────────────────────────────────────── */}
      <div>
        <div className="text-[11px] uppercase tracking-wide opacity-50 mb-2">
          Comentarios {comentarios.length > 0 && <span className="opacity-70">({comentarios.length})</span>}
        </div>

        {comentarios.length === 0 ? (
          <p className="text-[12px] opacity-40 mb-3">Nenhum comentario ainda.</p>
        ) : (
          <div className={cls("flex flex-col gap-3 mb-3", compacto && "max-h-[340px] overflow-y-auto pr-1")}>
            {comentarios.map(c => {
              const a = autor(c.member_id);
              const meu = c.author_id === user?.id;
              return (
                <div key={c.id} className="flex gap-2.5 group">
                  <Avatar name={a?.name ?? "?"} color={a?.color} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold">{a?.name ?? "Alguem"}</span>
                      <span className="text-[11px] opacity-40">{quando(c.created_at)}</span>
                      {meu && (
                        confirmar === c.id ? (
                          <span className="flex items-center gap-1">
                            <button className="text-[11px] font-semibold" style={{ color: "var(--bad)" }}
                              onClick={() => apagarComentario(c.id)}>remover</button>
                            <button className="text-[11px] opacity-55"
                              onClick={() => setConfirmar(null)}>nao</button>
                          </span>
                        ) : (
                          <button
                            className="text-[11px] opacity-0 group-hover:opacity-40 hover:!opacity-100"
                            style={{ color: "var(--bad)" }}
                            onClick={() => setConfirmar(c.id)}>excluir</button>
                        )
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words mt-0.5">
                      {c.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2.5">
          <Avatar name={autor(myMemberId)?.name ?? user?.email ?? "?"}
            color={autor(myMemberId)?.color} size={28} />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <textarea
              className="text-[13px] leading-relaxed border hairline rounded-lg px-2.5 py-2
                         bg-white dark:bg-[#11141b] resize-none w-full"
              rows={texto ? 3 : 1}
              placeholder="Escreva um comentario..."
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                // Ctrl+Enter envia, Enter continua quebrando linha
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) comentar();
              }}
            />
            {texto.trim() && (
              <div className="flex items-center gap-2">
                <Btn size="sm" onClick={comentar} disabled={enviando}>
                  {enviando ? "Enviando..." : "Comentar"}
                </Btn>
                <button className="text-[12px] opacity-55" onClick={() => setTexto("")}>Cancelar</button>
                <span className="text-[11px] opacity-35 hidden sm:inline">Ctrl + Enter envia</span>
              </div>
            )}
          </div>
        </div>

        {!myMemberId && (
          <p className="text-[11px] opacity-45 mt-2">
            Seu login ainda nao esta ligado a um membro da equipe, entao o comentario
            aparecera sem nome. Ajuste isso na pagina Equipe.
          </p>
        )}
      </div>
    </div>
  );
}
