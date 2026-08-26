import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Btn, EmptyState, Badge, cls,
} from "../../components/ui/InprorComponents";
import { statusLabel, type Status } from "../Tarefas/shared";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

interface DataComemorativa {
  id: string; name: string;
  dia: number | null; mes: number;
  regra_ordinal: number | null; regra_dia_semana: number | null;
  ano: number | null;
  segmentos: string[];
  relevancia: "alta" | "media" | "baixa";
  observacao: string | null;
  antecedencia_dias: number | null;
}

type Tipo = "data" | "tarefa" | "reuniao" | "relatorio";

interface Item {
  tipo: Tipo;
  id: string;
  dia: number;
  titulo: string;
  detalhe?: string;
  link?: string;
  destaque?: boolean;
  concluida?: boolean;
}

const MESES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const CORES: Record<Tipo, string> = {
  data:      "var(--copper)",
  tarefa:    "var(--brand)",
  reuniao:   "var(--ok)",
  relatorio: "var(--warn)",
};

const ROTULOS: Record<Tipo, string> = {
  data:      "Datas comemorativas",
  tarefa:    "Tarefas",
  reuniao:   "Reunioes",
  relatorio: "Relatorios",
};

// Data que anda de lugar: "segundo domingo de maio" vira dia 11 em um
// ano e dia 10 em outro. Calculamos na hora de exibir, para a base nao
// precisar ser corrigida todo mes de janeiro.
function diaDaRegra(ano: number, mes: number, ordinal: number, diaSemana: number): number | null {
  const ultimoDia = new Date(ano, mes, 0).getDate();

  if (ordinal > 0) {
    const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
    const desloca = (diaSemana - primeiroDiaSemana + 7) % 7;
    const dia = 1 + desloca + (ordinal - 1) * 7;
    return dia <= ultimoDia ? dia : null;
  }

  // ordinal negativo conta do fim do mes
  const ultimoDiaSemana = new Date(ano, mes - 1, ultimoDia).getDay();
  const volta = (ultimoDiaSemana - diaSemana + 7) % 7;
  const dia = ultimoDia - volta;
  return dia >= 1 ? dia : null;
}

const ORDINAIS = [
  { valor: 1,  label: "primeiro" },
  { valor: 2,  label: "segundo" },
  { valor: 3,  label: "terceiro" },
  { valor: 4,  label: "quarto" },
  { valor: -1, label: "ultimo" },
];

const SEGMENTOS = ["geral", "hamburgueria", "salgados", "delivery", "cafeteria", "pizzaria"];

type Formulario = {
  id: string | null;
  name: string;
  modo: "fixo" | "movel";
  dia: string;
  mes: number;
  regra_ordinal: number;
  regra_dia_semana: number;
  segmentos: string[];
  relevancia: "alta" | "media" | "baixa";
  antecedencia_dias: string;
  observacao: string;
};

const formVazio = (mes: number): Formulario => ({
  id: null, name: "", modo: "fixo", dia: "", mes,
  regra_ordinal: 2, regra_dia_semana: 0,
  segmentos: ["geral"], relevancia: "media",
  antecedencia_dias: "", observacao: "",
});

const formDaData = (d: DataComemorativa): Formulario => ({
  id: d.id,
  name: d.name,
  modo: d.dia !== null ? "fixo" : "movel",
  dia: d.dia !== null ? String(d.dia) : "",
  mes: d.mes,
  regra_ordinal: d.regra_ordinal ?? 2,
  regra_dia_semana: d.regra_dia_semana ?? 0,
  segmentos: d.segmentos?.length ? d.segmentos : ["geral"],
  relevancia: d.relevancia,
  antecedencia_dias: d.antecedencia_dias !== null ? String(d.antecedencia_dias) : "",
  observacao: d.observacao ?? "",
});

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

