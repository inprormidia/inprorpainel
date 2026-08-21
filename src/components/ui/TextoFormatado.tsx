import { ReactNode, useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

// Renderiza o passo a passo escrito na descricao da tarefa.
// Aceita um subconjunto de markdown, suficiente para um processo:
//   ## Titulo da etapa
//   1. Passo numerado
//   - Item de lista
//   - [ ] Item a marcar      - [x] Item feito
//   **negrito**  `codigo`
//   [texto do link](https://endereco)
//   ![legenda](anexo:caminho)  imagem guardada no painel
//   ![legenda](https://...)    imagem de fora
//   > observacao
//
// O texto e convertido em elementos React, nunca em HTML solto,
// para que nada colado de fora consiga injetar marcacao na pagina.

// O bucket e privado: a imagem precisa de um endereco assinado,
// gerado na hora de exibir e renovado a cada abertura.
function Imagem({ origem, legenda }: { origem: string; legenda?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    // So arquivo do proprio painel ou endereco seguro. Sem isto, um
    // texto colado poderia apontar para um servidor de fora, que
    // saberia quem abriu o documento e quando.
    if (!origem.startsWith("anexo:")) {
      if (/^https:\/\//i.test(origem)) setSrc(origem);
      else setFalhou(true);
      return;
    }
    const caminho = origem.slice("anexo:".length);
    supabase.storage.from("anexos").createSignedUrl(caminho, 3600).then(({ data, error }) => {
      if (!vivo) return;
      if (error || !data) { setFalhou(true); return; }
      setSrc(data.signedUrl);
    });
    return () => { vivo = false; };
  }, [origem]);

  if (falhou)
    return (
      <div className="border border-dashed hairline rounded-lg py-6 text-center text-[12px] opacity-45 my-3">
        Imagem indisponivel ou de origem nao permitida
      </div>
    );

  if (!src)
    return <div className="rounded-lg my-3 h-40 animate-pulse bg-black/[0.05] dark:bg-white/[0.06]" />;

  return (
    <figure className="my-3">
      <img src={src} alt={legenda ?? ""}
        className="rounded-lg border hairline max-w-full h-auto" loading="lazy" />
      {legenda && (
        <figcaption className="text-[11px] opacity-50 mt-1.5 text-center">{legenda}</figcaption>
      )}
    </figure>
  );
}

// Nome automatico de arquivo colado nao serve de legenda: so ocupa
// espaco embaixo da imagem. Legenda de verdade e a que a pessoa
// escreveu.
const LEGENDA_AUTOMATICA =
  /^(image|imagem|unnamed|screenshot|captura[ _-]?de[ _-]?tela|colada|foto|img)[ _-]?\d*$/i;

function legendaUtil(texto: string) {
  const limpo = texto.trim();
  return limpo && !LEGENDA_AUTOMATICA.test(limpo) ? limpo : undefined;
}

type Trecho = { tipo: "texto" | "negrito" | "codigo" | "link"; valor: string; href?: string };

// Quebra uma linha nos trechos com formatacao
function partirLinha(linha: string): Trecho[] {
  const partes: Trecho[] = [];
  // link, negrito e codigo, nesta ordem de prioridade
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(linha)) !== null) {
    if (m.index > ultimo) {
      partes.push({ tipo: "texto", valor: linha.slice(ultimo, m.index) });
    }
    if (m[1] && m[2])      partes.push({ tipo: "link", valor: m[1], href: m[2] });
    else if (m[3])         partes.push({ tipo: "negrito", valor: m[3] });
    else if (m[4])         partes.push({ tipo: "codigo", valor: m[4] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < linha.length) partes.push({ tipo: "texto", valor: linha.slice(ultimo) });
  return partes;
}

function Linha({ texto }: { texto: string }) {
  return (
    <>
      {partirLinha(texto).map((t, i) => {
        if (t.tipo === "link")
          return (
            <a key={i} href={t.href} target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-2 break-words"
              style={{ color: "var(--copper)" }}>
              {t.valor}
            </a>
          );
        if (t.tipo === "negrito")
          return <strong key={i} className="font-semibold">{t.valor}</strong>;
        if (t.tipo === "codigo")
          return (
            <code key={i} className="font-mono text-[12px] px-1 py-0.5 rounded"
              style={{ background: "rgba(0,0,0,.06)" }}>
              {t.valor}
            </code>
          );
        return <span key={i}>{t.valor}</span>;
      })}
    </>
  );
}

export default function TextoFormatado({ texto, onMarcar }: {
  texto: string;
  // avisa quando um item de marcar e clicado, com o indice da linha
  onMarcar?: (indiceLinha: number, marcado: boolean) => void;
}) {
  const linhas = texto.split("\n");
  const blocos: ReactNode[] = [];
  let listaAberta: ReactNode[] = [];
  let tipoLista: "ordenada" | "simples" | null = null;

  const fecharLista = (chave: number) => {
    if (!listaAberta.length) return;
    blocos.push(
      tipoLista === "ordenada"
        ? <ol key={`l${chave}`} className="flex flex-col gap-1.5 my-2">{listaAberta}</ol>
        : <ul key={`l${chave}`} className="flex flex-col gap-1.5 my-2">{listaAberta}</ul>
    );
    listaAberta = [];
    tipoLista = null;
  };

  linhas.forEach((linha, i) => {
    const t = linha.trim();

    if (!t) { fecharLista(i); return; }

    // item a marcar
    const marcar = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(t);
    if (marcar) {
      const feito = marcar[1].toLowerCase() === "x";
      if (tipoLista !== "simples") { fecharLista(i); tipoLista = "simples"; }
      listaAberta.push(
        <li key={i} className="flex items-start gap-2">
          <button
            onClick={() => onMarcar?.(i, !feito)}
            disabled={!onMarcar}
            className="w-4 h-4 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center disabled:cursor-default"
            style={feito
              ? { background: "var(--ok)", borderColor: "var(--ok)", color: "white" }
              : { borderColor: "var(--line-light)" }}
            aria-label={feito ? "Desmarcar" : "Marcar"}
          >
            {feito && <span className="text-[9px] leading-none">✓</span>}
          </button>
          <span className={feito ? "line-through opacity-50" : ""}>
            <Linha texto={marcar[2]} />
          </span>
        </li>
      );
      return;
    }

    // passo numerado
    const num = /^(\d+)[.)]\s+(.*)$/.exec(t);
    if (num) {
      if (tipoLista !== "ordenada") { fecharLista(i); tipoLista = "ordenada"; }
      listaAberta.push(
        <li key={i} className="flex items-start gap-2.5">
          <span className="font-mono text-[11px] font-semibold w-5 h-5 rounded-full shrink-0
                           flex items-center justify-center mt-0.5"
            style={{ background: "rgba(12,33,24,.08)", color: "var(--brand)" }}>
            {num[1]}
          </span>
          <span className="min-w-0"><Linha texto={num[2]} /></span>
        </li>
      );
      return;
    }

    // item simples
    const item = /^[-*]\s+(.*)$/.exec(t);
    if (item) {
      if (tipoLista !== "simples") { fecharLista(i); tipoLista = "simples"; }
      listaAberta.push(
        <li key={i} className="flex items-start gap-2">
          <span className="w-1 h-1 rounded-full shrink-0 mt-2" style={{ background: "var(--ink)", opacity: .4 }} />
          <span className="min-w-0"><Linha texto={item[1]} /></span>
        </li>
      );
      return;
    }

    fecharLista(i);

    // imagem sozinha na linha
    const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(t);
    if (img) {
      blocos.push(<Imagem key={i} origem={img[2]} legenda={legendaUtil(img[1])} />);
      return;
    }

    // titulo de etapa
    const titulo = /^(#{1,3})\s+(.*)$/.exec(t);
    if (titulo) {
      blocos.push(
        <div key={i} className="font-semibold text-[14px] mt-3 first:mt-0 mb-1"
          style={{ color: "var(--brand)" }}>
          <Linha texto={titulo[2]} />
        </div>
      );
      return;
    }

    // observacao
    if (t.startsWith(">")) {
      blocos.push(
        <div key={i} className="border-l-2 pl-3 my-2 text-[13px] opacity-75"
          style={{ borderColor: "var(--copper)" }}>
          <Linha texto={t.slice(1).trim()} />
        </div>
      );
      return;
    }

    // separador
    if (/^-{3,}$/.test(t)) {
      blocos.push(<hr key={i} className="my-3 border-t hairline" />);
      return;
    }

    blocos.push(<p key={i} className="my-1.5"><Linha texto={t} /></p>);
  });

  fecharLista(linhas.length);

  return <div className="text-[13px] leading-relaxed">{blocos}</div>;
}
