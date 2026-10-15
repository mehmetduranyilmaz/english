// Ders ve kelime paketi verisini yükler; tüm kelimeleri tek bir dizinde toplar.
export let curriculum;
export let lessonIds = [];
export const lessonCache = {};
export let packIndex = { groups: [], packs: [] };
export const packCache = {};
// Kelime anahtarı (küçük harf) → kelime + kaynağı ({ kind: "lesson" | "pack", id, title, group })
export const wordIndex = new Map();

export const wordKey = w => w.en.toLowerCase();
export const lessonKeys = lesson => lesson.words.map(wordKey);

export async function getLesson(id) {
  lessonCache[id] ??= await (await fetch(`data/lessons/${id}.json`)).json();
  return lessonCache[id];
}

// Paket kelimesi { ref: "monday" } ise derslerdeki (veya önceki paketteki) kelimeye işaret eder.
export function packWords(pack) {
  return pack.words.map(w => (w.ref ? wordIndex.get(w.ref.toLowerCase()) : wordIndex.get(wordKey(w)))).filter(Boolean);
}

export const packKeys = pack => packWords(pack).map(wordKey);

export async function loadData() {
  curriculum = await (await fetch("data/curriculum.json")).json();
  lessonIds = curriculum.levels.flatMap(l => l.stages.flatMap(s => s.lessons));
  const lessons = await Promise.all(lessonIds.map(getLesson));
  for (const lesson of lessons) {
    const level = lesson.id.slice(0, 2).toUpperCase();
    for (const w of lesson.words) {
      if (!wordIndex.has(wordKey(w))) wordIndex.set(wordKey(w), { ...w, level, src: { kind: "lesson", id: lesson.id, title: lesson.title } });
    }
  }

  try {
    packIndex = await (await fetch("data/packs/index.json")).json();
  } catch {
    packIndex = { groups: [], packs: [] };
  }
  const packs = await Promise.all(packIndex.packs.map(async p => {
    try {
      packCache[p.id] = await (await fetch(`data/packs/${p.id}.json`)).json();
    } catch {
      packCache[p.id] = { ...p, words: [] };
    }
    return packCache[p.id];
  }));
  for (const pack of packs) {
    for (const w of pack.words) {
      if (!w.ref && !wordIndex.has(wordKey(w))) {
        wordIndex.set(wordKey(w), { ...w, level: w.level || pack.level, src: { kind: "pack", id: pack.id, title: pack.title, group: pack.group } });
      }
      // Kelime hangi paket gruplarında geçiyorsa (atıf dahil) o grupların süzgecinde görünsün.
      const entry = wordIndex.get((w.ref || w.en).toLowerCase());
      if (entry) (entry.groups ??= new Set()).add(pack.group);
    }
  }
  return lessons;
}
