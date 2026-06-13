import { useEffect, useRef, useState } from "react";
import { markIntroShown } from "@/lib/introLogic";

type Phase = "video" | "text" | "out";

interface Props {
  onDone: () => void;
}

export function IntroScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("video");
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function advance(next: Phase) {
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    setPhase(next);
  }

  function goText() {
    advance("text");
    textTimerRef.current = setTimeout(() => advance("out"), 2800);
  }

  function goOut() {
    advance("out");
  }

  // Fallback: se o vídeo travar ou não carregar (vídeo tem 6s, buffer de 2.5s)
  useEffect(() => {
    const t = setTimeout(goText, 8500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After "out" phase starts, wait for fade-out then call onDone
  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => {
      markIntroShown();
      onDone();
    }, 700);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  useEffect(() => {
    return () => {
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    };
  }, []);

  const isOut = phase === "out";
  const showText = phase === "text" || phase === "out";

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center cursor-pointer select-none transition-opacity duration-700 ease-out ${
        isOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ background: "hsl(225 25% 6%)" }}
      onClick={goOut}
    >
      {/* Skip hint */}
      {!isOut && (
        <p className="absolute top-6 right-8 text-xs tracking-wide pointer-events-none" style={{ color: "hsl(0 0% 100% / 0.2)" }}>
          clique para pular
        </p>
      )}

      {/* Version */}
      {!isOut && (
        <p className="absolute bottom-6 left-0 right-0 text-center text-xs pointer-events-none" style={{ color: "hsl(0 0% 100% / 0.15)" }}>
          Meu Chapa Manager
        </p>
      )}

      {/* Video — mix-blend-mode: screen torna o fundo preto transparente */}
      {phase === "video" && (
        <video
          src="/intro.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={goText}
          onError={goText}
          style={{
            maxHeight: "65vh",
            maxWidth: "65vw",
            width: "min(520px, 65vw)",
            aspectRatio: "1 / 1",
            objectFit: "contain",
            pointerEvents: "none",
            mixBlendMode: "screen",
          }}
          className="animate-intro-fade-in"
        />
      )}

      {/* Text reveal */}
      {showText && (
        <div
          className="flex flex-col items-center gap-5 text-center px-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* App name — Montserrat: "Meu" light, "Chapa" black, "Manager" regular */}
          <p
            className="uppercase animate-intro-slide-up"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              color: "hsl(0 0% 100% / 0.38)",
              fontSize: "0.8rem",
              letterSpacing: "0.32em",
              animationDelay: "0ms",
            }}
          >
            <span style={{ fontWeight: 300 }}>Meu </span>
            <span style={{ fontWeight: 900 }}>Chapa</span>
            <span style={{ fontWeight: 400 }}> Manager</span>
          </p>

          {/* Slogan — Comfortaa com kerning largo, identidade visual da marca */}
          <h1
            className="leading-tight animate-intro-slide-up"
            style={{
              fontFamily: "'Comfortaa', 'Arial Rounded MT Bold', sans-serif",
              fontWeight: 700,
              color: "hsl(0 0% 100%)",
              fontSize: "clamp(2.2rem, 7vw, 4.5rem)",
              letterSpacing: "0.04em",
              animationDelay: "90ms",
            }}
          >
            Precisou?{" "}
            <span style={{ color: "hsl(24 92% 65%)" }}>Tá aqui!</span>
          </h1>

          {/* Accent bar */}
          <div
            className="h-px animate-intro-bar-grow"
            style={{
              width: "160px",
              background: "linear-gradient(90deg, transparent, hsl(24 92% 55%), transparent)",
            }}
          />
        </div>
      )}
    </div>
  );
}
