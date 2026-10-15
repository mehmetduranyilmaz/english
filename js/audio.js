// British ses sırası: önce Azure'un British sesiyle (Sonia) üretilmiş MP3 (audio/tts),
// yoksa gerçek insan kaydı (Wikimedia Commons, RP/UK), o da yoksa tarayıcının en-GB sesi.
let ukIndex = {};
let ttsIndex = {};
let ttsLower = {};

const loadJson = async url => {
  try {
    return await (await fetch(url)).json();
  } catch {
    return {};
  }
};

export async function loadAudioIndex() {
  [ukIndex, ttsIndex] = await Promise.all([loadJson("data/audio-uk.json"), loadJson("data/audio-tts.json")]);
  ttsLower = Object.fromEntries(Object.entries(ttsIndex).map(([t, id]) => [t.toLowerCase(), id]));
}

export const recordingFor = text => ukIndex[text.toLowerCase()];
export const ttsFor = text => ttsIndex[text.trim()] || ttsLower[text.trim().toLowerCase()];
export const hasTts = () => Object.keys(ttsIndex).length > 0;
// Tüm ses dosyalarının adları (çevrimdışı indirme için).
export const ttsFiles = () => [...new Set(Object.values(ttsIndex))].map(id => `${id}.mp3`);

// Kendi seslerimiz fetch ile alınır: service worker kayıtlı kopyayı verir, internetsiz de çalar.
const blobUrls = new Map();
async function localUrl(url) {
  if (!blobUrls.has(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    blobUrls.set(url, URL.createObjectURL(await res.blob()));
  }
  return blobUrls.get(url);
}

export const fileUrl = file => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
export const filePage = file => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;

const langOf = v => v.lang.replace("_", "-");

function ukVoice() {
  const voices = speechSynthesis.getVoices().filter(v => langOf(v) === "en-GB");
  return voices.find(v => /natural|online|google/i.test(v.name)) || voices[0];
}

// British ses yoksa en azından İngilizce bir ses seç; yoksa tarayıcı Türkçe sesle okuyabilir.
function bestVoice() {
  return ukVoice() || speechSynthesis.getVoices().find(v => langOf(v).startsWith("en"));
}

// Edge gibi tarayıcılar çevrimiçi sesleri sonradan ekler; liste her değiştiğinde haber ver.
export function onVoicesChanged(callback) {
  if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", callback);
}
// Tarayıcılar ses listesini geç yükler; listeye bakmadan önce bunu bekle.
export function whenVoicesReady(timeout = 2000) {
  if (!("speechSynthesis" in window) || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise(resolve => {
    speechSynthesis.addEventListener("voiceschanged", resolve, { once: true });
    setTimeout(resolve, timeout);
  });
}

// Tanı için: tarayıcının gördüğü sesler.
export function voiceSummary() {
  if (!("speechSynthesis" in window)) return "Bu tarayıcıda konuşma sesi desteği yok.";
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return "Tarayıcı hiç ses bulamadı.";
  return voices.slice(0, 12).map(v => `${v.name} (${langOf(v)})`).join(", ") + (voices.length > 12 ? ` ve ${voices.length - 12} ses daha` : "");
}

export function hasUkVoice() {
  return "speechSynthesis" in window && !!ukVoice();
}

export function speak(text, slow = false) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  u.rate = slow ? 0.5 : 0.9;
  const v = bestVoice();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Dosyayı çalar (yavaşta 0.6 hız); çalamazsa fallback'e düşer.
function playFile(url, slow, fallback) {
  let fellBack = false;
  const fail = () => {
    if (fellBack) return;
    fellBack = true;
    fallback();
  };
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const audio = new Audio(url);
  audio.playbackRate = slow ? 0.6 : 1;
  audio.preservesPitch = true;
  audio.onerror = fail;
  audio.play().catch(fail);
}

// Gerçek insan kaydı varsa onu, yoksa tarayıcı sesini çalar.
export function playRecording(text, slow = false) {
  const rec = recordingFor(text);
  if (rec) playFile(fileUrl(rec.file), slow, () => speak(text, slow));
  else speak(text, slow);
}

export function play(text, slow = false) {
  const id = ttsFor(text);
  if (!id) return playRecording(text, slow);
  const fallback = () => playRecording(text, slow);
  localUrl(`audio/tts/${id}.mp3`).then(url => playFile(url, slow, fallback), fallback);
}
