import { getDb } from "@/lib/db";

export type LatLng = { lat: number; lng: number };
type GeoCb = (cep: string, coords: LatLng | null) => void;

class CepGeocoder {
  private queue: string[] = [];
  private cbs = new Map<string, GeoCb[]>();
  private running = false;
  private lastAt = 0;

  // `background: true` (varredura proativa de backfill) sempre vai pro FIM
  // da fila — nunca atrasa uma consulta em primeiro plano (abrir um card do
  // BID). Chamadas normais (sem opts) furam a fila: se o CEP já estava
  // enfileirado só pelo backfill, é promovido pro início agora.
  enqueue(rawCep: string, cb: GeoCb, opts?: { background?: boolean }): void {
    const cep = rawCep.replace(/\D/g, "");
    if (!cep) { cb(rawCep, null); return; }
    const background = opts?.background ?? false;
    if (this.cbs.has(cep)) {
      this.cbs.get(cep)!.push(cb);
      if (!background) {
        const idx = this.queue.indexOf(cep);
        if (idx > 0) { this.queue.splice(idx, 1); this.queue.unshift(cep); }
      }
      return;
    }
    this.cbs.set(cep, [cb]);
    if (background) this.queue.push(cep);
    else this.queue.unshift(cep);
    if (!this.running) this._run();
  }

  private async _run(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const cep = this.queue.shift()!;
      const callbacks = this.cbs.get(cep) ?? [];
      this.cbs.delete(cep);

      try {
        const db = await getDb();
        const rows = await db.select<{ lat: number | null; lng: number | null }[]>(
          "SELECT lat, lng FROM cep_cache WHERE cep = ?",
          [cep],
        );
        if (rows.length > 0) {
          const { lat, lng } = rows[0];
          callbacks.forEach((cb) => cb(cep, lat != null && lng != null ? { lat, lng } : null));
          continue;
        }
      } catch { /* noop */ }

      const elapsed = Date.now() - this.lastAt;
      if (elapsed < 1100) await new Promise<void>((r) => setTimeout(r, 1100 - elapsed));
      this.lastAt = Date.now();

      let coords: LatLng | null = null;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?postalcode=${cep}&country=BR&format=json&limit=1`,
          { headers: { "User-Agent": "MCM-FUP-Manager/1.0", "Accept-Language": "pt-BR" } },
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0)
            coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
      } catch { /* network */ }

      try {
        const db = await getDb();
        await db.execute(
          "INSERT OR REPLACE INTO cep_cache (cep, lat, lng, geocodificado_em) VALUES (?, ?, ?, ?)",
          [cep, coords?.lat ?? null, coords?.lng ?? null, new Date().toISOString()],
        );
      } catch { /* noop */ }

      callbacks.forEach((cb) => cb(cep, coords));
    }
    this.running = false;
  }
}

export const cepGeocoder = new CepGeocoder();

/**
 * Backfill proativo do cep_cache: varre CEPs de chapa_registry e
 * leads_regiao que ainda não têm coordenada, e enfileira todos como
 * `background: true` — nunca disputa com uma consulta em primeiro plano
 * (abrir um card do BID sempre fura a fila, ver enqueue() acima).
 * Autolimitante: uma vez que o cache alcança a base, a query WHERE
 * cc.cep IS NULL retorna vazio e a chamada seguinte não enfileira nada.
 * Chamar 1x depois do boot (AppStartup onDone), nunca bloqueante.
 */
export async function backfillCepCache(): Promise<number> {
  const db = await getDb();
  const missing = await db.select<{ cep: string }[]>(`
    SELECT DISTINCT cep FROM (
      SELECT REPLACE(REPLACE(r.cep,' ',''),'-','') as cep FROM chapa_registry r WHERE r.cep IS NOT NULL AND r.cep != ''
      UNION
      SELECT REPLACE(REPLACE(l.cep,' ',''),'-','') as cep FROM leads_regiao l WHERE l.cep IS NOT NULL AND l.cep != ''
    ) x
    WHERE cep != '' AND cep NOT IN (SELECT cep FROM cep_cache)
  `);
  for (const { cep } of missing) {
    if (!cep) continue;
    cepGeocoder.enqueue(cep, () => { /* backfill — só grava no cache, sem callback de UI */ }, { background: true });
  }
  return missing.length;
}

/* ── Geocodificação por cidade ──────────────────────────────────────
   Leads Saac não têm CEP; a distância no BID vem do centroide da cidade.
   Espelha o CepGeocoder (fila + rate-limit 1.1s + cache em cidade_cache). */
type CityCb = (key: string, coords: LatLng | null) => void;

function cityKey(cidade: string, estado: string): string {
  return `${cidade.trim().toLowerCase()}|${(estado ?? "").trim().toUpperCase()}`;
}

class CityGeocoder {
  private queue: { cidade: string; estado: string; key: string }[] = [];
  private cbs = new Map<string, CityCb[]>();
  private running = false;
  private lastAt = 0;

  enqueue(cidade: string, estado: string, cb: CityCb): void {
    const c = (cidade ?? "").trim();
    if (!c) { cb(cityKey(cidade ?? "", estado ?? ""), null); return; }
    const key = cityKey(c, estado ?? "");
    if (this.cbs.has(key)) { this.cbs.get(key)!.push(cb); return; }
    this.cbs.set(key, [cb]);
    this.queue.push({ cidade: c, estado: (estado ?? "").trim(), key });
    if (!this.running) this._run();
  }

  private async _run(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const { cidade, estado, key } = this.queue.shift()!;
      const callbacks = this.cbs.get(key) ?? [];
      this.cbs.delete(key);

      try {
        const db = await getDb();
        const rows = await db.select<{ lat: number | null; lng: number | null }[]>(
          "SELECT lat, lng FROM cidade_cache WHERE chave = ?",
          [key],
        );
        if (rows.length > 0) {
          const { lat, lng } = rows[0];
          callbacks.forEach((cb) => cb(key, lat != null && lng != null ? { lat, lng } : null));
          continue;
        }
      } catch { /* noop */ }

      const elapsed = Date.now() - this.lastAt;
      if (elapsed < 1100) await new Promise<void>((r) => setTimeout(r, 1100 - elapsed));
      this.lastAt = Date.now();

      let coords: LatLng | null = null;
      try {
        const params = new URLSearchParams({ city: cidade, country: "BR", format: "json", limit: "1" });
        if (estado) params.set("state", estado);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          { headers: { "User-Agent": "MCM-FUP-Manager/1.0", "Accept-Language": "pt-BR" } },
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0)
            coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
      } catch { /* network */ }

      // Só cacheia geocodes bem-sucedidos: cachear null "envenena" a cidade permanentemente
      // (próximas chamadas lêem o cache e pulam o Nominatim sem nova tentativa).
      if (coords) {
        try {
          const db = await getDb();
          await db.execute(
            "INSERT OR REPLACE INTO cidade_cache (chave, cidade, estado, lat, lng, geocodificado_em) VALUES (?, ?, ?, ?, ?, ?)",
            [key, cidade, estado, coords.lat, coords.lng, new Date().toISOString()],
          );
        } catch { /* noop */ }
      }

      callbacks.forEach((cb) => cb(key, coords));
    }
    this.running = false;
  }
}

export const cityGeocoder = new CityGeocoder();
