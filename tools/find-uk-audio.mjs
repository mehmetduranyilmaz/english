// Derslerdeki kelimeler için Wiktionary'de British (RP/UK) aksanlı ses kaydı arar
// ve data/audio-uk.json dosyasına yazar. Kayıtlar Wikimedia Commons'ta, çoğu CC BY-SA lisanslı.
// Kullanım: node tools/find-uk-audio.mjs
import { readFile, writeFile } from "node:fs/promises";
import { ACCENTS, audioTerms } from "./audio-terms.mjs";

const ROOT = new URL("../", import.meta.url);
const UA = "EnglishLearnerApp/0.1 (personal study project)";

const sleep = ms => new Promise(r => setTimeout(r, ms));

function englishSection(wikitext) {
  const start = wikitext.indexOf("==English==");
  if (start < 0) return "";
  const rest = wikitext.slice(start + "==English==".length);
  const next = rest.search(/\n==[^=]/);
  return next < 0 ? rest : rest.slice(0, next);
}

function pickUkAudio(section) {
  const found = [];
  for (const [, body] of section.matchAll(/\{\{audio\|en\|([^}]*)\}\}/g)) {
    const parts = body.split("|");
    const file = parts[0].trim();
    const named = Object.fromEntries(parts.slice(1).filter(p => p.includes("=")).map(p => p.split("=").map(s => s.trim())));
    const accent = named.a || named.accent || "";
    const rank = ACCENTS.findIndex(re => re.test(accent));
    if (rank >= 0) found.push({ file, accent, text: named.text, rank });
  }
  found.sort((a, b) => a.rank - b.rank);
  if (!found.length) return null;
  const { rank, text, ...best } = found[0];
  return text ? { ...best, text } : best;
}

async function lookup(term) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(term)}&prop=wikitext&format=json&formatversion=2&redirects=1`;
  let res;
  for (let attempt = 1; attempt <= 5; attempt++) {
    res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429) break;
    // Wiktionary hız sınırı: bekleyip tekrar dene.
    await sleep((Number(res.headers.get("retry-after")) || 5 * attempt) * 1000);
  }
  if (!res.ok) throw new Error(`${term}: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.parse) return null;
  return pickUkAudio(englishSection(data.parse.wikitext));
}

const { terms, skip } = await audioTerms(ROOT);
const outFile = new URL("data/audio-uk.json", ROOT);
// Daha önce bulunan kayıtlar korunur; sadece kaydı olmayan kelimeler aranır.
let out = {};
try {
  out = JSON.parse(await readFile(outFile, "utf8"));
} catch {
  out = {};
}
for (const word of skip) delete out[word];
// Aksanı artık British sayılmayan eski kayıtları at (ör. "New England", "British Columbia").
for (const [word, hit] of Object.entries(out)) if (!ACCENTS.some(re => re.test(hit.accent))) delete out[word];
const missing = [];
for (const term of terms) {
  if (out[term.toLowerCase()]) continue;
  try {
    const hit = await lookup(term);
    if (hit) out[term.toLowerCase()] = hit;
    else missing.push(term);
  } catch (e) {
    console.error(e.message);
    missing.push(term);
  }
  await sleep(1000);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(outFile, JSON.stringify(sorted, null, 2) + "\n");
const found = terms.filter(t => out[t.toLowerCase()]).length;
console.log(`British kayıt bulundu: ${found}/${terms.length}`);
console.log(`Bulunamayanlar (tarayıcının UK sesi kullanılacak): ${missing.join(", ") || "-"}`);
