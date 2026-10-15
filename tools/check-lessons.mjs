// Ders verisini kontrol eder: okunuş biçimi, seçmeli soruların cevabı, tekrar eden kelimeler.
// Kullanım: node tools/check-lessons.mjs
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const curriculum = JSON.parse(await readFile(new URL("data/curriculum.json", ROOT), "utf8"));
const ids = curriculum.levels.flatMap(l => l.stages.flatMap(s => s.lessons));

const problems = [];
const seen = new Map();
let words = 0;
let exercises = 0;

// Okunuşlarda fonetik sembol olmamalı (kullanıcı kuralı): sadece Türkçe harfler.
const IPA = /[ðθʃʒŋəɪʊʌæɒɔɜːˈˌ]/;
const badReading = r =>
  IPA.test(r) || /\{[^dtwa]\}/.test(r) || r.split(/[ -]/).some(p => p.includes("[") && !(p.startsWith("[") && p.endsWith("]")));

for (const id of ids) {
  const lesson = JSON.parse(await readFile(new URL(`data/lessons/${id}.json`, ROOT), "utf8"));
  if (lesson.id !== id) problems.push(`${id}: dosyadaki id "${lesson.id}"`);
  const readings = [
    ...lesson.words.flatMap(w => [w.read, w.plural?.read]).filter(Boolean),
    ...lesson.sections.flatMap(s => [...s.body.matchAll(/«([^»]+)»/g)].map(m => m[1])),
  ];
  for (const w of lesson.words) {
    if (!w.read) problems.push(`${id}: "${w.en}" okunuşu yok`);
    if (w.plural && !w.plural.read) problems.push(`${id}: "${w.plural.en}" çoğul okunuşu yok`);
    const key = w.en.toLowerCase();
    if (seen.has(key)) problems.push(`${id}: "${w.en}" kelimesi ${seen.get(key)} dersinde de var`);
    else seen.set(key, id);
  }
  for (const r of readings) if (badReading(r)) problems.push(`${id}: okunuş biçimi hatalı: ${r}`);
  for (const w of lesson.words) if (w.note && IPA.test(w.note)) problems.push(`${id}: "${w.en}" notunda fonetik sembol var`);
  for (const s of lesson.sections) {
    const outside = s.body.replace(/«[^»]*»/g, "");
    if (IPA.test(outside)) problems.push(`${id}: "${s.heading}" metninde fonetik sembol var`);
    // Okunuş işaretleri sadece «...» içinde biçimlenir.
    if (/\{[dtwa]\}/.test(outside)) problems.push(`${id}: "${s.heading}" metninde «» dışında okunuş işareti var`);
  }
  lesson.exercises.forEach((e, i) => {
    const n = `${id} ödev ${i + 1}`;
    if (e.type === "choice" && !e.options.includes(e.answer)) problems.push(`${n}: cevap seçeneklerde yok`);
    if ((e.type === "write" || e.type === "listen") && !e.answers?.length) problems.push(`${n}: answers yok`);
    if ((e.type === "listen" || e.type === "speak") && !e.say) problems.push(`${n}: say yok`);
    if (e.type === "speak" && !e.accept?.length) problems.push(`${n}: accept yok`);
  });
  words += lesson.words.length;
  exercises += lesson.exercises.length;
}

console.log(`${ids.length} ders, ${words} kelime kartı, ${exercises} ödev`);

// ---------- Kelime paketleri ----------
const TYPES = new Set(["isim", "fiil", "sıfat", "zarf", "zamir", "edat", "bağlaç", "ünlem", "sayı", "kalıp", "deyim"]);
const LEVELS = new Set(["A1", "A2", "B1", "B2"]);
let packIndex = null;
try {
  packIndex = JSON.parse(await readFile(new URL("data/packs/index.json", ROOT), "utf8"));
} catch {
  console.log("Paket yok (data/packs/index.json bulunamadı).");
}
if (packIndex) {
  const groups = new Set(packIndex.groups.map(g => g.id));
  let packWords = 0;
  let refs = 0;
  const packIds = new Set();
  for (const meta of packIndex.packs) {
    if (packIds.has(meta.id)) problems.push(`paket ${meta.id}: index'te iki kez var`);
    packIds.add(meta.id);
    let pack;
    try {
      pack = JSON.parse(await readFile(new URL(`data/packs/${meta.id}.json`, ROOT), "utf8"));
    } catch (e) {
      problems.push(`paket ${meta.id}: dosya okunamadı (${e.message})`);
      continue;
    }
    const where = `paket ${meta.id}`;
    if (pack.id !== meta.id) problems.push(`${where}: dosyadaki id "${pack.id}"`);
    if (!groups.has(pack.group)) problems.push(`${where}: bilinmeyen grup "${pack.group}"`);
    if (!LEVELS.has(pack.level)) problems.push(`${where}: geçersiz seviye "${pack.level}"`);
    if (pack.intro && IPA.test(pack.intro.replace(/«[^»]*»/g, ""))) problems.push(`${where}: giriş metninde fonetik sembol var`);
    for (const r of [...(pack.intro || "").matchAll(/«([^»]+)»/g)].map(m => m[1])) if (badReading(r)) problems.push(`${where}: giriş okunuşu hatalı: ${r}`);
    for (const w of pack.words) {
      if (w.ref) {
        refs++;
        if (!seen.has(w.ref.toLowerCase())) problems.push(`${where}: ref "${w.ref}" hiçbir derste / önceki pakette yok`);
        continue;
      }
      packWords++;
      const label = `${where}: "${w.en}"`;
      for (const f of ["en", "tr", "read", "type", "example", "exampleTr"]) if (!w[f]) problems.push(`${label} ${f} alanı yok`);
      if (w.type && !TYPES.has(w.type)) problems.push(`${label} bilinmeyen tür "${w.type}"`);
      if (w.level && !LEVELS.has(w.level)) problems.push(`${label} geçersiz seviye "${w.level}"`);
      if (w.read && badReading(w.read)) problems.push(`${label} okunuş hatalı: ${w.read}`);
      if (w.note && IPA.test(w.note.replace(/«[^»]*»/g, ""))) problems.push(`${label} notunda fonetik sembol var`);
      const key = (w.en || "").toLowerCase();
      if (seen.has(key)) problems.push(`${label} zaten var: ${seen.get(key)}`);
      else seen.set(key, where);
    }
  }
  console.log(`${packIndex.packs.length} paket, ${packWords} yeni kelime, ${refs} derslere atıf`);
  console.log(`Toplam kelime bankası: ${words + packWords} (derslerdeki tekrarsız kelimelerle birlikte ${seen.size})`);
}
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("Sorun yok.");
