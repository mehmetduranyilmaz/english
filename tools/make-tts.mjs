// Uygulamada çalınan tüm İngilizce metinleri (kelime, çoğul, ödev cümlesi, örnek cümle) Azure'un
// British sesiyle (en-GB-SoniaNeural) MP3'e çevirir: audio/tts/<id>.mp3 + data/audio-tts.json (metin → id).
// Sadece yeni ya da değişen metinler üretilir; artık kullanılmayan dosyalar silinir.
// Anahtar repoya girmez, ortam değişkeninden okunur: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (ör. northeurope).
// Kullanım: node tools/make-tts.mjs        (ücretsiz katman dakikada 20 istek kabul eder; ~4600 metin ≈ 4 saat)
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const VOICE = "en-GB-SoniaNeural";
const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = (process.env.AZURE_SPEECH_REGION || "").toLowerCase().replace(/\s+/g, "");
const PER_MINUTE = Number(process.env.TTS_PER_MINUTE) || 19;
const AUDIO_DIR = new URL("audio/tts/", ROOT);
const INDEX_FILE = new URL("data/audio-tts.json", ROOT);

if (!KEY || !REGION) {
  console.error("AZURE_SPEECH_KEY ve AZURE_SPEECH_REGION ortam değişkenleri tanımlı değil.");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async url => JSON.parse(await readFile(url, "utf8"));
const xml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Çalınan metinler, öğrenme sırasıyla: önce dersler (müfredat sırası), sonra paketler.
async function texts() {
  const list = [];
  const add = t => t && list.push(t.trim());
  const curriculum = await readJson(new URL("data/curriculum.json", ROOT));
  const lessonIds = JSON.stringify(curriculum).match(/"[ab][12]-\d\d"/g).map(s => s.slice(1, -1));
  for (const id of new Set(lessonIds)) {
    const lesson = await readJson(new URL(`data/lessons/${id}.json`, ROOT));
    for (const w of lesson.words) {
      add(w.en);
      add(w.plural?.en);
      add(w.example);
    }
    for (const ex of lesson.exercises) add(ex.say);
  }
  const index = await readJson(new URL("data/packs/index.json", ROOT));
  for (const meta of index.packs) {
    const pack = await readJson(new URL(`data/packs/${meta.id}.json`, ROOT));
    for (const w of pack.words) {
      if (w.ref) continue;
      add(w.en);
      add(w.example);
    }
  }
  return [...new Set(list)];
}

const overrides = await readJson(new URL("tools/tts-overrides.json", ROOT));
const body = text => overrides[text] || xml(text);
// id ses ve SSML'den türetilir: okunuş düzeltmesi değişirse dosya yeniden üretilir.
const idOf = text => createHash("sha1").update(`${VOICE}|${body(text)}`).digest("hex").slice(0, 12);

async function synthesize(text) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><voice name="${VOICE}">${body(text)}</voice></speak>`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "EnglishLearnerApp",
      },
      body: ssml,
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    // 429: dakikalık sınır aşıldı; 5xx: geçici hata. Bekleyip tekrar dene.
    if ((res.status === 429 || res.status >= 500) && attempt <= 8) {
      await sleep((Number(res.headers.get("retry-after")) || 15 * attempt) * 1000);
      continue;
    }
    throw new Error(`HTTP ${res.status} ${await res.text()}`);
  }
}

await mkdir(AUDIO_DIR, { recursive: true });
let index = {};
try {
  index = await readJson(INDEX_FILE);
} catch {
  index = {};
}
const all = await texts();
const onDisk = new Set(await readdir(AUDIO_DIR));
// Satır başına bir kayıt: dosya küçük kalır, değişiklikler okunabilir.
const save = () => writeFile(INDEX_FILE, "{\n" + Object.entries(index).map(([t, id]) => `${JSON.stringify(t)}:${JSON.stringify(id)}`).join(",\n") + "\n}\n");

// Artık kullanılmayan metinleri ve dosyalarını temizle.
const wanted = new Set(all);
for (const text of Object.keys(index)) if (!wanted.has(text)) delete index[text];
const keepFiles = new Set(all.map(t => `${idOf(t)}.mp3`));
for (const f of onDisk) if (f.endsWith(".mp3") && !keepFiles.has(f)) await unlink(new URL(f, AUDIO_DIR));

const todo = all.filter(t => index[t] !== idOf(t) || !onDisk.has(`${idOf(t)}.mp3`));
console.log(`Toplam metin: ${all.length} · üretilecek: ${todo.length} · tahmini süre: ${Math.ceil(todo.length / PER_MINUTE)} dk`);

const gap = 60000 / PER_MINUTE;
let done = 0;
const failed = [];
for (const text of todo) {
  const started = Date.now();
  const id = idOf(text);
  try {
    await writeFile(new URL(`${id}.mp3`, AUDIO_DIR), await synthesize(text));
    index[text] = id;
  } catch (e) {
    failed.push(`${text}: ${e.message}`);
  }
  if (++done % 20 === 0) {
    await save();
    console.log(`${done}/${todo.length}`);
  }
  await sleep(Math.max(0, gap - (Date.now() - started)));
}
await save();
console.log(`Bitti: ${done - failed.length}/${todo.length} üretildi.`);
if (failed.length) console.log(`Hatalar:\n${failed.join("\n")}`);
