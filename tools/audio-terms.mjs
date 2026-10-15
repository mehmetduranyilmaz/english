// find-uk-audio.mjs ve find-commons-audio.mjs için ortak parçalar.
import { readFile, readdir } from "node:fs/promises";

// Öncelik sırası: önce standart British (RP/SSB), sonra genel UK, sonra İngiltere bölgeleri.
// "British Columbia" (Kanada) ve "New England" (ABD) British sayılmaz.
export const ACCENTS = [
  /\b(RP|SSB|Received Pronunciation|Standard Southern British)\b/i,
  /\bUK\b|\bBritish\b(?! Columbia)/i,
  /\bSouthern England\b|(?<!New )\bEngland\b|\bLondon\b/i,
];

// Derslerdeki ve paketlerdeki tek kelimelik terimler (Wiktionary / Commons'ta sadece bunların kaydı var).
export async function audioTerms(root) {
  const dir = new URL("data/lessons/", root);
  const terms = new Set();
  const skip = new Set();
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    const lesson = JSON.parse(await readFile(new URL(f, dir), "utf8"));
    for (const w of lesson.words) {
      // noRecording: kayıt dersin öğrettiği okunuşla uyuşmuyor (ör. "a" kaydı vurgulu "ey").
      if (w.noRecording) skip.add(w.en.toLowerCase());
      terms.add(w.en);
      if (w.plural) terms.add(w.plural.en);
    }
    for (const ex of lesson.exercises) if (ex.say) terms.add(ex.say);
  }
  // Kelime paketleri (ref olanlar zaten derslerde).
  try {
    const index = JSON.parse(await readFile(new URL("data/packs/index.json", root), "utf8"));
    for (const meta of index.packs) {
      const pack = JSON.parse(await readFile(new URL(`data/packs/${meta.id}.json`, root), "utf8"));
      for (const w of pack.words) {
        if (w.ref) continue;
        if (w.noRecording) skip.add(w.en.toLowerCase());
        terms.add(w.en);
      }
    }
  } catch {
    // paket yoksa sadece dersler
  }
  return { terms: [...terms].filter(t => !t.includes(" ") && !skip.has(t.toLowerCase())), skip };
}
