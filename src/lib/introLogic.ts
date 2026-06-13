import { nowSP, todayDateISO_SP } from "./datetime";

const LS_KEY = "mcm_intro_last_shown";

export function shouldShowIntro(): boolean {
  try {
    const lastShown = localStorage.getItem(LS_KEY);
    if (!lastShown) return true;
    const todaySP = todayDateISO_SP();
    const dayOfWeek = nowSP().getDay(); // 0=Dom, 1=Seg
    if (dayOfWeek === 1 && lastShown !== todaySP) return true;
    return false;
  } catch {
    return true;
  }
}

export function markIntroShown(): void {
  try {
    localStorage.setItem(LS_KEY, todayDateISO_SP());
  } catch {}
}
