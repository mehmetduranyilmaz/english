import * as store from "./store.js";
import { registerOffline, offlineCardHtml, refresh as refreshOffline } from "./offline.js";
import { loadAudioIndex, play, playRecording, hasUkVoice, hasTts, whenVoicesReady, onVoicesChanged, voiceSummary } from "./audio.js";
import { listen, normalize, speechSupported } from "./speech.js";
import * as srs from "./srs.js";
import { esc, formatMinutes, readingParts, readingHtml, withReadings, sourceHtml, audioButtons, practiceSay, pageHeader, updateTimer } from "./ui.js";
import { curriculum, lessonIds, lessonCache, getLesson, wordIndex, lessonKeys, packIndex, loadData } from "./data.js";
import { renderWords, renderPack, warmupHtml, handleWarmupClick } from "./words.js";

const app = document.getElementById("app");
let pageKeyHandler = null;

// ---------- Ana sayfa ----------

function reviewCardHtml() {
  const s = srs.stats();
  if (!s.total) {
    return `<section class="card review-home"><h3>🔁 Kelime tekrarı</h3>
      <p class="muted">Bir dersin ödevini bitirince veya Kelimeler sayfasından paket ekleyince kelimeler buraya gelir ve her gün tekrar edilir.</p></section>`;
  }
  return `<section class="card review-home ${s.today ? "has-due" : ""}">
    <div><h3>🔁 Kelime tekrarı</h3>
      <div class="muted small">Listede ${s.total} kelime · ${s.learned} kelime kalıcı öğrenildi</div></div>
    ${s.today
      ? `<a class="btn primary" href="#/review">Bugün ${s.today} kelime · Başla</a>`
      : `<span class="badge ok">Bugünlük bitti ✔</span>`}
  </section>`;
}

function wordsCardHtml() {
  return `<a class="card review-home words-home" href="#/words">
    <div><h3>📚 Kelimeler</h3>
      <div class="muted small">Kelime bankası: ${wordIndex.size} kelime · ${packIndex.packs.length} paket (temel, konuşma cümleleri, günlük konuşma, yazılım)</div></div>
    <span class="btn">Aç →</span>
  </a>`;
}

function renderHome() {
  const total = store.totalSeconds();
  const goal = curriculum.goalHours * 3600;
  const doneCount = lessonIds.filter(id => store.lessonResult(id)?.done).length;

  const levels = curriculum.levels.map(level => `
    <section class="level">
      <h2>${esc(level.title)}</h2>
      ${level.stages.map(stage => `
        <div class="stage ${stage.lessons.length ? "" : "soon"}">
          <div class="stage-head">
            <span class="stage-no">${stage.id}</span>
            <div>
              <div class="stage-title">${esc(stage.title)}</div>
              <div class="stage-en">${esc(stage.en)}</div>
            </div>
          </div>
          ${stage.lessons.length ? `<ol class="lessons">${stage.lessons.map(id => {
            const r = store.lessonResult(id);
            const badge = r?.done ? `<span class="badge ok">✔ %${Math.round(r.best * 100)}</span>` : `<span class="badge">ödev bekliyor</span>`;
            return `<li><a href="#/lesson/${id}">${esc(lessonCache[id]?.title ?? id)}</a> ${badge}</li>`;
          }).join("")}</ol>` : `<div class="soon-text">Yakında</div>`}
        </div>`).join("")}
    </section>`).join("");

  app.innerHTML = `
    <header class="top"><h1>İngilizce · B2 yolu</h1><span class="muted">British English</span></header>
    <section class="card stats">
      <div><div class="stat">${formatMinutes(store.secondsOn(store.today()))}</div><div class="muted">bugün</div></div>
      <div><div class="stat">${formatMinutes(total)}</div><div class="muted">toplam</div></div>
      <div><div class="stat">${doneCount}/${lessonIds.length}</div><div class="muted">ödev</div></div>
      <div class="goal">
        <div class="bar"><span style="width:${Math.min(100, (total / goal) * 100).toFixed(2)}%"></span></div>
        <div class="muted small">B2 için yaklaşık ${curriculum.goalHours} saat (Cambridge tahmini)</div>
      </div>
    </section>
    ${speechSupported ? "" : `<div class="card warn">Bu tarayıcı konuşma testini desteklemiyor. Chrome veya Edge kullanın.</div>`}
    ${reviewCardHtml()}
    ${wordsCardHtml()}
    ${offlineCardHtml()}
    ${levels}
    <footer class="card backup">
      <div class="muted small">İlerlemeniz sadece bu tarayıcıda saklanır. Ara sıra yedek alın.</div>
      <div class="row">
        <button id="exportBtn">Yedeği indir</button>
        <label class="btn">Yedekten yükle<input type="file" id="importInput" accept="application/json" hidden></label>
      </div>
    </footer>`;

  refreshOffline();
  document.getElementById("exportBtn").onclick = store.exportBackup;
  document.getElementById("importInput").onchange = async e => {
    try {
      await store.importBackup(e.target.files[0]);
      renderHome();
    } catch (err) {
      alert(err.message);
    }
  };
}

