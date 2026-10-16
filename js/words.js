// Kelimeler sayfası (paketler + kelime bankası), paket sayfası ve ders başındaki Isınma.
import * as store from "./store.js";
import * as srs from "./srs.js";
import { play } from "./audio.js";
import { esc, readingHtml, withReadings, pageHeader, updateTimer } from "./ui.js";
import { wordIndex, wordKey, packIndex, packCache, packWords, packKeys } from "./data.js";

const LEVELS = ["A1", "A2", "B1", "B2"];
const PAGE_SIZE = 100;

const groupTitle = id => packIndex.groups.find(g => g.id === id)?.title ?? id;
// Grubun sayma birimi (ör. Konuşma cümleleri → "cümle"); yoksa "kelime".
const unitOf = pack => packIndex.groups.find(g => g.id === pack.group)?.unit ?? "kelime";
// Paket bir müfredat aşamasına bağlıysa: "3. aşamadan sonra · "
const stageLabel = pack => (pack.stage ? `${pack.stage}. aşamadan sonra · ` : "");

function statusBadge(key) {
  const s = srs.status(key);
  return `<span class="badge st-${s}">${srs.STATUS_LABEL[s]}</span>`;
}

function addButton(key) {
  return srs.status(key) === "none" ? `<button class="mini" data-add="${esc(key)}">+ Listeme ekle</button>` : statusBadge(key);
}

function progressOf(keys) {
  const inList = keys.filter(k => srs.status(k) !== "none").length;
  const learned = keys.filter(k => srs.status(k) === "learned").length;
  return { total: keys.length, inList, learned };
}

// ---------- Kelimeler sayfası ----------

export function renderWords(app, view) {
  const all = [...wordIndex.entries()];
  const p = progressOf(all.map(([k]) => k));

  app.innerHTML = `
    ${pageHeader(store.secondsOn(store.today()))}
    <h1 class="lesson-title">📚 Kelimeler</h1>
    <section class="card stats">
      <div><div class="stat">${p.total}</div><div class="muted">kelime bankası</div></div>
      <div><div class="stat">${p.inList}</div><div class="muted">tekrar listemde</div></div>
      <div><div class="stat">${p.learned}</div><div class="muted">kalıcı öğrenildi</div></div>
    </section>
    <div class="tabs">
      <a class="tab ${view === "packs" ? "on" : ""}" href="#/words">Paketler</a>
      <a class="tab ${view === "all" ? "on" : ""}" href="#/words/all">Tüm kelimeler</a>
    </div>
    <div id="wordsBody"></div>`;

  store.startTimer(updateTimer);
  const body = document.getElementById("wordsBody");
  if (view === "all") renderBank(body);
  else renderPackList(body);

  app.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    store.markActivity();
    if (btn.dataset.play) return play(btn.dataset.play);
    if (btn.dataset.add) {
      srs.enroll([btn.dataset.add]);
      btn.closest(".add-slot").innerHTML = statusBadge(btn.dataset.add);
    }
  };
}

function renderPackList(body) {
  if (!packIndex.packs.length) {
    body.innerHTML = `<p class="muted">Henüz kelime paketi yok.</p>`;
    return;
  }
  body.innerHTML = packIndex.groups.map(g => {
    const packs = packIndex.packs.filter(p => p.group === g.id && packCache[p.id]);
    if (!packs.length) return "";
    return `<section class="level">
      <h2>${esc(g.title)}</h2>
      ${g.desc ? `<p class="muted small">${esc(g.desc)}</p>` : ""}
      <div class="packs">${packs.map(p => {
        const pack = packCache[p.id];
        const pr = progressOf(packKeys(pack));
        const pct = pr.total ? Math.round((pr.inList / pr.total) * 100) : 0;
        return `<a class="pack" href="#/pack/${p.id}">
          <div class="pack-head"><span class="pack-title">${esc(pack.title)}</span><span class="badge">${esc(pack.level)}</span></div>
          <div class="muted small">${stageLabel(pack)}${pr.total} ${unitOf(pack)} · ${pr.inList} listemde · ${pr.learned} öğrenildi</div>
          <div class="bar"><span style="width:${pct}%"></span></div>
        </a>`;
      }).join("")}</div>
    </section>`;
  }).join("");
}

