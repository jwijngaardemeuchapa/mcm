import { useEffect, useState } from "react";

const PARTICLES: { tx: number; ty: number; rot: number; color: string; delay: number; shape: "square" | "circle" }[] = [
  { tx: -62, ty: -95,  rot: 240, color: "#e85f00", delay: 0,   shape: "square"  },
  { tx:  18, ty: -115, rot: 180, color: "#1f9a5e", delay: 40,  shape: "circle"  },
  { tx:  72, ty: -82,  rot: 300, color: "#f5a623", delay: 80,  shape: "square"  },
  { tx: -32, ty: -130, rot: 120, color: "#7b5cf6", delay: 20,  shape: "circle"  },
  { tx:  52, ty: -102, rot: 60,  color: "#e85f00", delay: 60,  shape: "square"  },
  { tx: -75, ty: -62,  rot: 200, color: "#1f9a5e", delay: 100, shape: "circle"  },
  { tx:  92, ty: -52,  rot: 340, color: "#f5a623", delay: 30,  shape: "square"  },
  { tx: -48, ty: -118, rot: 270, color: "#7b5cf6", delay: 70,  shape: "circle"  },
  { tx:  28, ty: -72,  rot: 90,  color: "#e85f00", delay: 50,  shape: "square"  },
  { tx: -22, ty: -98,  rot: 150, color: "#1f9a5e", delay: 90,  shape: "circle"  },
  { tx:  45, ty: -58,  rot: 30,  color: "#f5a623", delay: 10,  shape: "square"  },
  { tx: -55, ty: -45,  rot: 315, color: "#7b5cf6", delay: 65,  shape: "circle"  },
];

type Props = {
  active: boolean;
  /** className for the positioning wrapper — defaults to full-inset overlay */
  className?: string;
};

export function Confetti({ active, className }: Props) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (active) setKey((k) => k + 1);
  }, [active]);

  if (!active) return null;

  return (
    <div
      key={key}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-visible z-50 ${className ?? ""}`}
    >
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="confetti-particle"
          style={{
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : "2px",
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
            "--rot": `${p.rot}deg`,
            animationDelay: `${p.delay}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
