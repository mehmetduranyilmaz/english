// Konuşma testi: tarayıcının konuşma tanıması (en-GB). Telaffuza puan vermez,
// sadece söylenenin hedef olarak anlaşılıp anlaşılmadığını kontrol eder.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = !!SR;

const NUMBERS = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" };

export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[’‘`´]/g, "'") // telefon klavyelerinin kesme işaretleri: I’m → I'm
    .replace(/[.,!?;:"“”]/g, "")
    .replace(/\b(10|[1-9])\b/g, n => NUMBERS[n])
    .replace(/\s+/g, " ")
    .trim();
}

// accept: kabul edilen söyleyişler. Sonuç: { ok, heard, alternatives }
export function listen(accept) {
  return new Promise((resolve, reject) => {
    const rec = new SR();
    rec.lang = "en-GB";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    let done = false;
    rec.onresult = e => {
      done = true;
      const alternatives = Array.from(e.results[0]).map(a => normalize(a.transcript));
      const targets = accept.map(normalize);
      const ok = alternatives.some(a => targets.includes(a));
      resolve({ ok, heard: alternatives[0], alternatives });
    };
    rec.onerror = e => {
      done = true;
      reject(new Error(e.error === "not-allowed" ? "Mikrofon izni verilmedi." : e.error === "no-speech" ? "Ses algılanmadı, tekrar deneyin." : `Hata: ${e.error}`));
    };
    rec.onend = () => {
      if (!done) reject(new Error("Ses algılanmadı, tekrar deneyin."));
    };
    rec.start();
  });
}