function renderBank(body) {
  body.innerHTML = `
    <div class="filters">
      <input id="q" type="search" placeholder="Ara: İngilizce veya Türkçe" autocomplete="off" spellcheck="false">
      <select id="fSrc"><option value="">Tüm kaynaklar</option><option value="lesson">Dersler</option>${packIndex.groups.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join("")}</select>
      <select id="fLevel"><option value="">Tüm seviyeler</option>${LEVELS.map(l => `<option>${l}</option>`).join("")}</select>
      <select id="fStatus"><option value="">Tüm durumlar</option>${Object.entries(srs.STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    </div>
    <div class="muted small" id="count"></div>
    <div class="wlist" id="wlist"></div>
    <div class="row center"><button id="more" hidden>Daha fazla göster</button></div>`;

  let shown = PAGE_SIZE;
  const fold = s => s.toLocaleLowerCase("tr-TR");

  const filtered = () => {
    const q = fold(document.getElementById("q").value.trim());
    const src = document.getElementById("fSrc").value;
    const level = document.getElementById("fLevel").value;
    const st = document.getElementById("fStatus").value;
    return [...wordIndex.entries()].filter(([k, w]) =>
      (!q || fold(w.en).includes(q) || fold(w.tr).includes(q)) &&
      (!src || (src === "lesson" ? w.src.kind === "lesson" : w.groups?.has(src))) &&
      (!level || w.level === level) &&
      (!st || srs.status(k) === st))
      .sort((a, b) => a[1].en.localeCompare(b[1].en, "en", { sensitivity: "base" }));
  };

  const draw = () => {
    const rows = filtered();
    document.getElementById("count").textContent = `${rows.length} kelime`;
    document.getElementById("wlist").innerHTML = rows.slice(0, shown).map(([k, w]) => wordRow(k, w, { source: true })).join("") ||
      `<p class="muted">Sonuç yok.</p>`;
    document.getElementById("more").hidden = rows.length <= shown;
  };

  body.oninput = e => {
    if (e.target.matches("#q, select")) {
      shown = PAGE_SIZE;
      draw();
    }
  };
  body.onclick = e => {
    if (e.target.id === "more") {
      shown += PAGE_SIZE;
      draw();
    }
  };
  draw();
}

function wordRow(key, w, { source = false, example = false } = {}) {
  const srcLabel = w.src.kind === "lesson" ? `Ders: ${w.src.title}` : `${groupTitle(w.src.group)} · ${w.src.title}`;
  return `<div class="wrow" data-key="${esc(key)}">
    <div class="wrow-main">
      <div><b class="w-en-sm">${esc(w.en)}</b> <span class="reading-sm">${readingHtml(w.read)}</span>
        ${w.type ? `<span class="type">${esc(w.type)}</span>` : ""} <span class="lvl">${esc(w.level)}</span></div>
      <div class="w-tr-sm">${esc(w.tr)}${w.opposite ? ` <span class="muted">· ↔ ${esc(w.opposite)}</span>` : ""}</div>
      ${example && w.example ? `<div class="example">“${esc(w.example)}” <button class="mini" data-play="${esc(w.example)}">▶</button><div class="muted small">${esc(w.exampleTr || "")}</div></div>` : ""}
      ${example && w.note ? `<div class="note">${withReadings(esc(w.note))}</div>` : ""}
      ${source ? `<div class="muted small">${esc(srcLabel)}</div>` : ""}
    </div>
    <div class="wrow-side">
      <button class="mini" data-play="${esc(w.en)}">▶</button>
      <span class="add-slot">${addButton(key)}</span>
    </div>
  </div>`;
}

// ---------- Paket sayfası ----------

