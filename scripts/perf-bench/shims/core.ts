export async function invoke<T>(cmd: string, _args?: unknown): Promise<T> {
  switch (cmd) {
    case "metabase_status": return { configured: false, base_url: "" } as T;
    case "check_notification_responses":
    case "check_bid_responses": return [] as T;
    default: return null as T;
  }
}
export function convertFileSrc(p: string) { return p; }
export function isTauri() { return false; }
