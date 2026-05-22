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
