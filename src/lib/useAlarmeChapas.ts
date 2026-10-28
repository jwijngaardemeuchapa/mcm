import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDb } from "./db";
import { readSettings } from "./settings";
import { useUnreadChats } from "./WatcherContext";
import { getCarteiraDoAnalista } from "./carteira";
import { parseTaskDate } from "./datetime";
import { last11Digits } from "./umbler";
import { carregarConfiabilidade, carregarEntradasDoAlarme, type ChapaDoAlarme, type TarefaDoAlarme } from "./alarmeDados";
import {
  bipesDoAlarme, diagnosticarTudo, novosAlarmes, textosDeNotificacao, type Acao, type ConfigAlarme, type NovoAlarme, type TarefaDiagnosticada,
} from "./alarmeChapas";
import { playAlarme } from "./sound";

export type TarefaAlarme = TarefaDiagnosticada<ChapaDoAlarme, TarefaDoAlarme>;

const RECARGA_MS = 30_000; // reler o banco
const RELOGIO_MS = 15_000; // refazer a conta com o relógio andando (sem ir ao banco)

function notificar(titulo: string, corpo: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(titulo, { body: corpo, icon: "/favicon.ico", tag });
  } catch { /* melhor-esforço */ }
}

/** Som + notificação do Windows pros alarmes novos (cada um respeita a sua configuração). */
function avisar(novos: NovoAlarme[], tarefas: TarefaAlarme[]) {
  const { alarme } = readSettings();
  playAlarme(bipesDoAlarme(novos)); // já respeita alarme.som
  if (!alarme.notificacao) return;
  const min = new Map(tarefas.map((t) => [t.tarefa.id_tarefa, t.tarefa.minParaTarefa]));
  for (const t of textosDeNotificacao(novos, min)) notificar(t.titulo, t.corpo, t.tag);
}

/**
 * O alarme de chapas pendentes: lê o banco, faz o diagnóstico de cada chapa (lib/alarmeChapas.ts) e avisa
 * (som + notificação) quando uma chapa entra numa ação que pede o analista. Monta uma vez, no layout do app.
 */
export function useAlarmeChapas() {
  const { unreadPhones } = useUnreadChats();
  const [entradas, setEntradas] = useState<TarefaDoAlarme[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [config, setConfig] = useState<ConfigAlarme>(() => {
    const { alarme } = readSettings();
    return { limiteFupMin: alarme.limiteFupMin, limitePrefupMin: alarme.limitePrefupMin };
  });
  const avisadoRef = useRef(new Map<string, Acao>());
  const primeiraRef = useRef(true);
  const naoLidasRef = useRef(unreadPhones);
  naoLidasRef.current = unreadPhones;
  const rodandoRef = useRef(false);

  const recarregar = useCallback(async () => {
    if (rodandoRef.current) return;
    rodandoRef.current = true;
    try {
      const s = readSettings();
      setConfig((c) =>
        c.limiteFupMin === s.alarme.limiteFupMin && c.limitePrefupMin === s.alarme.limitePrefupMin
          ? c
          : { limiteFupMin: s.alarme.limiteFupMin, limitePrefupMin: s.alarme.limitePrefupMin },
      );
      if (!s.approachingAlertEnabled) {
        setEntradas((e) => (e.length === 0 ? e : []));
        return;
      }
      const db = await getDb();
      const carteira = await getCarteiraDoAnalista(); // se falhar, mantém a leitura anterior (cai no catch)
      const confiabilidade = await carregarConfiabilidade(db);
      setEntradas(await carregarEntradasDoAlarme(db, {
        horizonteHoras: s.alarme.horizonteHoras, carteira, naoLidas: naoLidasRef.current, confiabilidade,
      }));
      setCarregado(true);
    } catch {
      /* banco ocupado ou ainda sem tabelas: tenta de novo no próximo ciclo */
    } finally {
      rodandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const t = setInterval(() => { void recarregar(); }, RECARGA_MS);
    let adiar: ReturnType<typeof setTimeout> | undefined;
    const onRefresh = () => {
      if (adiar) clearTimeout(adiar);
      adiar = setTimeout(() => { void recarregar(); }, 400);
    };
    window.addEventListener("fup:refresh", onRefresh);
    window.addEventListener("carteira:changed", onRefresh);
    window.addEventListener("chapas:novos", onRefresh);
    return () => {
      clearInterval(t);
      if (adiar) clearTimeout(adiar);
      window.removeEventListener("fup:refresh", onRefresh);
      window.removeEventListener("carteira:changed", onRefresh);
      window.removeEventListener("chapas:novos", onRefresh);
    };
  }, [recarregar]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), RELOGIO_MS);
    return () => clearInterval(t);
  }, []);

  // o relógio anda sem ir ao banco: minutos até a tarefa e "mensagem não lida" refeitos a cada passo
  const vivas = useMemo<TarefaDoAlarme[]>(
    () =>
      entradas
        .map((t) => ({
          ...t,
          minParaTarefa: (parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() - agora) / 60_000,
          chapas: t.chapas.map((c) => ({ ...c, naoLida: !!c.telefone && unreadPhones.has(last11Digits(c.telefone)) })),
        }))
        .filter((t) => t.minParaTarefa > 0),
    [entradas, agora, unreadPhones],
  );
  const tarefas = useMemo<TarefaAlarme[]>(
    () => diagnosticarTudo<ChapaDoAlarme, TarefaDoAlarme>(vivas, agora, config),
    [vivas, agora, config],
  );

  useEffect(() => {
    if (!carregado) return;
    const novos = novosAlarmes(avisadoRef.current, tarefas, primeiraRef.current);
    primeiraRef.current = false; // abrir o app não toca por tudo que já estava pendente
    if (novos.length > 0) avisar(novos, tarefas);
  }, [tarefas, carregado]);

  return { tarefas, vivas, carregado, config, recarregar };
}
