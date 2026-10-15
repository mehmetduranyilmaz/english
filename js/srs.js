// Aralıklı tekrar (SM-2'nin sadeleştirilmiş hali). Bildikçe kelime daha seyrek gelir.
import * as store from "./store.js";

export const NEW_PER_DAY = 20;
export const GRADES = [
  { id: 0, label: "Bilemedim", key: "1" },
  { id: 1, label: "Zorlandım", key: "2" },
  { id: 2, label: "Bildim", key: "3" },
  { id: 3, label: "Çok kolay", key: "4" },
];

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Bir kartın verilen puandan sonraki hali. interval 0 = aynı gün tekrar.
export function next(card, grade) {
  const c = { ...card };
  if (grade === 0) {
    c.reps = 0;
    c.interval = 0;
    c.lapses = (c.lapses || 0) + 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else {
    if (grade === 1) {
      c.interval = Math.max(1, Math.round(c.interval * 1.2));
      c.ease = Math.max(1.3, c.ease - 0.15);
    } else if (grade === 2) {
      c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.interval * c.ease);
    } else {
      c.interval = c.reps === 0 ? 3 : Math.round(Math.max(c.interval, 1) * c.ease * 1.3);
      c.ease += 0.15;
    }
    c.reps += 1;
  }
  c.due = addDays(store.today(), c.interval);
  return c;
}

export function intervalLabel(days) {
  if (days === 0) return "bugün tekrar";
  if (days < 30) return `${days} gün`;
  return `${Math.round(days / 30)} ay`;
}

// Ödevi biten dersin kelimelerini listeye ekler (zaten varsa dokunmaz).
export function enroll(keys) {
  const { cards } = store.srs();
  let added = 0;
  for (const key of keys) {
    if (cards[key]) continue;
    cards[key] = { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: store.today(), added: store.today(), isNew: true };
    added++;
  }
  if (added) store.save();
  return added;
}

export function card(key) {
  return store.srs().cards[key];
}

// Bugünün sırası: önce vadesi gelen kelimeler, sonra günlük sınır kadar yeni kelime.
export function buildQueue() {
  const { cards, newDone } = store.srs();
  const today = store.today();
  const entries = Object.entries(cards);
  const due = entries.filter(([, c]) => !c.isNew && c.due <= today).sort((a, b) => a[1].due.localeCompare(b[1].due));
  const room = Math.max(0, NEW_PER_DAY - (newDone[today] || 0));
  const fresh = entries.filter(([, c]) => c.isNew).sort((a, b) => a[1].added.localeCompare(b[1].added)).slice(0, room);
  return [...due, ...fresh].map(([key]) => key);
}

export function grade(key, g) {
  const s = store.srs();
  const before = s.cards[key];
  const after = next(before, g);
  if (before.isNew) {
    delete after.isNew;
    const today = store.today();
    s.newDone[today] = (s.newDone[today] || 0) + 1;
  }
  s.cards[key] = after;
  store.save();
  return after;
}

// Kelimenin durumu: none (listede değil), new (sırada bekliyor), learning, learned (21+ gün aralık)
export function status(key) {
  const c = store.srs().cards[key];
  if (!c) return "none";
  if (c.isNew) return "new";
  return c.interval >= 21 ? "learned" : "learning";
}

export const STATUS_LABEL = { none: "listede değil", new: "yeni", learning: "öğreniliyor", learned: "öğrenildi" };

// Isınma: önce tekrar zamanı gelmiş, sonra rastgele listedeki diğer kelimeler
// (ödevi biten derslerin henüz tekrar edilmemiş kelimeleri de dahil).
export function warmupKeys(isValid, exclude, n = 5) {
  const today = store.today();
  const seen = Object.entries(store.srs().cards).filter(([k]) => isValid(k) && !exclude.has(k));
  const isDueCard = c => !c.isNew && c.due <= today;
  const due = seen.filter(([, c]) => isDueCard(c)).sort((a, b) => a[1].due.localeCompare(b[1].due)).map(([k]) => k);
  const rest = seen.filter(([, c]) => !isDueCard(c)).map(([k]) => k);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...due, ...rest].slice(0, n);
}

export const isDue = key => {
  const c = store.srs().cards[key];
  return !!c && !c.isNew && c.due <= store.today();
};

export function stats() {
  const cards = Object.values(store.srs().cards);
  return {
    total: cards.length,
    today: buildQueue().length,
    learned: cards.filter(c => c.interval >= 21).length,
  };
}
