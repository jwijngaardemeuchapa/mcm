import { useState, useEffect, useRef } from "react";
import { Sun, Moon, Sunset, CheckCircle2, ArrowRight, Bell, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import logo from "@/assets/logo-meuchapa.png";
import { invoke } from "@tauri-apps/api/core";
import { sincronizarMetabase, sincronizarCarteira, devesSincronizarCarteira, sincronizarLeadsSaac, sincronizarRegistro, devesSincronizarRegistro } from "@/lib/metabaseSync";
import { readSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";
import { todayDateISO_SP, fmtSP, fmtTime, parseTaskDate } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { buildPriorities, type PriorityItem, type Level, type LembreteAlertItem } from "@/components/PriorityPanel";
import type { TaskWithChapas } from "@/components/TaskCard";

type Phase = "syncing" | "welcome";
type StepStatus = "pending" | "running" | "done" | "error";
type Step = { label: string; status: StepStatus };

function getGreeting(): { text: string; Icon: typeof Sun } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Bom dia", Icon: Sun };
  if (h >= 12 && h < 18) return { text: "Boa tarde", Icon: Sunset };
  return { text: "Boa noite", Icon: Moon };
}

function todayLabelPtBR(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

function fmtMinutes(min: number): string {
  if (min <= 0) return "agora";
  if (min < 60) return `${Math.ceil(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.ceil(min % 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const BG = "hsl(225 25% 6%)";
const TEXT_PRIMARY = "hsl(0 0% 100%)";
const TEXT_MUTED = "hsl(0 0% 100% / 0.35)";
const TEXT_DIM = "hsl(0 0% 100% / 0.2)";
const SURFACE = "hsl(225 25% 10%)";
const BORDER = "hsl(0 0% 100% / 0.07)";
const BLUE = "hsl(213 94% 68%)";
const GREEN = "hsl(142 65% 56%)";
const AMBER = "hsl(38 92% 62%)";
const RED = "hsl(0 72% 65%)";

const LEVEL_DARK: Record<Level, { label: string; color: string }> = {
  emergente: { label: "EMERGENTE", color: RED },
  urgente: { label: "URGENTE", color: AMBER },
  monitorar: { label: "MONITORAR", color: BLUE },
};

/** Carrega tarefas de hoje + overnight com os campos que buildPriorities consome. */
async function loadTodayTasks(): Promise<TaskWithChapas[]> {
  const db = await getDb();
  const todayISO = todayDateISO_SP();
  const yd = new Date(`${todayISO}T00:00:00-03:00`);
  yd.setDate(yd.getDate() - 1);
  const yesterdayISO = yd.toISOString().slice(0, 10);

  type Row = {
    id_tarefa: number;
    data_tarefa: string;
    empresa: string;
    cidade_uf: string | null;
    status_tarefa: string | null;
    quantidade_chapas: number | null;
    validacao_status: string | null;
    is_overnight: number | null;
    chapa_id: string | null;
    nome_chapa: string | null;
    status_contato: string | null;
  };

  const rows = await db.select<Row[]>(
    `SELECT t.id_tarefa, t.data_tarefa, t.empresa, t.cidade_uf, t.status_tarefa,
            t.quantidade_chapas, t.validacao_status, t.is_overnight,
            c.id AS chapa_id, c.nome_chapa, c.status_contato
     FROM tarefas t
     LEFT JOIN chapas c
       ON c.id_tarefa = t.id_tarefa
      AND c.status_contato != 'removido'
      AND c.data_remocao IS NULL
     WHERE t.ativo = 1
       AND t.status_tarefa NOT LIKE 'Cancel%'
       AND (
         date(t.data_tarefa) = ?
         OR (
           date(t.data_tarefa) = ?
           AND t.is_overnight = 1
           AND (t.validacao_status IS NULL OR t.validacao_status != 'subido_meu_chapa')
         )
       )`,
    [todayISO, yesterdayISO],
  );

  const map = new Map<number, TaskWithChapas>();
  for (const row of rows) {
    if (!map.has(row.id_tarefa)) {
      map.set(row.id_tarefa, {
        id_tarefa: row.id_tarefa,
        data_tarefa: row.data_tarefa,
        empresa: row.empresa,
        cidade_uf: row.cidade_uf,
        status_tarefa: row.status_tarefa ?? "",
        quantidade_chapas: row.quantidade_chapas ?? 0,
        is_overnight: row.is_overnight === 1,
        validacao_status: row.validacao_status,
        chapas: [],
        fup_log: [],
        urgent: false,
        continuingFromYesterday:
          row.is_overnight === 1 && fmtSP(row.data_tarefa, "yyyy-MM-dd") !== todayISO,
      });
    }
    if (row.chapa_id) {
      map.get(row.id_tarefa)!.chapas.push({
        id: row.chapa_id,
        nome_chapa: row.nome_chapa,
        telefone_chapa: null,
        cpf: null,
        status_contato: row.status_contato ?? "pendente",
        canal_contato: null,
      });
    }
  }
  return Array.from(map.values());
}

/** Monta lembretes ativos cujas tarefas entram na janela de tempo hoje. */
async function loadLembretes(tasks: TaskWithChapas[]): Promise<LembreteAlertItem[]> {
  try {
    const db = await getDb();
    type LRow = { id: string; empresa: string; mensagem: string; minutos_antes: number };
    const lRows = await db.select<LRow[]>(
      "SELECT id, empresa, mensagem, minutos_antes FROM lembretes WHERE ativo = 1",
    );
    const nowMs = Date.now();
    const built: LembreteAlertItem[] = [];
    for (const l of lRows) {
      for (const t of tasks) {
        if (!companyMatches(t.empresa, [l.empresa])) continue;
        if (
          t.validacao_status === "validacao_recebida" ||
          t.validacao_status === "subido_meu_chapa" ||
          t.status_tarefa === "Concluído"
        ) continue;
        const minutesUntil = (parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() - nowMs) / 60_000;
        if (minutesUntil < -30 || minutesUntil > l.minutos_antes) continue;
        built.push({
          id: `lembrete_${l.id}_${t.id_tarefa}`,
          taskId: t.id_tarefa,
          empresa: t.empresa,
          horario: t.data_tarefa,
          message: l.mensagem,
          minutesUntil,
        });
      }
    }
    return built;
  } catch {
    return []; // tabela lembretes pode não existir antes da migração 6
  }
}

export function AppStartup({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("syncing");
  const [steps, setSteps] = useState<Step[]>([]);
  const [visible, setVisible] = useState(false);
  const [actions, setActions] = useState<PriorityItem[]>([]);
  const [lembretes, setLembretes] = useState<LembreteAlertItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function run() {
      const s = readSettings();
      const hasMetabaseCardId = !!s.metabaseTarefasCardId;
      const hasCarteiraCardId = !!s.metabaseCarteiraCardId;

      let metabaseConfigured = false;
      try {
        const status = await invoke<{ configured: boolean }>("metabase_status");
        metabaseConfigured = status.configured;
      } catch { /* backend indisponível — pula sync */ }

      const hasMetabase = hasMetabaseCardId && metabaseConfigured;
      const hasCarteira = hasCarteiraCardId && metabaseConfigured;
      const hasRegistro = !!s.metabaseRegistroCardId && metabaseConfigured;
      const hasSaac = !!s.saacApiUrl && !!s.saacApiKey;
      const syncCarteira = hasCarteira && devesSincronizarCarteira();
      const syncRegistro = hasRegistro && devesSincronizarRegistro();

      // Tarefas a executar no boot, na ordem. Cada uma vira um step.
      const jobs: { label: string; run: () => Promise<unknown> }[] = [];
      if (hasMetabase) jobs.push({ label: "Sincronizando tarefas", run: () => sincronizarMetabase(true) });
      if (syncCarteira) jobs.push({ label: "Sincronizando carteira", run: () => sincronizarCarteira(true) });
      if (syncRegistro) jobs.push({ label: "Sincronizando cadastro", run: () => sincronizarRegistro(true) });
      if (hasSaac) jobs.push({ label: "Sincronizando leads", run: () => sincronizarLeadsSaac(true) });

      // Nada a sincronizar: pula direto pro app (decisão de produto).
      if (jobs.length === 0) { onDone(); return; }

      const initialSteps: Step[] = [
        { label: "Conexão verificada", status: "done" },
        ...jobs.map((j) => ({ label: j.label, status: "pending" as StepStatus })),
      ];

      setSteps(initialSteps);
      setVisible(true);
      await new Promise((r) => setTimeout(r, 60));
      setFadeIn(true);
      setProgress(8);

      const update = (idx: number, status: StepStatus) =>
        setSteps((prev) => prev.map((st, i) => i === idx ? { ...st, status } : st));

      // Progresso distribuído entre 8% e 92% pelos jobs.
      for (let j = 0; j < jobs.length; j++) {
        const stepIdx = j + 1; // step 0 é "Conexão verificada"
        update(stepIdx, "running");
        setProgress(Math.round(8 + ((j + 0.5) / jobs.length) * 84));
        try {
          await jobs[j].run();
          update(stepIdx, "done");
        } catch {
          update(stepIdx, "error");
        }
        setProgress(Math.round(8 + ((j + 1) / jobs.length) * 84));
      }

      setProgress(100);
      await new Promise((r) => setTimeout(r, 450));

      // Carrega ações recomendadas + lembretes do dia
      try {
        const tasks = await loadTodayTasks();
        const priorities = buildPriorities(tasks, s.fillRateWarningThreshold)
          .filter((p) => p.level !== "monitorar")
          .slice(0, 5);
        const lemb = await loadLembretes(tasks);
        setActions(priorities);
        setLembretes(lemb);
      } catch { /* silencioso — mostra estado vazio */ }

      // Crossfade para welcome
      setFadeIn(false);
      await new Promise((r) => setTimeout(r, 320));
      setPhase("welcome");
      await new Promise((r) => setTimeout(r, 40));
      setFadeIn(true);
    }

    run();
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance só quando não há nada para agir (estado calmo)
  useEffect(() => {
    if (phase !== "welcome") return;
    if (actions.length > 0 || lembretes.length > 0) return;
    autoRef.current = setTimeout(() => onDone(), 6000);
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, [phase, actions.length, lembretes.length, onDone]);

  function handleEnter() {
    if (autoRef.current) clearTimeout(autoRef.current);
    onDone();
  }

  function openTask(taskId: number) {
    if (autoRef.current) clearTimeout(autoRef.current);
    window.dispatchEvent(new CustomEvent("fup:flash-task", { detail: taskId }));
    onDone();
  }

  if (!visible) return null;

  const operador = readSettings().operadorNome?.trim() || "";
  const { text: greetWord, Icon: GreetIcon } = getGreeting();
  const greetLine = operador ? `${greetWord}, ${operador}` : greetWord;
  const nothingPending = actions.length === 0 && lembretes.length === 0;

  const transition = {
    opacity: fadeIn ? 1 : 0,
    transform: fadeIn ? "translateY(0px)" : "translateY(10px)",
    transition: "opacity 0.35s ease, transform 0.35s ease",
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{ background: BG }}
    >
      {/* ── SYNC PHASE ── */}
      {phase === "syncing" && (
        <div className="flex flex-col items-center" style={transition}>

          {/* Logo ring with glow pulse */}
          <div className="relative mb-7">
            <div
              className="animate-startup-glow-pulse"
              style={{
                width: 72, height: 72, borderRadius: "50%",
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <img src={logo} alt="MCM" style={{ height: 36, opacity: 0.92 }} />
            </div>
            {/* Rotating arc */}
            <svg
              width={72} height={72}
              style={{ position: "absolute", top: 0, left: 0, animation: "startup-spin 2s linear infinite" }}
              viewBox="0 0 72 72"
            >
              <circle
                cx="36" cy="36" r="34"
                fill="none"
                stroke={BLUE}
                strokeWidth="1.5"
                strokeOpacity="0.35"
                strokeDasharray="40 174"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* App name */}
          <p
            style={{
              fontFamily: "'Montserrat', sans-serif",
              color: TEXT_DIM,
              fontSize: "0.68rem",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: "2.2rem",
            }}
          >
            <span style={{ fontWeight: 300 }}>Meu </span>
            <span style={{ fontWeight: 900 }}>Chapa</span>
            <span style={{ fontWeight: 400 }}> Manager</span>
          </p>

          {/* Steps */}
          <div style={{ minWidth: 264, marginBottom: "2.2rem" }}>
            {steps.map((step, i) => (
              <div
                key={i}
                className="animate-startup-step-in"
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "5px 0",
                  animationDelay: `${i * 90}ms`,
                }}
              >
                {/* Status indicator */}
                <span style={{ width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {step.status === "done" && (
                    <CheckCircle2 size={16} style={{ color: GREEN }} />
                  )}
                  {step.status === "running" && (
                    <span
                      className="animate-startup-spin"
                      style={{
                        display: "inline-block", width: 14, height: 14, borderRadius: "50%",
                        border: `2px solid ${BLUE}30`,
                        borderTopColor: BLUE,
                      }}
                    />
                  )}
                  {step.status === "pending" && (
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: TEXT_DIM, display: "inline-block" }} />
                  )}
                  {step.status === "error" && (
                    <span style={{ fontSize: 14, color: RED, fontWeight: 700 }}>✗</span>
                  )}
                </span>

                <span style={{
                  fontSize: 13,
                  color: step.status === "running" ? TEXT_PRIMARY
                    : step.status === "done" ? "hsl(0 0% 100% / 0.45)"
                    : TEXT_DIM,
                  fontWeight: step.status === "running" ? 500 : 400,
                  letterSpacing: "0.01em",
                  transition: "color 0.3s ease",
                }}>
                  {step.label}
                  {step.status === "done" && (
                    <span style={{ color: GREEN, marginLeft: 6, fontSize: 11 }}>✓</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ width: 220, height: 2, background: "hsl(0 0% 100% / 0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${BLUE}, hsl(213 94% 78%))`,
              borderRadius: 99,
              transition: "width 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: `0 0 8px ${BLUE}60`,
            }} />
          </div>

          <p style={{ color: TEXT_DIM, fontSize: 11, marginTop: 12, letterSpacing: "0.05em" }}>
            {progress < 20 ? "iniciando…"
              : progress < 70 ? "buscando tarefas…"
              : progress < 95 ? "processando…"
              : "finalizando…"}
          </p>
        </div>
      )}

      {/* ── WELCOME PHASE ── */}
      {phase === "welcome" && (
        <div className="flex flex-col items-center text-center" style={{ ...transition, width: "100%", maxWidth: 540, padding: "0 24px" }}>

          {/* Greeting icon */}
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: SURFACE, border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: "1.1rem",
          }}>
            <GreetIcon size={24} style={{ color: AMBER }} strokeWidth={1.5} />
          </div>

          {/* Greeting */}
          <h1 style={{
            fontFamily: "'Comfortaa', 'Arial Rounded MT Bold', sans-serif",
            color: TEXT_PRIMARY,
            fontSize: "clamp(1.5rem, 4.5vw, 2.1rem)",
            fontWeight: 700,
            letterSpacing: "0.02em",
            margin: "0 0 5px",
          }}>
            {greetLine}
          </h1>
          <p style={{
            color: TEXT_MUTED,
            fontSize: "0.74rem",
            letterSpacing: "0.06em",
            marginBottom: "1.9rem",
            textTransform: "capitalize",
          }}>
            {todayLabelPtBR()} · sincronizado agora
          </p>

          {nothingPending ? (
            /* Estado calmo */
            <div className="animate-startup-metric-pop" style={{
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 18,
              padding: "26px 32px",
              marginBottom: "2.2rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}>
              <CheckCircle2 size={30} style={{ color: GREEN }} strokeWidth={1.5} />
              <p style={{ color: "hsl(0 0% 100% / 0.7)", fontSize: 14, fontWeight: 500 }}>
                Tudo certo por aqui
              </p>
              <p style={{ color: TEXT_MUTED, fontSize: 12 }}>
                Nenhuma ação recomendada ou lembrete agora.
              </p>
            </div>
          ) : (
            /* Ações recomendadas + lembretes */
            <div style={{ width: "100%", marginBottom: "1.8rem", textAlign: "left" }}>

              {/* Lembretes */}
              {lembretes.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => openTask(item.taskId)}
                  className="animate-startup-step-in startup-action-row"
                  style={{
                    width: "100%",
                    display: "flex", alignItems: "center", gap: 12,
                    background: SURFACE, border: `1px solid ${BORDER}`,
                    borderRadius: 12, padding: "11px 14px", marginBottom: 8,
                    cursor: "pointer", textAlign: "left",
                    animationDelay: `${i * 70}ms`,
                  }}
                >
                  <span style={{
                    flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    padding: "2px 6px", borderRadius: 5,
                    background: `${BLUE}22`, color: BLUE, border: `1px solid ${BLUE}55`,
                  }}>
                    LEMBRETE
                  </span>
                  <Bell size={14} style={{ color: BLUE, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.empresa.toLowerCase()}
                    </div>
                    <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.message}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "hsl(0 0% 100% / 0.5)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {fmtTime(item.horario)}
                  </span>
                  <ChevronRight size={15} style={{ color: TEXT_DIM, flexShrink: 0 }} />
                </button>
              ))}

              {/* Ações priorizadas */}
              {actions.map((item, i) => {
                const meta = LEVEL_DARK[item.level];
                return (
                  <button
                    key={item.task.id_tarefa}
                    onClick={() => openTask(item.task.id_tarefa)}
                    className="animate-startup-step-in startup-action-row"
                    style={{
                      width: "100%",
                      display: "flex", alignItems: "center", gap: 12,
                      background: SURFACE, border: `1px solid ${BORDER}`,
                      borderRadius: 12, padding: "11px 14px", marginBottom: 8,
                      cursor: "pointer", textAlign: "left",
                      animationDelay: `${(lembretes.length + i) * 70}ms`,
                    }}
                  >
                    <span style={{
                      flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                      padding: "2px 6px", borderRadius: 5,
                      background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55`,
                    }}>
                      {meta.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.task.empresa.toLowerCase()}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.reason}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: meta.color, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {item.confirmed}/{item.requested}
                    </span>
                    <span style={{
                      fontSize: 11, flexShrink: 0, width: 50, textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: item.minutesUntil <= 0 ? RED : item.minutesUntil <= 60 ? RED : item.minutesUntil <= 120 ? AMBER : "hsl(0 0% 100% / 0.5)",
                      display: "inline-flex", alignItems: "center", gap: 3, justifyContent: "flex-end",
                    }}>
                      {item.minutesUntil <= 0 ? <AlertTriangle size={11} /> : <Clock size={11} />}
                      {item.minutesUntil <= 0 ? "agora" : fmtMinutes(item.minutesUntil)}
                    </span>
                    <ChevronRight size={15} style={{ color: TEXT_DIM, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}

          {/* CTA button */}
          <button
            onClick={handleEnter}
            style={{
              background: "transparent",
              border: `1px solid hsl(0 0% 100% / 0.14)`,
              borderRadius: 99,
              color: "hsl(0 0% 100% / 0.65)",
              fontSize: 13,
              padding: "10px 28px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              letterSpacing: "0.04em",
              transition: "border-color 0.2s, color 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = "hsl(0 0% 100% / 0.35)";
              b.style.color = TEXT_PRIMARY;
              b.style.background = "hsl(0 0% 100% / 0.04)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = "hsl(0 0% 100% / 0.14)";
              b.style.color = "hsl(0 0% 100% / 0.65)";
              b.style.background = "transparent";
            }}
          >
            Entrar no painel
            <ArrowRight size={14} style={{ opacity: 0.5 }} />
          </button>

          {/* Auto-advance countdown line (só no estado calmo) */}
          {nothingPending && (
            <div style={{
              marginTop: "1.8rem",
              width: 100,
              height: 1,
              background: "hsl(0 0% 100% / 0.06)",
              borderRadius: 99,
              overflow: "hidden",
            }}>
              <div
                className="animate-startup-countdown"
                style={{
                  height: "100%",
                  background: "hsl(0 0% 100% / 0.2)",
                  borderRadius: 99,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
