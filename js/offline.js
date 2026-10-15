// Telefonda kullanım: service worker kaydı (çevrimdışı açılış), "Uygulamayı yükle" düğmesi ve tüm sesleri indirme.
import { ttsFiles } from "./audio.js";
import { esc } from "./ui.js";

const AUDIO_CACHE = "audio-v1"; // sw.js ile aynı ad
const AVG_KB = 13.5; // ses dosyalarının ortalama boyutu, kalan indirme boyutunu tahmin etmek için
const PARALLEL = 8;

let installPrompt = null;
let downloading = null; // { done, total } indirme sürerken
let lastError = "";

const standalone = () => matchMedia("(display-mode: standalone)").matches;

export function registerOffline() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installPrompt = e;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    refresh();
  });
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
}

async function cachedFiles() {
  if (!("caches" in window)) return new Set();
  const cache = await caches.open(AUDIO_CACHE);
  return new Set((await cache.keys()).map(r => new URL(r.url).pathname.split("/").pop()));
}

async function downloadAll() {
  navigator.storage?.persist?.().catch(() => {});
  const cache = await caches.open(AUDIO_CACHE);
  const have = await cachedFiles();
  const files = ttsFiles();
  const todo = files.filter(f => !have.has(f));
  downloading = { done: files.length - todo.length, total: files.length };
  lastError = "";
  refresh();
  // Bağlantı bir anlığına koparsa her dosya birkaç kez denenir; yine olmazsa indirme durur, tekrar basınca kaldığı yerden devam eder.
  const fetchOne = async url => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        // Service worker sayfayı yönetiyorsa dosyayı zaten kendisi saklar; iki kez yazmak indirmeyi çok yavaşlatıyor.
        if (navigator.serviceWorker?.controller) await res.arrayBuffer();
        else await cache.put(url, res);
        return;
      } catch (err) {
        if (attempt === 3 || !navigator.onLine) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  };
  let i = 0;
  const worker = async () => {
    while (i < todo.length && !lastError) {
      try {
        await fetchOne(`audio/tts/${todo[i++]}`);
        downloading.done++;
        if (downloading.done % 25 === 0) refresh();
      } catch {
        lastError = navigator.onLine ? "Bazı sesler indirilemedi." : "İnternet kesildi.";
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  downloading = null;
  refresh();
}

export function offlineCardHtml() {
  return `<section class="card offline" id="offlineCard"><h3>📱 Telefonda kullanım</h3><div class="muted small">Yükleniyor…</div></section>`;
}

// Kartın içeriğini güncel duruma göre yeniden çizer (ana sayfa açık değilse bir şey yapmaz).
export async function refresh() {
  const card = document.getElementById("offlineCard");
  if (!card) return;
  const files = ttsFiles();
  const have = downloading ? null : await cachedFiles();
  const count = downloading ? downloading.done : files.filter(f => have.has(f)).length;
  const left = files.length - count;

  const install = standalone()
    ? `<div class="small">✔ Uygulama olarak açık.</div>`
    : installPrompt
      ? `<button class="primary" id="installBtn">📲 Uygulamayı yükle</button>`
      : `<div class="small muted">Yüklemek için: Chrome menüsü <b>⋮</b> → <b>Uygulamayı yükle</b> (ya da <b>Ana ekrana ekle</b>).</div>`;

  const audio = downloading
    ? `<div class="bar"><span style="width:${((count / files.length) * 100).toFixed(1)}%"></span></div>
       <div class="small muted">Sesler indiriliyor: ${count} / ${files.length}</div>`
    : left === 0
      ? `<div class="small">✔ ${files.length} sesin hepsi telefonda; internetsiz de çalar.</div>`
      : `<div class="small muted">Telefondaki sesler: ${count} / ${files.length}. Dinlediğin sesler kendiliğinden saklanır.</div>
         <button id="downloadBtn" ${navigator.onLine ? "" : "disabled"}>⬇ Tüm sesleri indir (yaklaşık ${Math.max(1, Math.round((left * AVG_KB) / 1024))} MB)</button>
         <div class="small muted">Wi-Fi'deyken bir kez indirmen yeterli.</div>`;

  card.innerHTML = `<h3>📱 Telefonda kullanım</h3>
    ${navigator.onLine ? "" : `<div class="small"><b>Çevrimdışısın.</b> Dersler ve kayıtlı sesler çalışır; 🎤 konuşma ödevi için internet gerekir.</div>`}
    <div class="row">${install}</div>
    ${audio}
    ${lastError ? `<div class="small bad-text">${esc(lastError)} Tekrar basınca kaldığı yerden devam eder.</div>` : ""}`;

  card.querySelector("#installBtn")?.addEventListener("click", async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    refresh();
  });
  card.querySelector("#downloadBtn")?.addEventListener("click", () => downloadAll());
}