// ---------- Ders sayfası ----------

// Sayfa altı gezinme: ilk derste "önceki", son derste "sonraki" gösterilmez.
function lessonNavHtml(id) {
  const i = lessonIds.indexOf(id);
  const prev = i > 0 ? lessonIds[i - 1] : null;
  const next = i >= 0 && i < lessonIds.length - 1 ? lessonIds[i + 1] : null;
  const link = (lessonId, cls, label) =>
    `<a class="btn nav-${cls}" href="#/lesson/${lessonId}"><span class="nav-label">${label}</span><span class="nav-title">${esc(lessonCache[lessonId]?.title ?? lessonId)}</span></a>`;
  return `<nav class="lesson-nav">
    ${prev ? link(prev, "prev", "← Önceki ders") : "<span></span>"}
    <a class="btn nav-home" href="#/">Ana sayfa</a>
    ${next ? link(next, "next", "Sonraki ders →") : "<span></span>"}
  </nav>`;
}

function updateVoiceWarning() {
  const warn = document.getElementById("voiceWarn");
  if (!warn) return;
  // Azure sesleri varsa tarayıcı sesine pek düşülmez; uyarı gereksiz.
  warn.hidden = hasUkVoice() || hasTts();
  document.getElementById("voiceList").textContent = voiceSummary();
}

function wordCard(w) {
  const enc = encodeURIComponent(w.en.toLowerCase());
  const notes = [...new Set([...readingParts(w.read).notes, ...(w.plural ? readingParts(w.plural.read).notes : []), ...(w.note ? [w.note] : [])])];
  return `
    <div class="word">
      <div class="word-head"><span class="w-en">${esc(w.en)}</span><span class="w-tr">${esc(w.tr)}</span></div>
      <div class="say-as">okunuşu: ${readingHtml(w.read)}</div>
      ${w.opposite ? `<div class="opp">↔ zıttı: <b>${esc(w.opposite)}</b></div>` : ""}
      ${notes.map(n => `<div class="note">${withReadings(esc(n))}</div>`).join("")}
      <div class="row">${audioButtons(w.en)}</div>
      ${sourceHtml(w.en)}
      ${w.plural ? `
        <div class="plural">
          <div><span class="muted">Çoğul:</span> <b>${esc(w.plural.en)}</b> · ${readingHtml(w.plural.read)}</div>
          <div class="row">${audioButtons(w.plural.en)}</div>
          ${sourceHtml(w.plural.en)}
        </div>` : ""}
      <div class="links">
        <a href="https://dictionary.cambridge.org/dictionary/english/${enc}" target="_blank" rel="noopener">Cambridge ↗</a>
        <a href="https://youglish.com/pronounce/${enc}/english/uk" target="_blank" rel="noopener">YouGlish UK ↗</a>
      </div>
      <div class="say-result"></div>
    </div>`;
}

function exerciseHtml(ex, i) {
  const n = `<span class="ex-no">${i + 1}</span>`;
  switch (ex.type) {
    case "choice":
      return `<div class="task" data-i="${i}">${n}<div class="ex-prompt">${esc(ex.prompt)}</div>
        <div class="row">${ex.options.map(o => `<button data-choice="${esc(o)}">${esc(o)}</button>`).join("")}</div>
        <div class="ex-result"></div></div>`;
    case "write":
      return `<div class="task" data-i="${i}">${n}<div class="ex-prompt">İngilizcesini yazın: <b>${esc(ex.prompt)}</b></div>
        <div class="row"><input autocomplete="off" autocapitalize="off" spellcheck="false"><button data-check>Kontrol et</button></div>
        <div class="ex-result"></div></div>`;
    case "listen":
      return `<div class="task" data-i="${i}">${n}<div class="ex-prompt">Dinleyin ve duyduğunuzu yazın</div>
        <div class="row"><button data-play="${esc(ex.say)}">▶ Dinle</button><button data-slow="${esc(ex.say)}">🐢 Yavaş</button></div>
        <div class="row"><input autocomplete="off" autocapitalize="off" spellcheck="false"><button data-check>Kontrol et</button></div>
        <div class="ex-result"></div></div>`;
    case "speak":
      return `<div class="task" data-i="${i}">${n}<div class="ex-prompt">Sesli söyleyin: <b>${esc(ex.say)}</b></div>
        <div class="row"><button data-play="${esc(ex.say)}">▶ Önce dinle</button>
        ${speechSupported ? `<button class="primary" data-speak>🎤 Konuş</button>` : ""}<button data-skip>Atla</button></div>
        <div class="ex-result"></div></div>`;
  }
  return "";
}

