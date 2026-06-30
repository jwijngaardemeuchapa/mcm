export type QuickLink = {
  id: string;
  name: string;
  url: string;
};

const KEY = "fup_quick_links";

const DEFAULTS: QuickLink[] = [
  { id: "default-1", name: "Contas a Pagar", url: "https://app.meu-chapa.com/admin/bills-to-pay" },
];

export function readQuickLinks(): QuickLink[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULTS];
    return JSON.parse(raw) as QuickLink[];
  } catch {
    return [...DEFAULTS];
  }
}

export function writeQuickLinks(links: QuickLink[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(links));
  } catch {
    /* noop */
  }
}
