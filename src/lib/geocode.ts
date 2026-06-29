import { getDb } from "@/lib/db";

export type LatLng = { lat: number; lng: number };
type GeoCb = (cep: string, coords: LatLng | null) => void;

class CepGeocoder {
  private queue: string[] = [];
  private cbs = new Map<string, GeoCb[]>();
  private running = false;
  private lastAt = 0;

  enqueue(rawCep: string, cb: GeoCb): void {
    const cep = rawCep.replace(/\D/g, "");
    if (!cep) { cb(rawCep, null); return; }
    if (this.cbs.has(cep)) { this.cbs.get(cep)!.push(cb); return; }
    this.cbs.set(cep, [cb]);
    this.queue.push(cep);
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

      try {
        const db = await getDb();
        await db.execute(
          "INSERT OR REPLACE INTO cidade_cache (chave, cidade, estado, lat, lng, geocodificado_em) VALUES (?, ?, ?, ?, ?, ?)",
          [key, cidade, estado, coords?.lat ?? null, coords?.lng ?? null, new Date().toISOString()],
        );
      } catch { /* noop */ }

      callbacks.forEach((cb) => cb(key, coords));
    }
    this.running = false;
  }
}

export const cityGeocoder = new CityGeocoder();