export default function Calendario() {
  const { scopedClientId, authLoading, isStaff, adminClientId, adminClients } = useClientScope();

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);

  const [datas, setDatas]   = useState<DataComemorativa[]>([]);
  const [itens, setItens]   = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocultos, setOcultos] = useState<Tipo[]>([]);

  // cadastro das datas: sem isto a base so cresce por SQL, e quem faz
  // o levantamento mensal nao consegue guardar o que descobriu
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const primeiroDoMes = iso(ano, mes, 1);
  const ultimoDoMes   = iso(ano, mes, new Date(ano, mes, 0).getDate());

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);

    const clienteAlvo = isStaff ? adminClientId : scopedClientId;
    const porCliente = <T,>(q: T) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return clienteAlvo ? (q as any).eq("client_id", clienteAlvo) : q;
    };

    Promise.all([
      // a base de datas nao pertence a cliente nenhum: ela e da agencia
      isStaff
        ? supabase.from("commemorative_dates").select("*").eq("ativo", true).eq("mes", mes)
        : Promise.resolve({ data: [] }),
      porCliente(supabase.from("tasks")
        .select("id,title,due_date,status")
        .gte("due_date", primeiroDoMes).lte("due_date", ultimoDoMes)),
      porCliente(supabase.from("meetings")
        .select("id,title,date")
        .gte("date", primeiroDoMes).lte("date", ultimoDoMes)),
      porCliente(supabase.from("reports")
        .select("id,title,reference_date")
        .gte("reference_date", primeiroDoMes).lte("reference_date", ultimoDoMes)),
    ]).then(([d, t, r, rel]) => {
      const brutas = ((d.data as DataComemorativa[]) ?? [])
        .filter(x => x.ano === null || x.ano === ano);
      setDatas(brutas);

      const lista: Item[] = [];

      for (const x of brutas) {
        const dia = x.dia ?? (
          x.regra_ordinal !== null && x.regra_dia_semana !== null
            ? diaDaRegra(ano, mes, x.regra_ordinal, x.regra_dia_semana)
            : null
        );
        if (!dia) continue;
        lista.push({
          tipo: "data", id: x.id, dia, titulo: x.name,
          detalhe: x.observacao ?? undefined,
          destaque: x.relevancia === "alta",
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const x of ((t.data as any[]) ?? [])) {
        if (!x.due_date) continue;
        lista.push({
          tipo: "tarefa", id: x.id, dia: Number(x.due_date.slice(8, 10)),
          titulo: x.title,
          // rotulo legivel: o banco guarda em_andamento, ninguem le assim
          detalhe: x.status ? statusLabel(x.status as Status) : undefined,
          concluida: x.status === "concluida",
          link: `/tarefas/${x.id}`,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const x of ((r.data as any[]) ?? [])) {
        if (!x.date) continue;
        lista.push({
          tipo: "reuniao", id: x.id, dia: Number(x.date.slice(8, 10)),
          titulo: x.title, link: "/reunioes",
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const x of ((rel.data as any[]) ?? [])) {
        if (!x.reference_date) continue;
        lista.push({
          tipo: "relatorio", id: x.id, dia: Number(x.reference_date.slice(8, 10)),
          titulo: x.title, link: "/relatorios",
        });
      }

      setItens(lista);
      setLoading(false);
    });
  }, [ano, mes, scopedClientId, adminClientId, isStaff, authLoading, primeiroDoMes, ultimoDoMes, recarga]);

  const visiveis = useMemo(
    () => itens.filter(i => !ocultos.includes(i.tipo)),
    [itens, ocultos],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<number, Item[]>();
    for (const i of visiveis) {
      const lista = mapa.get(i.dia) ?? [];
      lista.push(i);
      mapa.set(i.dia, lista);
    }
    // data comemorativa primeiro: e ela que orienta o conteudo do dia
    const ordem: Tipo[] = ["data", "reuniao", "tarefa", "relatorio"];
    for (const lista of mapa.values())
      lista.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
    return mapa;
  }, [visiveis]);

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const vazioAntes = new Date(ano, mes - 1, 1).getDay();
  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const diaDeHoje = ehMesAtual ? hoje.getDate() : -1;

  function andarMes(passo: number) {
    const d = new Date(ano, mes - 1 + passo, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  }

  function alternar(t: Tipo) {
    setOcultos(o => o.includes(t) ? o.filter(x => x !== t) : [...o, t]);
  }

  async function salvarData() {
    if (!form) return;
    const nome = form.name.trim();
    if (!nome) { setErro("A data precisa de um nome."); return; }

    const fixo = form.modo === "fixo";
    const dia = fixo ? Number(form.dia) : null;
    if (fixo && (!dia || dia < 1 || dia > 31)) {
      setErro("Dia entre 1 e 31."); return;
    }

    setSalvando(true);
    setErro(null);
    const registro = {
      name: nome,
      mes: form.mes,
      dia,
      regra_ordinal:    fixo ? null : form.regra_ordinal,
      regra_dia_semana: fixo ? null : form.regra_dia_semana,
      segmentos: form.segmentos.length ? form.segmentos : ["geral"],
      relevancia: form.relevancia,
      antecedencia_dias: form.antecedencia_dias ? Number(form.antecedencia_dias) : null,
      observacao: form.observacao.trim() || null,
    };

    const { error } = form.id
      ? await supabase.from("commemorative_dates").update(registro).eq("id", form.id)
      : await supabase.from("commemorative_dates").insert(registro);

    setSalvando(false);
    if (error) {
      // o indice unico barra a mesma data cadastrada duas vezes
      setErro(error.code === "23505"
        ? "Ja existe uma data com esse nome neste mes."
        : "Nao foi possivel salvar: " + error.message);
      return;
    }
    setForm(null);
    // o mes do formulario pode nao ser o mes na tela
    if (registro.mes !== mes) setMes(registro.mes);
    else setRecarga(n => n + 1);
  }

  async function desativarData(d: DataComemorativa) {
    // some do calendario sem perder o historico de uso da data
    const { error } = await supabase.from("commemorative_dates")
      .update({ ativo: false }).eq("id", d.id);
    if (error) { setErro("Nao foi possivel remover: " + error.message); return; }
    setRecarga(n => n + 1);
  }

  const contagem = (t: Tipo) => itens.filter(i => i.tipo === t).length;
  const comAntecedencia = datas.filter(d => (d.antecedencia_dias ?? 0) >= 14).length;
  const nomeCliente = adminClientId
    ? (adminClients.find(c => c.id === adminClientId)?.name ?? "Cliente")
    : null;

  return (
    <>
      <PageMeta title="Calendario | inProR" description="Datas do mes, tarefas, reunioes e relatorios" />
      <PageWrap
        title="Calendario"
        subtitle={nomeCliente ? `Mes a mes de ${nomeCliente}` : "Datas do mes, prazos e compromissos"}
        action={
          <div className="flex items-center gap-1.5">
            <Btn size="sm" variant="ghost" onClick={() => andarMes(-1)}>Anterior</Btn>
            <Btn size="sm" variant="ghost"
              onClick={() => { setAno(agora.getFullYear()); setMes(agora.getMonth() + 1); }}>
              Hoje
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => andarMes(1)}>Proximo</Btn>
          </div>
        }
      >
        <KpiGrid>
          <KpiCard label="Mes" value={MESES[mes - 1]} sub={String(ano)} />
          <KpiCard label="Datas do mes" value={contagem("data")}
            sub={comAntecedencia ? `${comAntecedencia} pedem preparo antes` : "nenhuma pede preparo"} />
          <KpiCard label="Tarefas com prazo" value={contagem("tarefa")} />
          <KpiCard label="Reunioes" value={contagem("reuniao")} />
        </KpiGrid>

        {/* Filtro por tipo: o mes de conteudo nao precisa competir com
            reuniao interna quando a pessoa esta planejando post. */}
        <div className="flex items-center gap-2 flex-wrap mt-5 mb-3">
          {(Object.keys(ROTULOS) as Tipo[]).map(t => {
            const ativo = !ocultos.includes(t);
            return (
              <button key={t} onClick={() => alternar(t)}
                className={cls(
                  "text-[12px] px-2.5 py-1.5 rounded-full border hairline flex items-center gap-1.5",
                  ativo ? "opacity-100" : "opacity-35",
                )}>
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: CORES[t] }} />
                {ROTULOS[t]}
                <span className="opacity-50 tabular-nums">{contagem(t)}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <SectionCard>
            <div className="h-64 animate-pulse rounded bg-black/[0.04] dark:bg-white/[0.06]" />
          </SectionCard>
        ) : (
          <>
            {/* Grade do mes, a partir de tablet. Sete colunas em tela
                estreita espremem tudo a ponto de nao dar para ler. */}
            <SectionCard className="hidden md:block">
              <div className="grid grid-cols-7 gap-px mb-1">
                {DIAS_CURTOS.map(d => (
                  <div key={d} className="text-[11px] font-medium opacity-40 text-center py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: vazioAntes }).map((_, i) => (
                  <div key={`vazio-${i}`} />
                ))}
                {Array.from({ length: diasNoMes }).map((_, i) => {
                  const dia = i + 1;
                  const doDia = porDia.get(dia) ?? [];
                  const ehHoje = dia === diaDeHoje;
                  return (
                    <div key={dia}
                      className={cls(
                        "rounded-lg border hairline p-1.5 min-h-[92px] flex flex-col gap-1",
                        ehHoje && "ring-1",
                      )}
                      style={ehHoje ? { borderColor: "var(--brand)" } : undefined}>
                      <span className={cls(
                        "text-[11px] tabular-nums",
                        ehHoje ? "font-bold" : "opacity-45",
                      )}
                        style={ehHoje ? { color: "var(--brand)" } : undefined}>
                        {dia}
                      </span>
                      {doDia.slice(0, 3).map(item => (
                        <ItemDoDia key={`${item.tipo}-${item.id}`} item={item} />
                      ))}
                      {doDia.length > 3 && (
                        <span className="text-[10px] opacity-40">
                          mais {doDia.length - 3}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* Em tela estreita, so os dias que tem alguma coisa. */}
            <div className="md:hidden flex flex-col gap-2">
              {porDia.size === 0 ? (
                <EmptyState
                  title="Mes sem nada marcado"
                  sub="Datas comemorativas, prazos de tarefa, reunioes e relatorios deste mes aparecem aqui."
                />
              ) : (
                [...porDia.keys()].sort((a, b) => a - b).map(dia => (
                  <SectionCard key={dia}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-[15px] font-semibold tabular-nums"
                        style={{ color: dia === diaDeHoje ? "var(--brand)" : undefined }}>
                        {String(dia).padStart(2, "0")}
                      </span>
                      <span className="text-[12px] opacity-45">
                        {DIAS_CURTOS[new Date(ano, mes - 1, dia).getDay()]}
                        {dia === diaDeHoje && ", hoje"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {(porDia.get(dia) ?? []).map(item => (
                        <ItemDoDia key={`${item.tipo}-${item.id}`} item={item} completo />
                      ))}
                    </div>
                  </SectionCard>
                ))
              )}
            </div>

            {/* A leitura que a tarefa de levantamento precisa: as datas
                do mes em lista, com o que preparar antes. */}
            {isStaff && form && (
              <div className="mt-4">
                <SectionCard title={form.id ? "Editar data" : "Nova data"}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Nome</span>
                      <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                        autoFocus
                        placeholder="Dia da Coxinha"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })} />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Mes</span>
                      <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                        value={form.mes}
                        onChange={e => setForm({ ...form, mes: Number(e.target.value) })}>
                        {MESES.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </label>

                    {/* Dia fixo ou regra: e a escolha que decide se a data
                        envelhece ou se acompanha o calendario sozinha. */}
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Quando</span>
                      <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                        value={form.modo}
                        onChange={e => setForm({ ...form, modo: e.target.value as "fixo" | "movel" })}>
                        <option value="fixo">Dia fixo, todo ano</option>
                        <option value="movel">Depende do dia da semana</option>
                      </select>
                    </label>

                    {form.modo === "fixo" ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] opacity-55 uppercase tracking-wide">Dia</span>
                        <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                          type="number" min={1} max={31} placeholder="28"
                          value={form.dia}
                          onChange={e => setForm({ ...form, dia: e.target.value })} />
                      </label>
                    ) : (
                      <>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] opacity-55 uppercase tracking-wide">Qual</span>
                          <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                            value={form.regra_ordinal}
                            onChange={e => setForm({ ...form, regra_ordinal: Number(e.target.value) })}>
                            {ORDINAIS.map(o => (
                              <option key={o.valor} value={o.valor}>{o.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] opacity-55 uppercase tracking-wide">Dia da semana</span>
                          <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                            value={form.regra_dia_semana}
                            onChange={e => setForm({ ...form, regra_dia_semana: Number(e.target.value) })}>
                            {["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"]
                              .map((d, i) => <option key={d} value={i}>{d}</option>)}
                          </select>
                        </label>
                      </>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Relevancia</span>
                      <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                        value={form.relevancia}
                        onChange={e => setForm({ ...form, relevancia: e.target.value as Formulario["relevancia"] })}>
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Preparar antes, em dias</span>
                      <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                        type="number" min={0} max={90} placeholder="14"
                        value={form.antecedencia_dias}
                        onChange={e => setForm({ ...form, antecedencia_dias: e.target.value })} />
                    </label>

                    <div className="flex flex-col gap-1 md:col-span-3">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Para quem serve</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {SEGMENTOS.map(seg => {
                          const marcado = form.segmentos.includes(seg);
                          return (
                            <button key={seg} type="button"
                              onClick={() => setForm({
                                ...form,
                                segmentos: marcado
                                  ? form.segmentos.filter(x => x !== seg)
                                  : [...form.segmentos, seg],
                              })}
                              className={cls(
                                "text-[12px] px-2.5 py-1 rounded-full border hairline",
                                marcado ? "opacity-100" : "opacity-40",
                              )}
                              style={marcado
                                ? { background: "rgba(168,87,48,.12)", color: "var(--copper)" }
                                : undefined}>
                              {seg}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="flex flex-col gap-1 md:col-span-3">
                      <span className="text-[11px] opacity-55 uppercase tracking-wide">Como a marca usa esta data</span>
                      <textarea
                        className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] resize-none leading-relaxed"
                        rows={2}
                        placeholder="O que funcionou, o que evitar, o que a operacao precisa saber antes."
                        value={form.observacao}
                        onChange={e => setForm({ ...form, observacao: e.target.value })} />
                    </label>
                  </div>

                  {erro && (
                    <p className="text-[12px] mt-2" style={{ color: "var(--bad)" }}>{erro}</p>
                  )}

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t hairline">
                    <Btn size="sm" onClick={salvarData} disabled={salvando}>
                      {salvando ? "Salvando..." : "Salvar data"}
                    </Btn>
                    <button className="text-[12px] opacity-55"
                      onClick={() => { setForm(null); setErro(null); }}>
                      Cancelar
                    </button>
                    <span className="text-[11px] opacity-35 ml-auto hidden sm:inline">
                      Data cadastrada volta sozinha todo ano
                    </span>
                  </div>
                </SectionCard>
              </div>
            )}

            {!ocultos.includes("data") && datas.length > 0 && (
              <div className="mt-4">
                <SectionCard
                  title={`Datas de ${MESES[mes - 1]}`}
                  action={isStaff && !form ? (
                    <button
                      className="text-[12px] px-2.5 py-1.5 rounded border hairline
                                 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      onClick={() => { setErro(null); setForm(formVazio(mes)); }}>
                      Nova data
                    </button>
                  ) : undefined}>
                  <ul className="flex flex-col divide-y divide-[color:var(--line-light)]">
                    {[...datas]
                      .map(d => ({
                        d,
                        dia: d.dia ?? (d.regra_ordinal !== null && d.regra_dia_semana !== null
                          ? diaDaRegra(ano, mes, d.regra_ordinal, d.regra_dia_semana) : null),
                      }))
                      .filter(x => x.dia !== null)
                      .sort((a, b) => (a.dia ?? 0) - (b.dia ?? 0))
                      .map(({ d, dia }) => (
                        <li key={d.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                          <span className="text-[13px] font-semibold tabular-nums shrink-0 w-11"
                            style={{ color: "var(--copper)" }}>
                            {String(dia).padStart(2, "0")}/{String(mes).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-medium">{d.name}</span>
                              {d.relevancia === "alta" && <Badge label="alta" color="copper" />}
                              {d.dia === null && <Badge label="data movel" />}
                              {d.segmentos.filter(s => s !== "geral").map(s => (
                                <Badge key={s} label={s} />
                              ))}
                            </div>
                            {d.observacao && (
                              <p className="text-[12px] opacity-55 mt-0.5">{d.observacao}</p>
                            )}
                          </div>
                          {!!d.antecedencia_dias && (
                            <span className="text-[11px] opacity-45 shrink-0 hidden lg:block text-right">
                              preparar<br />{d.antecedencia_dias} dias antes
                            </span>
                          )}
                          {isStaff && (
                            <span className="flex items-center gap-2 shrink-0">
                              <button className="text-[11px] opacity-40 hover:opacity-100"
                                onClick={() => { setErro(null); setForm(formDaData(d)); }}>
                                editar
                              </button>
                              <button className="text-[11px] opacity-30 hover:opacity-100 px-1"
                                onClick={() => desativarData(d)}
                                aria-label={`Remover ${d.name}`}>x</button>
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </SectionCard>
              </div>
            )}

            {isStaff && datas.length === 0 && !form && !ocultos.includes("data") && (
              <div className="mt-4">
                <SectionCard>
                  <p className="text-[13px] opacity-55">
                    Nenhuma data cadastrada para {MESES[mes - 1]}. A base de datas
                    e o que faz o levantamento mensal deixar de ser pesquisa: cadastre
                    uma vez e ela volta sozinha todo ano.
                  </p>
                  {!form && (
                    <div className="mt-3">
                      <Btn size="sm" variant="ghost"
                        onClick={() => { setErro(null); setForm(formVazio(mes)); }}>
                        Cadastrar data de {MESES[mes - 1]}
                      </Btn>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}
          </>
        )}
      </PageWrap>
    </>
  );
}

// Uma linha do dia. Na grade aparece so o essencial, porque a celula e
// pequena; na lista de celular cabe o detalhe.
function ItemDoDia({ item, completo }: { item: Item; completo?: boolean }) {
  const conteudo = (
    <span className={cls(
      "flex items-start gap-1.5 text-left w-full",
      completo ? "text-[12.5px]" : "text-[10.5px] leading-tight",
    )}>
      <span className="rounded-full shrink-0"
        style={{
          background: CORES[item.tipo],
          width: completo ? 7 : 5,
          height: completo ? 7 : 5,
          marginTop: completo ? 5 : 4,
        }} />
      <span className={cls("min-w-0", completo ? "" : "truncate")}>
        <span className={cls(
          item.destaque && "font-semibold",
          item.concluida && "line-through opacity-50",
        )}>{item.titulo}</span>
        {completo && item.detalhe && (
          <span className="block text-[11px] opacity-50 mt-0.5">{item.detalhe}</span>
        )}
      </span>
    </span>
  );

  if (!item.link) {
    return <span className="block" title={item.titulo}>{conteudo}</span>;
  }
  return (
    <Link to={item.link} className="block hover:opacity-70" title={item.titulo}>
      {conteudo}
    </Link>
  );
}
