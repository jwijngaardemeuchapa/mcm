import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, BellRing, Check, ChevronDown, ChevronUp, Copy, DoorOpen, Hourglass, Info, MessageCircle, Minus, Phone, PhoneCall, PhoneOff,
  Send, UserMinus, Users, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useOverlaySlot } from "@/lib/overlayStack";
import { readSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";
import { fmtTime } from "@/lib/datetime";
import { umblerChatLink } from "@/lib/umbler";
import { dispatchQueue } from "@/lib/dispatchQueue";
import { useChapaJobState } from "@/lib/useDispatchJob";
import { useUndoActions } from "@/lib/undo";
import { enviarMensagemPosConfirmacao } from "@/lib/mensagemPosConfirmacao";
import { confirmarManualEmLote } from "@/lib/fasesConfirmacao";
import { removerChapaDoAlarme, restaurarChapa, mensagemDeSubstituicao } from "@/lib/alarmeAcoes";
import { useAlarmeChapas, type TarefaAlarme } from "@/lib/useAlarmeChapas";
import type { ChapaDoAlarme, TarefaDoAlarme } from "@/lib/alarmeDados";
import { calcularPortaria } from "@/lib/portaria";
import { COBRAR_APOS, CRITICO_MIN, fmtMin, maiorNivel, rotuloDisparo, type Acao, type ConfigAlarme, type ItemDiagnosticado, type Nivel } from "@/lib/alarmeChapas";

/* ── apresentação ── */

const MIN_KEY = "ovl_min_alarme";
const AJUDA_KEY = "alarme_ajuda_vista";

const NIVEL: Record<Nivel, { borda: string; cab: string; texto: string; rotulo: string }> = {
  calmo: { borda: "border-border", cab: "bg-muted/40", texto: "text-muted-foreground", rotulo: "Em dia" },
  atencao: { borda: "border-warning/50", cab: "bg-warning/10", texto: "text-warning", rotulo: "Atenção" },
  decidir: { borda: "border-warning", cab: "bg-warning/15", texto: "text-warning", rotulo: "Decidir" },
  critico: { borda: "border-destructive/70", cab: "bg-destructive/10", texto: "text-destructive", rotulo: "Crítico" },
};

const ACAO: Record<Acao, { Icon: LucideIcon; classe: string }> = {
  remover: { Icon: UserMinus, classe: "bg-destructive/10 text-destructive border-destructive/30" },
  ler_resposta: { Icon: MessageCircle, classe: "bg-info/10 text-info border-info/30" },
  cobrar: { Icon: PhoneCall, classe: "bg-warning/10 text-warning border-warning/30" },
  enviar: { Icon: Send, classe: "bg-info/10 text-info border-info/30" },
  achar_telefone: { Icon: PhoneOff, classe: "bg-warning/10 text-warning border-warning/30" },
  aguardar: { Icon: Hourglass, classe: "bg-muted text-muted-foreground border-border" },
  sobrando: { Icon: Users, classe: "bg-muted text-muted-foreground border-border" },
};

const RESUMO: Array<[Acao, string]> = [
  ["remover", "para remover"], ["ler_resposta", "para ler"], ["cobrar", "para cobrar"], ["enviar", "para contatar"], ["achar_telefone", "sem telefone"],
];

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}
const waLink = (raw: string) => `https://wa.me/55${raw.replace(/\D/g, "")}`;

