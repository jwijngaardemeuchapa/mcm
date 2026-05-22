/** Strips accents/diacritics and lowercases — for accent-insensitive search. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
