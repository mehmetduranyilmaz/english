// İlerleme verisi: sadece bu tarayıcıda (localStorage) tutulur, repoya gitmez.
const KEY = "english-app-v1";
const IDLE_MS = 3 * 60 * 1000; // 3 dk hareketsizlikte sayaç durur

const empty = () => ({ version: 1, days: {}, lessons: {}, srs: { cards: {}, newDone: {} } });

// Eski kayıtlarda / yedeklerde olmayan alanları tamamlar.
function withDefaults(data) {
  const base = empty();
  return { ...base, ...data, srs: { ...base.srs, ...data.srs } };
}

let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved ? withDefaults(saved) : empty();
  } catch {
    return empty();
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Gizli sekme vb. durumlarda kayıt yapılamaz; uygulama yine çalışır.
  }
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const secondsOn = day => state.days[day] || 0;
export const totalSeconds = () => Object.values(state.days).reduce((a, b) => a + b, 0);
export const lessonResult = id => state.lessons[id];
export const srs = () => state.srs;

export function saveLessonResult(id, score, total) {
  const prev = state.lessons[id];
  state.lessons[id] = {
    done: true,
    score,
    total,
    best: Math.max(score / total, prev?.best ?? 0),
    lastDone: today(),
  };
  save();
}

// --- Otomatik çalışma süresi ---
let pending = 0;
let lastActivity = Date.now();
let ticker = null;

export function markActivity() {
  lastActivity = Date.now();
}

function flush() {
  if (!pending) return;
  const day = today();
  state.days[day] = (state.days[day] || 0) + pending;
  pending = 0;
  save();
}

export function startTimer(onTick) {
  stopTimer();
  markActivity();
  ticker = setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastActivity > IDLE_MS) return;
    pending++;
    if (pending >= 15) flush();
    onTick?.(secondsOn(today()) + pending);
  }, 1000);
}

export function stopTimer() {
  clearInterval(ticker);
  ticker = null;
  flush();
}

for (const ev of ["pointerdown", "keydown", "scroll", "touchstart"]) {
  addEventListener(ev, markActivity, { passive: true });
}
addEventListener("visibilitychange", flush);
addEventListener("pagehide", flush);

// --- Yedek ---
export function exportBackup() {
  flush();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ingilizce-yedek-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (!data || typeof data.days !== "object" || typeof data.lessons !== "object") {
    throw new Error("Bu dosya bir yedek dosyası değil.");
  }
  state = withDefaults(data);
  save();
}