export function renderPack(app, id) {
  const pack = packCache[id];
  if (!pack) throw new Error("Paket bulunamadı");
  const words = packWords(pack);
  const keys = words.map(wordKey);

  const draw = () => {
    const pr = progressOf(keys);
    const waiting = keys.filter(k => srs.status(k) === "none").length;
    app.innerHTML = `
      ${pageHeader(store.secondsOn(store.today()), { href: "#/words", label: "← Kelimeler" })}
      <h1 class="lesson-title">${esc(pack.title)} <span class="badge">${esc(pack.level)}</span></h1>
      ${pack.intro ? `<section class="card">${withReadings(pack.intro)}</section>` : ""}
      <section class="card pack-actions">
        <div class="muted small">${stageLabel(pack)}${pr.total} ${unitOf(pack)} · ${pr.inList} listemde · ${pr.learned} öğrenildi<br>Günde en fazla ${srs.NEW_PER_DAY} yeni ${unitOf(pack)} tekrar sırasına girer.</div>
        ${waiting ? `<button class="primary" data-add-all>Hepsini tekrar listeme ekle (${waiting})</button>` : `<span class="badge ok">Hepsi listende ✔</span>`}
      </section>
      <div class="wlist">${words.map(w => wordRow(wordKey(w), w, { example: true })).join("")}</div>
      <nav class="lesson-nav">${packNav(id)}</nav>`;
  };

  draw();
  store.startTimer(updateTimer);

  app.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    store.markActivity();
    if (btn.dataset.play) return play(btn.dataset.play);
    if ("addAll" in btn.dataset) {
      srs.enroll(keys);
      return draw();
    }
    if (btn.dataset.add) {
      srs.enroll([btn.dataset.add]);
      btn.closest(".add-slot").innerHTML = statusBadge(btn.dataset.add);
    }
  };
}

function packNav(id) {
  const list = packIndex.packs.filter(p => packCache[p.id]);
  const i = list.findIndex(p => p.id === id);
  const link = (p, cls, label) => `<a class="btn nav-${cls}" href="#/pack/${p.id}"><span class="nav-label">${label}</span><span class="nav-title">${esc(packCache[p.id].title)}</span></a>`;
  return `${i > 0 ? link(list[i - 1], "prev", "← Önceki paket") : "<span></span>"}
    <a class="btn nav-home" href="#/words">Kelimeler</a>
    ${i < list.length - 1 ? link(list[i + 1], "next", "Sonraki paket →") : "<span></span>"}`;
}

// ---------- Isınma (ders başında) ----------

export function warmupHtml(lesson) {
  const exclude = new Set(lesson.words.map(wordKey));
  const keys = srs.warmupKeys(k => wordIndex.has(k), exclude, 5);
  if (keys.length < 3) return "";
  return `<section class="card warmup">
    <h3>🔥 Isınma · önceki kelimeler</h3>
    <p class="muted small">Türkçesine bakıp İngilizcesini hatırlayın, sonra açın. Her girişte farklı kelimeler gelir.</p>
    ${keys.map(k => {
      const w = wordIndex.get(k);
      return `<div class="wu" data-key="${esc(k)}">
        <div class="wu-q">${esc(w.tr)}</div>
        <div class="wu-a" hidden><b>${esc(w.en)}</b> ${readingHtml(w.read)}</div>
        <div class="wu-btns"><button class="mini" data-wu-show>Göster</button></div>
      </div>`;
    }).join("")}
  </section>`;
}

// Isınma düğmeleri; işlendiyse true döner.
export function handleWarmupClick(btn) {
  const row = btn.closest(".wu");
  if (!row) return false;
  const key = row.dataset.key;
  const w = wordIndex.get(key);
  if ("wuShow" in btn.dataset) {
    row.querySelector(".wu-a").hidden = false;
    row.querySelector(".wu-btns").innerHTML = `<button class="mini" data-play="${esc(w.en)}">▶</button>
      <button class="mini ok-btn" data-wu="2">Bildim</button><button class="mini bad-btn" data-wu="0">Bilemedim</button>`;
    play(w.en);
    return true;
  }
  if (btn.dataset.wu !== undefined) {
    const knew = btn.dataset.wu === "2";
    // Bilinmeyen kelime bugün tekrar sırasına girer; bilinen kelime sadece vadesi geldiyse ilerletilir.
    if (!knew) srs.grade(key, 0);
    else if (srs.isDue(key)) srs.grade(key, 2);
    row.classList.add(knew ? "wu-ok" : "wu-bad");
    row.querySelector(".wu-btns").innerHTML = `<span class="badge ${knew ? "ok" : ""}">${knew ? "✔ bildim" : "tekrar edilecek"}</span>`;
    return true;
  }
  return false;
}
