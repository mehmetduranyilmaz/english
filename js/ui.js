// Sayfalar arasında ortak görünüm parçaları.
import { recordingFor, filePage, ttsFor } from "./audio.js";
import { listen, speechSupported } from "./speech.js";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function formatMinutes(sec) {
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

// Türkçede olmayan sesler: okunuşta {d}, {t}, {w}, {a} diye işaretlenir, renkli gösterilir.
const SPECIAL = {
  d: "Renkli d: dil ucunu üst ön dişlerin arasına koyup öyle “d” deyin.",
  t: "Renkli t: dil ucunu üst ön dişlerin arasına koyup öyle “t” deyin.",
  w: "Renkli w: dudakları “u” der gibi yuvarlayıp açın; “v” değil.",
  a: "Renkli a: ağzınızı geniş açın; “a” ile “e” arası bir ses.",
};

// "kım-[pyuu]-tı" → hecelere böler, [ ] içindeki vurgulu heceyi büyük ve kalın yazar.
// Birden çok kelime boşlukla ayrılır: "{d}i [{a}]-pıl".
export function readingParts(read) {
  const used = new Set();
  const html = read.split(" ").map(word => word.split("-").map(part => {
    const stressed = part.startsWith("[") && part.endsWith("]");
    let text = stressed ? part.slice(1, -1).toLocaleUpperCase("tr-TR") : part;
    text = esc(text).replace(/\{(.)\}/g, (_, c) => {
      const key = c.toLocaleLowerCase("tr-TR");
      used.add(key);
      return `<span class="sp" title="${esc(SPECIAL[key] || "")}">${c}</span>`;
    });
    return stressed ? `<b class="stress">${text}</b>` : text;
  }).join('<span class="dash">-</span>')).join(" ");
  return { html, notes: [...used].map(k => SPECIAL[k]).filter(Boolean) };
}

export const readingHtml = read => `<span class="reading">${readingParts(read).html}</span>`;

// Metinlerde «...» içine yazılan okunuşları biçimlendirir.
export const withReadings = body => body.replace(/«([^»]+)»/g, (_, r) => readingHtml(r));

export function sourceHtml(text) {
  const rec = recordingFor(text);
  const said = rec?.text ? ` · kayıtta “${esc(rec.text)}”` : "";
  const human = rec
    ? `<button class="mini" data-rec="${esc(text)}">🎙 gerçek kişi</button> <a href="${filePage(rec.file)}" target="_blank" rel="noopener">${esc(rec.accent)} kaydı ↗</a>${said}`
    : "";
  if (ttsFor(text)) return `<div class="src">🔊 British ses (Sonia)${rec ? ` · ${human}` : ""}</div>`;
  if (rec) return `<div class="src">${human}</div>`;
  return `<span class="src">🤖 tarayıcının UK sesi</span>`;
}

export function audioButtons(text, { say = true } = {}) {
  return `<button data-play="${esc(text)}">▶ Dinle</button><button data-slow="${esc(text)}">🐢 Yavaş</button>${say && speechSupported ? `<button data-say="${esc(text)}">🎤 Söyle</button>` : ""}`;
}

// Serbest konuşma pratiği (puana sayılmaz): sonucu verilen alana yazar.
export async function practiceSay(text, out) {
  out.className = "say-result muted";
  out.textContent = "Dinliyorum…";
  try {
    const r = await listen([text]);
    out.className = `say-result ${r.ok ? "ok" : "bad"}`;
    out.textContent = r.ok ? `✔ “${text}” anlaşıldı` : `✘ Duyulan: “${r.heard}”`;
  } catch (err) {
    out.textContent = err.message;
  }
}

export function pageHeader(timerSeconds, back = { href: "#/", label: "← Ana sayfa" }) {
  return `<header class="top">
      <a href="${back.href}" class="back">${back.label}</a>
      <span class="muted" id="timer">⏱ bugün ${formatMinutes(timerSeconds)}</span>
    </header>`;
}

export function updateTimer(sec) {
  const t = document.getElementById("timer");
  if (t) t.textContent = `⏱ bugün ${formatMinutes(sec)}`;
}
