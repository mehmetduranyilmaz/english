// Çevrimdışı çalışma: uygulama dosyaları ve tüm dersler/paketler kurulumda saklanır;
// sesler dinlendikçe (ya da ana sayfadaki "Tüm sesleri indir" ile) saklanır.
// Uygulama dosyaları hemen kayıtlı kopyadan açılır, güncel sürüm arka planda indirilir (bir sonraki açılışta görünür).
// Önce ağı beklemek, kötü bağlantıda her dosyada saniyelerce gecikme demek.
const SHELL = "shell-v2";
const AUDIO = "audio-v1"; // ses dosyalarının adı içerikten türetildiği için kayıtlı kopya hiç eskimez (js/offline.js de kullanır)

const CORE = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/app.js", "js/audio.js", "js/data.js", "js/offline.js", "js/speech.js", "js/srs.js", "js/store.js", "js/ui.js", "js/words.js",
  "data/curriculum.json", "data/packs/index.json", "data/audio-uk.json", "data/audio-tts.json",
  "icons/icon-192.png", "icons/icon-512.png",
];

async function dataFiles() {
  const curriculum = await (await fetch("data/curriculum.json")).json();
  const packs = await (await fetch("data/packs/index.json")).json();
  const lessons = curriculum.levels.flatMap(l => l.stages.flatMap(s => s.lessons));
  return [...lessons.map(id => `data/lessons/${id}.json`), ...packs.packs.map(p => `data/packs/${p.id}.json`)];
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll([...CORE, ...(await dataFiles())]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== AUDIO) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Wikimedia kayıtları gibi başka sitelerin dosyalarına karışma.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes("/audio/tts/") ? cacheFirst(e.request) : staleWhileRevalidate(e));
});

async function cacheFirst(req) {
  const cache = await caches.open(AUDIO);
  // ignoreSearch kullanma: binlerce kayıtta her aramada hepsini tek tek tarar, indirme giderek yavaşlar.
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) await cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(e) {
  const req = e.request;
  const cache = await caches.open(SHELL);
  const cached = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("index.html") : undefined);
  const network = fetch(req).then(res => {
    if (res.status === 200) return cache.put(req, res.clone()).then(() => res);
    return res;
  });
  if (!cached) return network;
  e.waitUntil(network.catch(() => {}));
  return cached;
}
