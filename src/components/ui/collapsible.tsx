import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

// O CollapsibleContent do Radix SEMPRE monta o contêiner (mesmo fechado) e mede o
// layout dele com getBoundingClientRect num layout effect, pra poder animar a
// altura. Com 3 blocos desses por TaskCard e centenas de cards, eram ~900 reflows
// forçados a cada montagem da lista (segundos de tela travada) — e nenhum dos usos
// do app anima. Aqui o conteúdo só existe enquanto aberto; aberto, é o do Radix
// de sempre (mesmos ids/atributos/animação, se alguém passar classe de animação).
const AbertoContext = React.createContext(false);

const Collapsible = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root>
>(({ open, defaultOpen, onOpenChange, ...props }, ref) => {
  const [interno, setInterno] = React.useState(defaultOpen ?? false);
  const aberto = open ?? interno;
  const aoMudar = React.useCallback(
    (v: boolean) => {
      setInterno(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  return (
    <AbertoContext.Provider value={aberto}>
      <CollapsiblePrimitive.Root ref={ref} open={aberto} onOpenChange={aoMudar} {...props} />
    </AbertoContext.Provider>
  );
});
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ forceMount, ...props }, ref) => {
  const aberto = React.useContext(AbertoContext);
  if (!aberto && !forceMount) return null;
  return <CollapsiblePrimitive.CollapsibleContent ref={ref} forceMount={forceMount} {...props} />;
});
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
