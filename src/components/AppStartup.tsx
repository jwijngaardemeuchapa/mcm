import { useState, useEffect, useRef } from "react";
import { Sun, Moon, Sunset, CheckCircle2, ArrowRight } from "lucide-react";
import logo from "@/assets/logo-meuchapa.png";
import { invoke } from "@tauri-apps/api/core";
import { sincronizarMetabase, sincronizarCarteira, devesSincronizarCarteira } from "@/lib/metabaseSync";
import { readSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";
import { todayDateISO_SP } from "@/lib/datetime";

type Phase = "syncing" | "welcome";
type StepStatus = "pending" | "running" | "done" | "error";
type Step = { label: string; status: StepStatus };
type Metrics = { tarefas: number; pendentes: number; confirmados: number };

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

function CountUp({ target, delay = 0 }: { target: number; delay?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      if (target === 0) { setVal(0); return; }
      let cur = 0;
      const totalMs = 900;
      const fps = 60;
      const tickMs = 1000 / fps;
      const steps = Math.round(totalMs / tickMs);
      const inc = target / steps;
      const id = setInterval(() => {
        cur = Math.min(cur + inc, target);
        setVal(Math.round(cur));
        if (cur >= target) clearInterval(id);
      }, tickMs);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(t);
  }, [target, delay]);
  return <>{val}</>;
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

export function AppStartup({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("syncing");
  const [steps, setSteps] = useState<Step[]>([]);
  const [visible, setVisible] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({ tarefas: 0, pendentes: 0, confirmados: 0 });
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
      const syncCarteira = hasCarteira && devesSincronizarCarteira();

      if (!hasMetabase && !syncCarteira) { onDone(); return; }

      const initialSteps: Step[] = [
        { label: "Conexão verificada", status: "done" },
        hasMetabase ? { label: "Sincronizando tarefas", status: "pending" } : null,
        syncCarteira ? { label: "Sincronizando carteira", status: "pending" } : null,
      ].filter(Boolean) as Step[];

      setSteps(initialSteps);
      setVisible(true);
      await new Promise((r) => setTimeout(r, 60));
      setFadeIn(true);
      setProgress(8);

      const update = (idx: number, status: StepStatus) =>
        setSteps((prev) => prev.map((st, i) => i === idx ? { ...st, status } : st));

      let idx = 1;
      if (hasMetabase) {
        update(idx, "running");
        setProgress(15);
        try {
          await sincronizarMetabase(true);
          update(idx, "done");
          setProgress(syncCarteira ? 60 : 92);
        } catch {
          update(idx, "error");
        }
        idx++;
      }
      if (syncCarteira) {
        update(idx, "running");
        try {
          await sincronizarCarteira(true);
          update(idx, "done");
          setProgress(92);
        } catch {
          update(idx, "error");
        }
      }

      setProgress(100);
      await new Promise((r) => setTimeout(r, 450));

      // Query today's metrics from SQLite
      try {
        const db = await getDb();
        const today = todayDateISO_SP();
        const [t, p, c] = await Promise.all([
          db.select<{ n: number }[]>(
            `SELECT COUNT(DISTINCT id_tarefa) as n FROM tarefas
             WHERE ativo = 1 AND DATE(data_tarefa) = ?
             AND LOWER(COALESCE(status_tarefa,'')) NOT LIKE 'cancel%'`,
            [today],
          ),
          db.select<{ n: number }[]>(
            `SELECT COUNT(*) as n FROM chapas c
             JOIN tarefas t ON c.id_tarefa = t.id_tarefa
             WHERE t.ativo = 1 AND DATE(t.data_tarefa) = ?
               AND c.status_contato = 'pendente' AND c.nome_chapa IS NOT NULL`,
            [today],
          ),
          db.select<{ n: number }[]>(
            `SELECT COUNT(*) as n FROM chapas c
             JOIN tarefas t ON c.id_tarefa = t.id_tarefa
             WHERE t.ativo = 1 AND DATE(t.data_tarefa) = ?
               AND c.status_contato = 'confirmado' AND c.nome_chapa IS NOT NULL`,
            [today],
          ),
        ]);
        setMetrics({
          tarefas: t[0]?.n ?? 0,
          pendentes: p[0]?.n ?? 0,
          confirmados: c[0]?.n ?? 0,
        });
      } catch { /* silencioso — mostra zeros */ }

      // Crossfade to welcome
      setFadeIn(false);
      await new Promise((r) => setTimeout(r, 320));
      setPhase("welcome");
      await new Promise((r) => setTimeout(r, 40));
      setFadeIn(true);

      autoRef.current = setTimeout(() => onDone(), 6200);
    }

    run();
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEnter() {
    if (autoRef.current) clearTimeout(autoRef.current);
    onDone();
  }

  if (!visible) return null;

  const operador = readSettings().operadorNome?.trim() || "";
  const { text: greetWord, Icon: GreetIcon } = getGreeting();
  const greetLine = operador ? `${greetWord}, ${operador}` : greetWord;

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
        <div className="flex flex-col items-center text-center" style={transition}>

          {/* Greeting icon */}
          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            background: SURFACE, border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: "1.4rem",
          }}>
            <GreetIcon size={26} style={{ color: AMBER }} strokeWidth={1.5} />
          </div>

          {/* Greeting */}
          <h1 style={{
            fontFamily: "'Comfortaa', 'Arial Rounded MT Bold', sans-serif",
            color: TEXT_PRIMARY,
            fontSize: "clamp(1.7rem, 5vw, 2.4rem)",
            fontWeight: 700,
            letterSpacing: "0.02em",
            margin: "0 0 6px",
          }}>
            {greetLine}
          </h1>
          <p style={{
            color: TEXT_MUTED,
            fontSize: "0.75rem",
            letterSpacing: "0.07em",
            marginBottom: "2.4rem",
            textTransform: "capitalize",
          }}>
            {todayLabelPtBR()} · sincronizado agora
          </p>

          {/* Metric cards */}
          <div style={{ display: "flex", gap: 14, marginBottom: "2.6rem", flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { val: metrics.tarefas,    label: "tarefas hoje",  color: BLUE,  delay: 80 },
              { val: metrics.pendentes,  label: "a contatar",    color: AMBER, delay: 180 },
              { val: metrics.confirmados,label: "confirmados",   color: GREEN, delay: 280 },
            ].map((m, i) => (
              <div
                key={i}
                className="animate-startup-metric-pop"
                style={{
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 18,
                  padding: "20px 26px",
                  minWidth: 104,
                  animationDelay: `${m.delay}ms`,
                }}
              >
                <div style={{
                  fontSize: "2.3rem",
                  fontWeight: 700,
                  color: m.color,
                  lineHeight: 1,
                  marginBottom: 7,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}>
                  <CountUp target={m.val} delay={m.delay} />
                </div>
                <div style={{
                  fontSize: 10,
                  color: TEXT_MUTED,
                  textTransform: "uppercase",
                  letterSpacing: "0.11em",
                  fontWeight: 500,
                }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>

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

          {/* Auto-advance countdown line */}
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
        </div>
      )}
    </div>
  );
}
