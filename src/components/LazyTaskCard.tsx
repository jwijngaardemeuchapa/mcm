import { memo, useEffect, useRef, useState, type ComponentProps } from "react";
import { TaskCard } from "@/components/TaskCard";

// Cada TaskCard completo tem ~300 nós de DOM e dezenas de componentes; com 150-300
// tarefas no dia, montar todos de uma vez (ao abrir, ao trocar de visão/dia/filtro)
// travava a tela por vários segundos — e o usuário só vê 2 ou 3 por vez. Aqui o
// card só monta perto da área visível; antes disso fica um quadro leve com a mesma
// altura típica. Depois de montado nunca volta a ser quadro (sem "piscar" ao rolar).
//
// Quem precisa do card de verdade (rolar até ele, destacar uma chapa) chama
// montarCardAgora(id) e espera um instante.

export const EVENTO_MONTAR_CARD = "mcm:card-eager";

export function montarCardAgora(idTarefa: number): void {
  window.dispatchEvent(new CustomEvent<number>(EVENTO_MONTAR_CARD, { detail: idTarefa }));
}

// Altura típica de um card aberto (mediana medida ~610 px): mantém a barra de
// rolagem e a posição de "rolar até a tarefa" próximas do resultado final.
const ALTURA_QUADRO = 560;
// Começa a montar antes de entrar na tela, pra não ver o quadro ao rolar.
const MARGEM_ANTECIPACAO = "900px 0px";

type Props = ComponentProps<typeof TaskCard> & { eager?: boolean };

function LazyTaskCardBase({ eager, ...props }: Props) {
  const id = props.task.id_tarefa;
  const [montado, setMontado] = useState(!!eager);
  const quadro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (montado) return;
    const aoPedir = (e: Event) => {
      if ((e as CustomEvent<number>).detail === id) setMontado(true);
    };
    window.addEventListener(EVENTO_MONTAR_CARD, aoPedir);

    let observador: IntersectionObserver | undefined;
    const el = quadro.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      observador = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((x) => x.isIntersecting)) setMontado(true);
        },
        { rootMargin: MARGEM_ANTECIPACAO },
      );
      observador.observe(el);
    } else {
      setMontado(true); // sem IntersectionObserver: comportamento de antes
    }
    return () => {
      window.removeEventListener(EVENTO_MONTAR_CARD, aoPedir);
      observador?.disconnect();
    };
  }, [montado, id]);

  if (montado) return <TaskCard {...props} />;
  return (
    <div
      ref={quadro}
      data-task-card={id}
      data-lazy=""
      className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
      style={{ minHeight: ALTURA_QUADRO }}
    >
      <div className="px-4 py-3 text-sm text-muted-foreground">
        #{id} · {props.task.empresa}
      </div>
    </div>
  );
}

export const LazyTaskCard = memo(LazyTaskCardBase);
