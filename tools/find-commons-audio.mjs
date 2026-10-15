// find-uk-audio.mjs'in bulamadığı kelimeler için Wikimedia Commons'ta dosya adıyla British kayıt arar:
// "En-uk-kelime.ogg", "En-gb-kelime.ogg" ve İngiliz Lingua Libre konuşmacılarının "LL-Q1860 (eng)-Ad-kelime.wav" dosyaları.
// Bulunanlar data/audio-uk.json'a eklenir. Kullanım: node tools/find-commons-audio.mjs
import { readFile, writeFile } from "node:fs/promises";
import { ACCENTS, audioTerms } from "./audio-terms.mjs";

const ROOT = new URL("../", import.meta.url);
const UA = "EnglishLearnerApp/0.1 (personal study project)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Anlamına / türüne göre okunuşu veya vurgusu değişen kelimeler: dosya adı hangisi olduğunu söylemez.
const AMBIGUOUS = new Set(("close live lives use used read lead wind tear bow row minute present record object content desert wound " +
  "permit increase decrease project produce progress refuse contract conduct export import transfer upgrade conflict contrast " +
  "insult protest rebel suspect subject separate estimate graduate moderate deliberate alternate appropriate duplicate abuse " +
  "excuse does bass polish invalid attribute compound discount perfect update upset survey insert extract convert combat " +
  "record rewrite reset refund deposit").split(" "));

// Dosya adı kalıpları, öncelik sırasıyla. Lingua Libre konuşmacıları: audio-uk.json'da British etiketli kaydı olanlar.
function patterns(index) {
  const speakers = new Map();
  for (const { file, accent } of Object.values(index)) {
    const m = file.replace(/_/g, " ").match(/^LL-Q1860 \(eng\)-(.+?)-[^-]+$/);
    if (!m) continue;
    const s = speakers.get(m[1]) || { n: 0, accent };
    s.n++;
    speakers.set(m[1], s);
  }
  return [
    { name: t => `En-uk-${t}.ogg`, accent: "UK" },
    { name: t => `En-gb-${t}.ogg`, accent: "UK" },
    ...[...speakers].sort((a, b) => b[1].n - a[1].n).map(([who, s]) => ({ name: t => `LL-Q1860 (eng)-${who}-${t}.wav`, accent: s.accent })),
  ];
}

// Commons başlık biçimi: ilk harf büyük, alt çizgi = boşluk.
const title = name => "File:" + (name[0].toUpperCase() + name.slice(1)).replace(/_/g, " ");

async function existing(titles) {
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&titles=" + encodeURIComponent(titles.join("|"));
  let res;
  for (let attempt = 1; attempt <= 5; attempt++) {
    res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429) break;
    await sleep((Number(res.headers.get("retry-after")) || 5 * attempt) * 1000);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return new Set((data.query?.pages || []).filter(p => !p.missing && !p.invalid).map(p => p.title));
}

const outFile = new URL("data/audio-uk.json", ROOT);
const out = JSON.parse(await readFile(outFile, "utf8"));
const { terms } = await audioTerms(ROOT);
const pats = patterns(out).filter(p => ACCENTS.some(re => re.test(p.accent)));
const todo = terms.filter(t => !out[t.toLowerCase()] && !AMBIGUOUS.has(t.toLowerCase()));

// Her kelime için tüm aday dosya adları; Commons'a 50'şerli gruplar halinde sorulur.
const candidates = todo.flatMap(t => pats.map((p, rank) => ({ t, rank, file: p.name(t), accent: p.accent })));
const found = new Set();
for (let i = 0; i < candidates.length; i += 50) {
  const batch = candidates.slice(i, i + 50);
  for (const t of await existing(batch.map(c => title(c.file)))) found.add(t);
  await sleep(500);
}

const added = [];
for (const t of todo) {
  const hit = candidates.filter(c => c.t === t && found.has(title(c.file))).sort((a, b) => a.rank - b.rank)[0];
  if (!hit) continue;
  out[t.toLowerCase()] = { file: title(hit.file).slice(5), accent: hit.accent };
  added.push(t);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(outFile, JSON.stringify(sorted, null, 2) + "\n");
console.log(`Commons'ta yeni British kayıt: ${added.length}/${todo.length} (${pats.length} dosya adı kalıbı)`);
console.log(`Eklenenler: ${added.join(", ") || "-"}`);
console.log(`Toplam: ${terms.filter(t => out[t.toLowerCase()]).length}/${terms.length}`);
