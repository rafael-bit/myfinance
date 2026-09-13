import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

import { Button } from "@/ui/button";



const GUIDE_KEY = "mf.guide.completed";

const MD_QUERY = "(min-width: 768px)";



export const GUIDE_STEPS = [

  {

    id: "welcome",

    title: "Bem-vindo.",

    body: "Três ideias bastam: o botão + lança, Finanças guarda o dia a dia, e transferência entre as suas contas não é gasto.",

    target: null as string | null,

    shape: "card" as const,

  },

  {

    id: "add",

    title: "Lance em um toque",

    body: "Este botão é o atalho principal. Despesa, receita, transferência ou investimento — sem percorrer menus.",

    target: "add",

    shape: "circle" as const,

  },

  {

    id: "activity",

    title: "Finanças",

    body: "Comece criando uma conta — banco, dinheiro ou corretora. O extrato e os cartões ficam neste espaço.",

    target: "activity",

    shape: "pill" as const,

  },

  {

    id: "invest",

    title: "Investir",

    body: "Aporte da conta corrente para a corretora não é despesa. Aqui vive a carteira e a rentabilidade.",

    target: "invest",

    shape: "pill" as const,

  },

  {

    id: "more",

    title: "Mais",

    body: "Metas, orçamento, patrimônio e backup. O navegador não é backup permanente — exporte um arquivo cifrado.",

    target: "more",

    shape: "pill" as const,

  },

  {

    id: "rules",

    title: "O que o app não mistura",

    body: "Parcela entra no mês de cada parcela. Compra no cartão só sai da conta no pagamento da fatura. A IA nunca calcula saldo.",

    target: null,

    shape: "card" as const,

  },

] as const;



type Spot = {

  top: number;

  left: number;

  width: number;

  height: number;

  shape: "circle" | "pill" | "card";

};



type GuideCtx = {

  active: boolean;

  step: number;

  start: () => void;

  next: () => void;

  skip: () => void;

};



const Ctx = createContext<GuideCtx | null>(null);



function isVisible(el: Element): el is HTMLElement {

  if (!(el instanceof HTMLElement)) return false;

  const style = getComputedStyle(el);

  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();

  return rect.width >= 2 && rect.height >= 2;

}



function findTourTarget(id: string): HTMLElement | null {

  const view = window.matchMedia(MD_QUERY).matches ? "desktop" : "mobile";

  const scoped = document.querySelector(`[data-tour="${id}"][data-tour-view="${view}"]`);

  if (scoped && isVisible(scoped)) return scoped;



  const nodes = [...document.querySelectorAll(`[data-tour="${id}"]`)];

  return nodes.find(isVisible) ?? null;

}



function measureSpot(el: HTMLElement, shape: Spot["shape"]): Spot {

  const rect = el.getBoundingClientRect();

  const pad = shape === "circle" ? 10 : 8;

  let { top, left, width, height } = rect;



  if (shape === "circle") {

    const size = Math.max(width, height) + pad * 2;

    left = rect.left + width / 2 - size / 2;

    top = rect.top + height / 2 - size / 2;

    width = size;

    height = size;

  } else {

    top -= pad;

    left -= pad;

    width += pad * 2;

    height += pad * 2;

  }



  return { top, left, width, height, shape };

}



function cardPosition(spot: Spot | null) {

  const vw = window.innerWidth;

  const vh = window.innerHeight;

  const cardW = Math.min(420, vw - 32);

  const cardH = 260;

  const pad = 16;



  if (!spot) {

    return {

      top: Math.max(pad, vh - cardH - pad - (window.matchMedia(MD_QUERY).matches ? 24 : 96)),

      left: Math.max(pad, (vw - cardW) / 2),

      width: cardW,

    };

  }



  const isDesktop = window.matchMedia(MD_QUERY).matches;



  if (isDesktop && spot.left < vw * 0.34) {

    return {

      top: Math.min(Math.max(spot.top, pad), vh - cardH - pad),

      left: Math.min(spot.left + spot.width + 20, vw - cardW - pad),

      width: cardW,

    };

  }



  if (spot.top > vh * 0.55) {

    return {

      top: Math.max(pad, spot.top - cardH - 20),

      left: Math.max(pad, Math.min(spot.left + spot.width / 2 - cardW / 2, vw - cardW - pad)),

      width: cardW,

    };

  }



  return {

    top: Math.min(spot.top + spot.height + 20, vh - cardH - pad),

    left: Math.max(pad, Math.min(spot.left + spot.width / 2 - cardW / 2, vw - cardW - pad)),

    width: cardW,

  };

}