async function copiar(texto: string, msg: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(msg);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

type Tom = "neutro" | "perigo" | "sucesso" | "aviso";
const TOM: Record<Tom, string> = {
  neutro: "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
  perigo: "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
  sucesso: "border-success/40 text-success hover:bg-success/15",
  aviso: "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20",
};

function Btn({ onClick, href, title, tom = "neutro", children, disabled }: {
  onClick?: () => void; href?: string; title: string; tom?: Tom; children: ReactNode; disabled?: boolean;
}) {
  const cls = `inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-40 ${TOM[tom]}`;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={cls}>{children}</a>;
  return <button type="button" onClick={onClick} title={title} disabled={disabled} className={cls}>{children}</button>;
}

/* ── ações (uma só instância, passada pras linhas) ── */

type Acoes = {
  confirmar: (c: ChapaDoAlarme, t: TarefaDoAlarme) => Promise<void>;
  remover: (c: ChapaDoAlarme, t: TarefaDoAlarme, repor: boolean) => Promise<void>;
  enviar: (c: ChapaDoAlarme, t: TarefaDoAlarme, acao: "fup" | "cancel") => void;
  abrirTarefa: (id: number) => void;
};

/* ── linhas ── */

function LinhaAcionavel({ item, tarefa, acoes, umblerPronto, semRespostaPronto }: {
  item: ItemDiagnosticado<ChapaDoAlarme>; tarefa: TarefaDoAlarme; acoes: Acoes; umblerPronto: boolean; semRespostaPronto: boolean;
}) {
  const { chapa: c, d } = item;
  const job = useChapaJobState(c.id);
  const { Icon, classe } = ACAO[d.acao];
  const link = umblerChatLink(c.chatId);
  const chips: string[] = [];
  if (d.silencioMin !== null && d.tipoDisparo) chips.push(`${rotuloDisparo(d.tipoDisparo)} há ${fmtMin(d.silencioMin)}`);
  else if (c.disparos === 0) chips.push("sem contato ainda");
  if (c.estrelas !== null) chips.push(`★ ${c.estrelas.toFixed(1).replace(".", ",")}${c.faltas ? ` · ${c.faltas} falta${c.faltas > 1 ? "s" : ""} em 15 dias` : ""}`);

  return (
    <li className={`rounded-lg border p-2.5 space-y-1.5 ${d.recomendaRemocao ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate flex-1 capitalize">{c.nome.toLowerCase()}</span>
        <Btn onClick={() => acoes.confirmar(c, tarefa)} title="Já confirmou (por telefone ou conversa): marcar como confirmado" tom="sucesso">
          <Check className="h-3 w-3" /> Já confirmou
        </Btn>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {chips.map((x) => (
          <span key={x} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{x}</span>
        ))}
        {c.telefone && (
          <button type="button" onClick={() => copiar(c.telefone!.replace(/\D/g, ""), "Número copiado")} title="Copiar número"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground">
            <Copy className="h-2.5 w-2.5" /> {fmtPhone(c.telefone)}
          </button>
        )}
      </div>

      <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${classe}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" /> {d.titulo}
        {d.recomendaRemocao && <span className="ml-auto text-[10px] font-medium uppercase tracking-wide">recomendado</span>}
      </div>

      <p className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Por quê:</span> {d.motivos.join(" · ")}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {job?.status === "countdown" ? (
          <Btn onClick={() => dispatchQueue.abortChapaJob(c.id)} title="Cancelar o envio" tom="aviso">
            <Send className="h-3 w-3" /> {job.action === "cancel" ? "Sem resposta" : "FUP"} em {job.remaining}s <X className="h-3 w-3 opacity-60" />
          </Btn>
        ) : (
          <>
            {d.acao === "remover" && (
              <>
                <Btn onClick={() => acoes.remover(c, tarefa, true)} title="Remove a chapa e abre o BID nesta tarefa para repor a vaga" tom="perigo">
                  <UserMinus className="h-3 w-3" /> Remover e repor
                </Btn>
                <Btn onClick={() => acoes.remover(c, tarefa, false)} title="Só remover (sem abrir o BID)">Só remover</Btn>
                {semRespostaPronto && c.telefone && !c.semRespostaEnviado && (
                  <Btn onClick={() => acoes.enviar(c, tarefa, "cancel")} title="Envia o aviso de sem resposta (60 s para cancelar)">
                    <Send className="h-3 w-3" /> Avisar sem resposta
                  </Btn>
                )}
              </>
            )}
            {d.acao === "cobrar" && c.telefone && (
              <>
                <Btn href={waLink(c.telefone)} title="Abrir o WhatsApp" tom="aviso"><MessageCircle className="h-3 w-3" /> WhatsApp</Btn>
                {umblerPronto && <Btn onClick={() => acoes.enviar(c, tarefa, "fup")} title="Reenviar o FUP (60 s para cancelar)"><Send className="h-3 w-3" /> Reenviar FUP</Btn>}
              </>
            )}
            {d.acao === "enviar" && umblerPronto && c.telefone && (
              <Btn onClick={() => acoes.enviar(c, tarefa, "fup")} title="Dispara o envio (60 s para cancelar)" tom="aviso">
                <Send className="h-3 w-3" /> {d.titulo}
              </Btn>
            )}
            {d.acao === "ler_resposta" && (link
              ? <Btn href={link} title="Abrir a conversa no Umbler" tom="aviso"><MessageCircle className="h-3 w-3" /> Abrir conversa</Btn>
              : c.telefone && <Btn href={waLink(c.telefone)} title="Abrir o WhatsApp" tom="aviso"><MessageCircle className="h-3 w-3" /> WhatsApp</Btn>)}
            {(d.acao === "achar_telefone" || d.acao === "ler_resposta") && (
              <Btn onClick={() => acoes.abrirTarefa(tarefa.id_tarefa)} title="Ir até a tarefa"><ArrowRight className="h-3 w-3" /> Abrir tarefa</Btn>
            )}
            {d.acao === "achar_telefone" && (
              <Btn onClick={() => acoes.remover(c, tarefa, true)} title="Remover e repor" tom="perigo"><UserMinus className="h-3 w-3" /> Remover e repor</Btn>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function resumoEmDia(item: ItemDiagnosticado<ChapaDoAlarme>): string {
  const { d } = item;
  if (d.acao === "aguardar" && d.minutosParaDecidir !== null) return `${rotuloDisparo(d.tipoDisparo!)} há ${fmtMin(d.silencioMin ?? 0)} · decisão em ${fmtMin(d.minutosParaDecidir)}`;
  if (d.acao === "enviar") return `${d.titulo.toLowerCase()} — ainda há tempo`;
  if (d.acao === "achar_telefone") return "sem telefone — ainda há tempo";
  return d.titulo.toLowerCase();
}

function GrupoDaTarefa({ grupo, acoes, umblerPronto, semRespostaPronto }: {
  grupo: TarefaAlarme; acoes: Acoes; umblerPronto: boolean; semRespostaPronto: boolean;
}) {
  const [emDiaAberto, setEmDiaAberto] = useState(false);
  const t = grupo.tarefa;
  const nv = NIVEL[grupo.nivel];
  const proxima = grupo.emDia.reduce<number | null>((m, i) => (i.d.minutosParaDecidir !== null && (m === null || i.d.minutosParaDecidir < m) ? i.d.minutosParaDecidir : m), null);
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${nv.cab} ${nv.texto}`}>{nv.rotulo}</span>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${nv.texto}`}>faltam {fmtMin(t.minParaTarefa)}</span>
        <span className="text-xs font-semibold text-foreground truncate flex-1 capitalize">{t.empresa.toLowerCase()}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fmtTime(t.data_tarefa)}</span>
        <button type="button" onClick={() => acoes.abrirTarefa(t.id_tarefa)} title="Ir até a tarefa"
          className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t.confirmados} de {t.solicitados} confirmados
        {grupo.vagasAbertas > 0 ? ` · ${grupo.vagasAbertas} vaga${grupo.vagasAbertas > 1 ? "s" : ""} a fechar` : " · tarefa completa"}
      </p>

      {grupo.acionaveis.length > 0 && (
        <ul className="space-y-2">
          {grupo.acionaveis.map((i) => (
            <LinhaAcionavel key={i.chapa.id} item={i} tarefa={t} acoes={acoes} umblerPronto={umblerPronto} semRespostaPronto={semRespostaPronto} />
          ))}
        </ul>
      )}

      {grupo.emDia.length > 0 && (
        <div>
          <button type="button" onClick={() => setEmDiaAberto((v) => !v)} className="w-full flex items-center gap-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground">
            <Hourglass className="h-3 w-3 shrink-0" />
            <span className="flex-1">
              Em dia ({grupo.emDia.length}){proxima !== null ? ` · próxima decisão em ${fmtMin(proxima)}` : ""}
            </span>
            {emDiaAberto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {emDiaAberto && (
            <ul className="mt-1 space-y-0.5 pl-4">
              {grupo.emDia.map((i) => (
                <li key={i.chapa.id} className="text-[11px] text-muted-foreground">
                  <span className="text-foreground capitalize">{i.chapa.nome.toLowerCase()}</span> — {resumoEmDia(i)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {grupo.sobrando.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <Users className="inline h-3 w-3 mr-1 -mt-0.5" />
          Sobram {grupo.sobrando.map((i) => i.chapa.nome.split(" ")[0].toLowerCase()).join(", ")}: a tarefa já está completa.
        </p>
      )}
    </div>
  );
}

function Ajuda({ config, aberta, onToggle }: { config: ConfigAlarme; aberta: boolean; onToggle: () => void }) {
  const cobrarFup = Math.round(config.limiteFupMin * COBRAR_APOS);
  return (
    <div className="px-4 py-2.5">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-1.5 text-left">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span className="text-xs font-semibold text-info flex-1">Como o alarme decide?</span>
        {aberta ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {aberta && (
        <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
          <ol className="space-y-0.5">
            <li><b className="text-foreground">1 · Enviar</b> — sem contato ainda.</li>
            <li><b className="text-foreground">2 · Aguardar</b> — FUP ou PréFUP enviado.</li>
            <li><b className="text-foreground">3 · Ligar ou WhatsApp</b> — {Math.round(COBRAR_APOS * 100)}% do prazo sem resposta (FUP: {cobrarFup} min).</li>
            <li>
              <b className="text-foreground">4 · Remover e repor</b> — {config.limiteFupMin} min sem resposta ao FUP, {fmtMin(config.limitePrefupMin)} ao PréFUP, ou faltando menos de {CRITICO_MIN} min para a tarefa.
            </li>
          </ol>
          <p>Quem mandou mensagem nunca vai para remoção. Prazos em Configurações.</p>
        </div>
      )}
    </div>
  );
}

/* ── painel ── */

export function PainelDeAlarme() {
  const { tarefas, vivas, config } = useAlarmeChapas();
  const navigate = useNavigate();
  const { push, undo } = useUndoActions();
  const rootRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(true);
  const [minimizado, setMinimizado] = useState(() => sessionStorage.getItem(MIN_KEY) === "1");
  const [ajudaAberta, setAjudaAberta] = useState(() => localStorage.getItem(AJUDA_KEY) !== "1");
  const [portariaFeita, setPortariaFeita] = useState<Set<string>>(() => new Set());

  const s = readSettings();
  const { umblerSettings } = s;
  const umblerPronto = !!(umblerSettings.bearerToken && umblerSettings.fromPhone && umblerSettings.organizationId);
  const semRespostaPronto = umblerPronto && !!umblerSettings.cancelTemplateId;

  const comAlerta = useMemo(() => tarefas.filter((t) => t.acionaveis.length > 0), [tarefas]);
  const portaria = useMemo(
    () => calcularPortaria(vivas, s.portariaRules).filter((a) => !portariaFeita.has(`${a.tarefa.id_tarefa}_${a.rule.id}`)),
    [vivas, s.portariaRules, portariaFeita],
  );
  const contagem = useMemo(() => {
    const m = new Map<Acao, number>();
    for (const t of comAlerta) for (const i of t.acionaveis) m.set(i.d.acao, (m.get(i.d.acao) ?? 0) + 1);
    return m;
  }, [comAlerta]);
  const total = [...contagem.values()].reduce((a, b) => a + b, 0);
  const nivel = comAlerta.reduce<Nivel>((n, t) => maiorNivel(n, t.nivel), "calmo");
  const visivel = s.approachingAlertEnabled && (total > 0 || portaria.length > 0);
  const offset = useOverlaySlot("approaching", rootRef, visivel, minimizado);

  function setMin(v: boolean) {
    setMinimizado(v);
    try { sessionStorage.setItem(MIN_KEY, v ? "1" : "0"); } catch { /* noop */ }
  }
  function alternarAjuda() {
    setAjudaAberta((v) => {
      try { localStorage.setItem(AJUDA_KEY, "1"); } catch { /* noop */ }
      return !v;
    });
  }
  const atualizar = () => window.dispatchEvent(new CustomEvent("fup:refresh"));

  const acoes: Acoes = {
    async confirmar(c, t) {
      try {
        const db = await getDb();
        await confirmarManualEmLote(db, [c.id], new Date().toISOString());
        enviarMensagemPosConfirmacao([{ idTarefa: t.id_tarefa, chapaId: c.id, nome: c.nome, telefone: c.telefone, empresa: t.empresa }], "manual");
        toast.success(`${c.nome} confirmado`);
        atualizar();
      } catch {
        toast.error("Erro ao confirmar");
      }
    },
    async remover(c, t, repor) {
      try {
        const db = await getDb();
        const antes = await removerChapaDoAlarme(db, c.id, new Date().toISOString());
        if (!antes) return;
        push({
          label: `remoção de ${c.nome}`,
          revert: async () => { await restaurarChapa(await getDb(), c.id, antes); },
          onReverted: atualizar,
        });
        atualizar();
        const msg = mensagemDeSubstituicao({ id_tarefa: t.id_tarefa, empresa: t.empresa, horario: fmtTime(t.data_tarefa) }, c);
        toast(`${c.nome} removido`, {
          duration: 6000,
          action: { label: "Desfazer", onClick: () => undo() },
          cancel: { label: "Copiar mensagem", onClick: () => copiar(msg, "Mensagem copiada") },
        });
        if (repor) navigate(`/bid?taskId=${t.id_tarefa}`);
      } catch {
        toast.error("Erro ao remover");
      }
    },
    enviar(c, t, acao) {
      dispatchQueue.startChapaJob(
        c.id, acao,
        { id: c.id, nome_chapa: c.nome, telefone_chapa: c.telefone, status_contato: c.status },
        { id_tarefa: t.id_tarefa, data_tarefa: t.data_tarefa, empresa: t.empresa, cidade_uf: t.cidade_uf },
      );
      toast.info(`${acao === "cancel" ? "Aviso de sem resposta" : "FUP"} para ${c.nome} em 60 s — dá para cancelar aqui ou no painel de disparos.`);
    },
    abrirTarefa(id) {
      if (window.location.pathname.startsWith("/dashboard")) window.dispatchEvent(new CustomEvent("fup:flash-task", { detail: id }));
      else navigate(`/dashboard?flash=${id}`);
    },
  };

  if (!visivel) return null;
  const nv = NIVEL[nivel === "calmo" ? "atencao" : nivel];

  if (minimizado) {
    return (
      <div ref={rootRef} style={{ bottom: 16 + offset }} className="fixed right-4 z-40">
        <button type="button" onClick={() => setMin(false)} title={`${total} chapa(s) precisam de você — clique para abrir`}
          className={`flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 shadow-lg hover:bg-muted transition-colors ${nv.borda}`}>
          <span className="relative shrink-0">
            <BellRing className={`h-3.5 w-3.5 ${nv.texto}`} />
            <span className={`absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full animate-ping ${nivel === "critico" ? "bg-destructive" : "bg-warning"}`} />
          </span>
          <span className={`text-xs font-semibold tabular-nums ${nv.texto}`}>{total + portaria.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ bottom: 16 + offset }} role="alert" aria-live="polite"
      className={`fixed right-4 z-40 w-[25rem] max-w-[calc(100vw-2rem)] rounded-2xl border bg-card shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55)] overflow-hidden ${nv.borda} ${nivel === "critico" ? "border-2" : ""}`}>
      <button type="button" onClick={() => setAberto((v) => !v)} className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:brightness-95 ${nv.cab}`}>
        <span className="relative shrink-0">
          <BellRing className={`h-4 w-4 ${nv.texto}`} />
          <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full animate-ping ${nivel === "critico" ? "bg-destructive" : "bg-warning"}`} />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-semibold ${nv.texto}`}>
            {total > 0 ? `${total} chapa${total !== 1 ? "s" : ""} precisa${total !== 1 ? "m" : ""} de você` : "Lista para a portaria"}
            {total > 0 && portaria.length > 0 && ` · ${portaria.length} portaria${portaria.length !== 1 ? "s" : ""}`}
          </span>
          {total > 0 && (
            <span className="block text-[11px] text-muted-foreground truncate">
              {RESUMO.filter(([a]) => contagem.get(a)).map(([a, rotulo]) => `${contagem.get(a)} ${rotulo}`).join(" · ")}
            </span>
          )}
        </span>
        <span role="button" tabIndex={0} title="Minimizar" aria-label="Minimizar o alarme"
          onClick={(e) => { e.stopPropagation(); setMin(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setMin(true); } }}
          className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
          <Minus className="h-3.5 w-3.5" />
        </span>
        {aberto ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {aberto && (
        <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
          <Ajuda config={config} aberta={ajudaAberta} onToggle={alternarAjuda} />

          {portaria.map(({ tarefa, rule, minutesLeft, nomes }) => (
            <div key={`p-${tarefa.id_tarefa}-${rule.id}`} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-3.5 w-3.5 text-info shrink-0" />
                <span className="text-xs font-bold text-info tabular-nums shrink-0">{fmtMin(minutesLeft)}</span>
                <span className="text-xs font-semibold text-foreground truncate flex-1 capitalize">{tarefa.empresa.toLowerCase()}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fmtTime(tarefa.data_tarefa)}</span>
              </div>
              <div className="rounded-md bg-info/5 border border-info/20 px-3 py-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-info">Enviar a lista para a portaria · {nomes.length} nome{nomes.length !== 1 ? "s" : ""}</p>
                <div className="flex items-center gap-2">
                  <Btn onClick={() => copiar(nomes.join("\n"), `${nomes.length} nome(s) copiados`)} title="Copiar a lista"><Copy className="h-3 w-3" /> Copiar lista</Btn>
                  <Btn onClick={() => setPortariaFeita((p) => new Set([...p, `${tarefa.id_tarefa}_${rule.id}`]))} title="Já enviei" tom="sucesso"><Check className="h-3 w-3" /> Concluído</Btn>
                </div>
              </div>
            </div>
          ))}

          {comAlerta.map((g) => (
            <GrupoDaTarefa key={g.tarefa.id_tarefa} grupo={g} acoes={acoes} umblerPronto={umblerPronto} semRespostaPronto={semRespostaPronto} />
          ))}
        </div>
      )}

      {aberto && (
        <div className="px-4 py-2 bg-muted/40 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            Nada é removido sozinho. <Phone className="inline h-2.5 w-2.5 -mt-0.5" /> Envios saem em 60 s (dá para cancelar).
          </p>
        </div>
      )}
    </div>
  );
}