async function renderLesson(id) {
  const lesson = await getLesson(id);
  // Her ödevin ilk denemesi puana sayılır: true/false, atlanırsa null.
  const firstTry = new Map();

  app.innerHTML = `
    ${pageHeader(store.secondsOn(store.today()))}
    <h1 class="lesson-title">${esc(lesson.title)}</h1>
    <div class="card warn" id="voiceWarn" hidden>
      <b>Bu tarayıcıda British ses yok.</b> Gerçek kaydı olmayan kelimeler (🤖 işaretliler) Amerikan aksanıyla okunacak.
      <ul class="small">
        <li><b>En kolayı:</b> uygulamayı <b>Microsoft Edge</b> veya <b>Google Chrome</b> ile açın. İkisinde de British ses hazır gelir.</li>
        <li><b>Ya da</b> Windows'a British ses ekleyin: Ayarlar → Saat ve dil → Konuşma → Ses ekle → <i>English (United Kingdom)</i>. Sonra tarayıcıyı yeniden başlatın.</li>
      </ul>
      <div class="small muted">Tarayıcının bulduğu sesler: <span id="voiceList"></span></div>
    </div>
    ${warmupHtml(lesson)}
    <h2>1 · Konu</h2>
    ${lesson.sections.map(s => `<section class="card"><h3>${esc(s.heading)}</h3>${withReadings(s.body)}</section>`).join("")}
    <h2>2 · Kelimeler</h2>
    <div class="words">${lesson.words.map(wordCard).join("")}</div>
    <h2>3 · Ödev <span class="muted small" id="progress"></span></h2>
    <div class="exercises">${lesson.exercises.map(exerciseHtml).join("")}</div>
    <div id="summary"></div>
    ${lessonNavHtml(id)}`;

  updateVoiceWarning();
  store.startTimer(updateTimer);

  const updateProgress = () => {
    document.getElementById("progress").textContent = `${firstTry.size}/${lesson.exercises.length}`;
    if (firstTry.size === lesson.exercises.length) finish();
  };

  const record = (i, ok) => {
    if (!firstTry.has(i)) {
      firstTry.set(i, ok);
      updateProgress();
    }
  };

  const finish = () => {
    const scored = [...firstTry.values()].filter(v => v !== null);
    const score = scored.filter(Boolean).length;
    const total = scored.length || 1;
    store.saveLessonResult(id, score, total);
    const added = srs.enroll(lessonKeys(lesson));
    const pct = Math.round((score / total) * 100);
    document.getElementById("summary").innerHTML = `
      <section class="card summary ${pct >= 80 ? "pass" : ""}">
        <h3>Ödev tamamlandı: ${score}/${scored.length} (%${pct})</h3>
        <p>${pct >= 80 ? "Harika! Bir sonraki derse geçebilirsiniz." : "Yanlışları tekrar edip ödevi bir daha çözmenizi öneririm (%80 ve üstü hedef)."}</p>
        ${added ? `<p>🔁 Bu dersin <b>${added} kelimesi</b> tekrar listenize eklendi.</p>` : ""}
        <div class="row"><button data-restart>Tekrar çöz</button>${srs.stats().today ? `<a class="btn primary" href="#/review">Kelime tekrarı</a>` : ""}<a class="btn" href="#/">Ana sayfa</a></div>
      </section>`;
  };

  updateProgress();

  app.onclick = async e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    store.markActivity();

    if (btn.dataset.play) return play(btn.dataset.play);
    if (btn.dataset.slow) return play(btn.dataset.slow, true);
    if (btn.dataset.rec) return playRecording(btn.dataset.rec);
    if ("restart" in btn.dataset) return renderLesson(id);
    if (handleWarmupClick(btn)) return;

    // Kelime kartında serbest konuşma pratiği (puana sayılmaz).
    if (btn.dataset.say) return practiceSay(btn.dataset.say, btn.closest(".word").querySelector(".say-result"));

    const box = btn.closest(".task");
    if (!box) return;
    const i = Number(box.dataset.i);
    const ex = lesson.exercises[i];
    const result = box.querySelector(".ex-result");
    const show = (ok, msg) => {
      result.className = `ex-result ${ok ? "ok" : "bad"}`;
      result.innerHTML = msg;
    };

    if (btn.dataset.choice !== undefined) {
      const ok = btn.dataset.choice === ex.answer;
      record(i, ok);
      box.querySelectorAll("[data-choice]").forEach(b => {
        b.disabled = true;
        if (b.dataset.choice === ex.answer) b.classList.add("right");
      });
      if (!ok) btn.classList.add("wrong");
      show(ok, (ok ? "✔ Doğru." : `✘ Doğrusu: <b>${esc(ex.answer)}</b>`) + (ex.explain ? ` ${withReadings(esc(ex.explain))}` : ""));
      return;
    }

    if ("check" in btn.dataset) {
      const raw = box.querySelector("input").value;
      if (!raw.trim()) return;
      const clean = s => (ex.strictCase ? s.replace(/[’‘`´]/g, "'").replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim() : normalize(s));
      const ok = ex.answers.some(a => clean(a) === clean(raw));
      record(i, ok);
      const answer = ex.answers[0];
      show(ok, (ok ? "✔ Doğru." : `✘ Doğrusu: <b>${esc(answer)}</b>`) + (ex.explain ? ` ${withReadings(esc(ex.explain))}` : "") +
        (ex.type === "listen" ? ` <button data-play="${esc(ex.say)}">▶</button>` : ""));
      return;
    }

    if ("skip" in btn.dataset) {
      record(i, null);
      result.className = "ex-result muted";
      result.textContent = "Atlandı (puana sayılmaz).";
      return;
    }

    if ("speak" in btn.dataset) {
      btn.disabled = true;
      result.className = "ex-result muted";
      result.textContent = "Dinliyorum…";
      try {
        const r = await listen(ex.accept);
        record(i, r.ok);
        const hint = !r.ok && ex.mistakes ? r.alternatives.map(a => ex.mistakes[a]).find(Boolean) : "";
        show(r.ok, r.ok ? `✔ Anlaşıldı: “${esc(r.heard)}”` : `✘ Duyulan: “${esc(r.heard)}”${hint ? `<br>💡 ${esc(hint)}` : ""}<br><span class="muted small">Tekrar deneyebilirsiniz.</span>`);
      } catch (err) {
        result.className = "ex-result muted";
        result.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    }
  };

  app.onkeydown = e => {
    if (e.key === "Enter" && e.target.matches(".task input")) e.target.closest(".task").querySelector("[data-check]").click();
  };
}

// ---------- Kelime tekrarı ----------

function renderReview() {
  // Silinmiş kelimeler sıraya girmez; kelimeler hep aynı sırayla gelmesin diye karıştırılır.
  const queue = srs.buildQueue().filter(k => wordIndex.has(k));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  const startCount = queue.length;
  let key = null;
  let revealed = false;
  let toTurkish = false; // true: İngilizce gösterilir, Türkçesi hatırlanır

  app.innerHTML = `
    ${pageHeader(store.secondsOn(store.today()))}
    <h1 class="lesson-title">🔁 Kelime tekrarı <span class="muted small" id="left"></span></h1>
    <div id="reviewBox"></div>
    <p class="muted small keys">Klavye: <b>Boşluk</b> cevabı göster · <b>1–4</b> puan ver</p>`;

  store.startTimer(updateTimer);
  const box = document.getElementById("reviewBox");

  function show() {
    document.getElementById("left").textContent = queue.length ? `· ${queue.length} kaldı` : "";
    if (!queue.length) {
      const s = srs.stats();
      box.innerHTML = `<section class="card summary pass">
        <h3>${startCount ? "Bugünlük bitti! 🎉" : "Bugün tekrar edilecek kelime yok"}</h3>
        <p>${startCount ? `${startCount} kelime tekrar ettiniz. ` : ""}Listede ${s.total} kelime var, ${s.learned} tanesi kalıcı öğrenildi.</p>
        <div class="row"><a class="btn primary" href="#/">Ana sayfa</a><a class="btn" href="#/words">Kelimeler</a></div></section>`;
      return;
    }
    key = queue[0];
    revealed = false;
    toTurkish = Math.random() < 0.5;
    const w = wordIndex.get(key);
    box.innerHTML = `<section class="card flash">
      ${toTurkish
        ? `<div class="ask">İngilizce → Türkçe</div><div class="big">${esc(w.en)}</div><div class="muted">Anlamını hatırlayın</div>`
        : `<div class="ask">Türkçe → İngilizce</div><div class="big">${esc(w.tr)}</div><div class="muted">İngilizcesini hatırlayın, sesli söyleyin</div>`}
      <div class="row center"><button class="primary" data-reveal>Cevabı göster</button></div>
    </section>`;
    if (toTurkish) play(w.en);
  }

  function reveal() {
    revealed = true;
    const w = wordIndex.get(key);
    const c = srs.card(key);
    box.innerHTML = `<section class="card flash">
      <div class="big">${esc(w.en)}</div>
      <div class="say-as">okunuşu: ${readingHtml(w.read)}</div>
      <div class="tr-big">${esc(w.tr)}</div>
      ${w.opposite ? `<div class="opp">↔ zıttı: <b>${esc(w.opposite)}</b></div>` : ""}
      ${w.plural ? `<div class="opp">Çoğul: <b>${esc(w.plural.en)}</b> · ${readingHtml(w.plural.read)}</div>` : ""}
      ${w.example ? `<div class="example">“${esc(w.example)}” <button class="mini" data-play="${esc(w.example)}">▶</button><div class="muted small">${esc(w.exampleTr || "")}</div></div>` : ""}
      ${w.note ? `<div class="note">${withReadings(esc(w.note))}</div>` : ""}
      <div class="row center">${audioButtons(w.en)}</div>
      <div class="say-result"></div>
      <div class="grades">${srs.GRADES.map(g => `
        <button data-grade="${g.id}" class="grade g${g.id}">
          <span>${g.label}</span><small>${srs.intervalLabel(srs.next(c, g.id).interval)}</small>
        </button>`).join("")}</div>
    </section>`;
    if (!toTurkish) play(w.en);
  }

  function rate(g) {
    const after = srs.grade(key, g);
    queue.shift();
    // Bilemediğiniz kelime aynı oturumda sona eklenir.
    if (after.interval === 0) queue.push(key);
    show();
  }

  app.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    store.markActivity();
    if (btn.dataset.play) return play(btn.dataset.play);
    if (btn.dataset.slow) return play(btn.dataset.slow, true);
    if ("reveal" in btn.dataset) return reveal();
    if (btn.dataset.grade !== undefined) return rate(Number(btn.dataset.grade));
    if (btn.dataset.say) return practiceSay(btn.dataset.say, box.querySelector(".say-result"));
  };

  pageKeyHandler = e => {
    if (e.target.matches("input, textarea") || !key || !queue.length) return;
    if (e.key === " " && !revealed) {
      e.preventDefault();
      reveal();
    } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
      rate(Number(e.key) - 1);
    }
  };
  document.addEventListener("keydown", pageKeyHandler);

  show();
}

// ---------- Yönlendirme ----------

async function route() {
  store.stopTimer();
  app.onclick = null;
  app.onkeydown = null;
  if (pageKeyHandler) document.removeEventListener("keydown", pageKeyHandler);
  pageKeyHandler = null;
  const hash = location.hash;
  const lesson = hash.match(/^#\/lesson\/([\w-]+)$/);
  const pack = hash.match(/^#\/pack\/([\w-]+)$/);
  try {
    if (lesson) await renderLesson(lesson[1]);
    else if (pack) renderPack(app, pack[1]);
    else if (hash === "#/review") renderReview();
    else if (hash === "#/words") renderWords(app, "packs");
    else if (hash === "#/words/all") renderWords(app, "all");
    else renderHome();
  } catch (err) {
    app.innerHTML = `<div class="card warn">Sayfa yüklenemedi: ${esc(err.message)}. <a href="#/">Ana sayfa</a></div>`;
  }
  scrollTo(0, 0);
}

registerOffline();
await Promise.all([loadData(), loadAudioIndex(), whenVoicesReady()]);
// Ödevi daha önce bitmiş derslerin kelimeleri de tekrar listesine girsin.
for (const id of lessonIds) if (store.lessonResult(id)?.done) srs.enroll(lessonKeys(lessonCache[id]));
// Ses listesi sonradan değişirse (ör. Edge çevrimiçi sesleri geç ekler) uyarıyı güncelle.
onVoicesChanged(updateVoiceWarning);
addEventListener("hashchange", route);
route();