export function GuideProvider({ children }: { children: ReactNode }) {

  const [step, setStep] = useState(-1);



  useEffect(() => {

    if (localStorage.getItem(GUIDE_KEY)) return;

    const timer = window.setTimeout(() => setStep(0), 500);

    return () => window.clearTimeout(timer);

  }, []);



  const skip = useCallback(() => {

    localStorage.setItem(GUIDE_KEY, "1");

    setStep(-1);

  }, []);



  const next = useCallback(() => {

    setStep((current) => {

      if (current >= GUIDE_STEPS.length - 1) {

        localStorage.setItem(GUIDE_KEY, "1");

        return -1;

      }

      return current + 1;

    });

  }, []);



  const start = useCallback(() => setStep(0), []);



  return (

    <Ctx.Provider value={{ active: step >= 0, step, start, next, skip }}>

      {children}

      {step >= 0 ? <GuideOverlay step={step} onNext={next} onSkip={skip} /> : null}

    </Ctx.Provider>

  );

}



export function useGuide() {

  const ctx = useContext(Ctx);

  if (!ctx) throw new Error("GuideProvider ausente");

  return ctx;

}



function GuideOverlay({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {

  const item = GUIDE_STEPS[step];

  const [spot, setSpot] = useState<Spot | null>(null);

  const [cardStyle, setCardStyle] = useState<{ top: number; left: number; width: number }>(() => cardPosition(null));



  const refresh = useCallback(() => {

    if (!item.target) {

      setSpot(null);

      setCardStyle(cardPosition(null));

      return;

    }

    const el = findTourTarget(item.target);

    if (!el) {

      setSpot(null);

      setCardStyle(cardPosition(null));

      return;

    }

    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });

    const nextSpot = measureSpot(el, item.shape);

    setSpot(nextSpot);

    setCardStyle(cardPosition(nextSpot));

  }, [item.target, item.shape]);



  useLayoutEffect(() => {

    refresh();

    const timer = window.setTimeout(refresh, 120);

    return () => window.clearTimeout(timer);

  }, [refresh, step]);



  useEffect(() => {

    window.addEventListener("resize", refresh);

    window.addEventListener("scroll", refresh, true);

    return () => {

      window.removeEventListener("resize", refresh);

      window.removeEventListener("scroll", refresh, true);

    };

  }, [refresh]);



  const last = step === GUIDE_STEPS.length - 1;

  const radius = spot?.shape === "circle" ? "9999px" : spot?.shape === "pill" ? "9999px" : "1.75rem";



  return (

    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="guide-title">

      {spot ? (

        <div

          className="pointer-events-none absolute ring-2 ring-gold ring-offset-2 ring-offset-transparent"

          style={{

            top: spot.top,

            left: spot.left,

            width: spot.width,

            height: spot.height,

            borderRadius: radius,

            boxShadow: "0 0 0 9999px rgba(11, 10, 8, 0.72)",

          }}

        />

      ) : (

        <div className="absolute inset-0 bg-[#0b0a08]/72 backdrop-blur-[2px]" />

      )}



      <div

        className="absolute z-[81]"

        style={{ top: cardStyle.top, left: cardStyle.left, width: cardStyle.width }}

      >

        <div className="rounded-[1.75rem] bg-card p-6 text-foreground shadow-2xl hairline">

          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">

            {step + 1} / {GUIDE_STEPS.length}

          </p>

          <h2 id="guide-title" className="font-display mt-2 text-3xl leading-tight">

            {item.title}

          </h2>

          <p className="mt-3 text-sm leading-7 text-muted">{item.body}</p>

          <div className="mt-6 flex items-center justify-between gap-3">

            <button type="button" className="text-sm text-muted hover:text-foreground" onClick={onSkip}>

              Pular

            </button>

            <Button onClick={onNext}>{last ? "Começar a usar" : "Continuar"}</Button>

          </div>

        </div>

      </div>

    </div>

  );

}


