import { nowSP, todayDateISO_SP } from "./datetime";

const LS_KEY = "mcm_intro_last_shown";
const LS_COUNT = "mcm_intro_open_count";

// Mostra intro se:
//   • Ainda não foi exibida 2 vezes desde a instalação
//   • OU é segunda-feira e ainda não foi exibida hoje
export function shouldShowIntro(): boolean {
  try {
    const count = parseInt(localStorage.getItem(LS_COUNT) ?? "0", 10);
    if (count < 2) return true;

    const lastShown = localStorage.getItem(LS_KEY);
    if (!lastShown) return true;

    const dayOfWeek = nowSP().getDay(); // 0=Dom, 1=Seg
    if (dayOfWeek === 1 && lastShown !== todayDateISO_SP()) return true;

    return false;
  } catch {
    return true;
  }
}

export function markIntroShown(): void {
  try {
    const count = parseInt(localStorage.getItem(LS_COUNT) ?? "0", 10);
    localStorage.setItem(LS_COUNT, String(count + 1));
    localStorage.setItem(LS_KEY, todayDateISO_SP());
  } catch {}
}
