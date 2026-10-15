# İngilizce · B2 Yolu

A1'den B2'ye British telaffuzla kendi kendine İngilizce çalışma uygulaması. Sunucu gerektirmeyen statik bir web sitesi; GitHub Pages'ta ücretsiz çalışır.

Öğrenme sırası: [ROADMAP.md](ROADMAP.md)

## Yerelde çalıştırma

Mikrofon sadece `localhost` veya `https` adreslerinde çalıştığı için dosyaya çift tıklamak yerine küçük bir sunucu açın:

```
python tools/serve.py
```

(Bu sunucu tarayıcının eski dosyaları önbellekten kullanmasını engeller; değişiklikler sayfayı yenileyince hemen görünür.)

Sonra Chrome veya Edge'de: http://localhost:8000

## GitHub Pages'a yükleme

1. GitHub'da **herkese açık** bir repo açın ve bu klasörü gönderin.
2. Repo → Settings → Pages → "Deploy from a branch" → `main` / `(root)`.
3. Birkaç dakika sonra site `https://<kullanıcı-adı>.github.io/<repo-adı>/` adresinde açılır.

İlerlemeniz (süre, ödevler) repoya değil, tarayıcınıza kaydedilir. Ana sayfadaki **Yedeği indir** düğmesiyle ara sıra yedek alın.

## Klasörler

| Yol | İçerik |
|---|---|
| `index.html`, `css/` | Sayfa ve stiller |
| `js/app.js` | Yönlendirme, ana sayfa, ders ve tekrar ekranları |
| `js/words.js` | Kelimeler sayfası, paket sayfası, ders başındaki Isınma |
| `js/data.js` | Ders ve paket verisini yükler, tüm kelimeleri tek dizinde toplar |
| `js/ui.js` | Ortak görünüm parçaları (okunuş biçimlendirme, ses düğmeleri) |
| `js/srs.js`, `js/store.js` | Aralıklı tekrar algoritması; tarayıcıda saklanan ilerleme |
| `js/audio.js`, `js/speech.js` | British ses çalma; konuşma tanıma |
| `data/curriculum.json` | 30 aşamalı öğrenme sırası ve her aşamanın dersleri |
| `data/lessons/*.json` | Dersler: konu anlatımı, kelimeler (Türkçe harflerle British okunuş), ödevler |
| `data/packs/*.json` | Kelime paketleri (temel, günlük konuşma, yazılım); `index.json` sırayı belirler |
| `audio/tts/*.mp3`, `data/audio-tts.json` | Azure British sesiyle (Sonia) üretilmiş sesler ve metin → dosya dizini (otomatik üretilir) |
| `data/audio-uk.json` | Kelimelerin gerçek insan British kayıtları (otomatik üretilir) |
| `tools/make-tts.mjs`, `tools/tts-overrides.json` | Azure ile ses üretimi; anlamına göre okunuşu değişen kelimeler ve kısaltmalar için okunuş düzeltmeleri |
| `tools/find-uk-audio.mjs` | British kayıtları Wiktionary'den bulan araç |
| `tools/find-commons-audio.mjs` | Wiktionary'de bulunamayanları Commons'ta dosya adıyla arayan araç |
| `tools/audio-terms.mjs` | İki aracın ortak kelime listesi ve British aksan filtresi |
| `tools/check-lessons.mjs` | Ders ve paket verisini denetler (tekrar eden kelime, okunuş biçimi, fonetik sembol) |
| `tools/serve.py` | Önbelleksiz yerel sunucu |

## Kelimeler ve paketler

Ana sayfadaki **📚 Kelimeler** kartı kelime bankasını açar (derslerdeki ve paketlerdeki tüm kelimeler):

- **Paketler:** Temel kavramlar (sayılar, zaman, takvim, ölçüler, renkler), Günlük konuşma çekirdeği (en sık fiil, sıfat, isim, zarf ve konuşma kalıpları), Yazılım geliştirici (kod, süreç, Git, toplantı, mülakat). “Hepsini tekrar listeme ekle” ile paket tekrar listesine girer.
- **Tüm kelimeler:** arama (İngilizce / Türkçe), kaynak, seviye ve durum süzgeci; tek tek “+ Listeme ekle”.
- **Isınma:** her dersin başında, tekrar listenizdeki önceki kelimelerden 5 tanesi sorulur; her girişte farklı kelimeler gelir.

**Paket kelimesi alanları:** `en`, `tr`, `read` (okunuş), `type` (isim, fiil, sıfat, zarf, zamir, edat, bağlaç, kalıp, sayı…), `level` (A1–B2), `example` + `exampleTr` (örnek cümle), isteğe bağlı `note`, `opposite`, `plural`.
Derslerde zaten olan bir kelime pakette `{ "ref": "monday" }` diye **atıfla** gösterilir; böylece aynı kelimenin iki ayrı tekrar kartı oluşmaz.

Veri değişikliğinden sonra: `node tools/check-lessons.mjs`

## Kelime tekrarı

Bir dersin ödevi bitince o dersin kelimeleri tekrar listesine girer (`js/srs.js`, SM-2'nin sade hali). Ana sayfadaki "Kelime tekrarı" kartından her gün tekrar edilir:

- Kart Türkçe → İngilizce veya İngilizce → Türkçe sorar; cevap açılınca British ses çalar.
- Puan: **Bilemedim** (aynı gün tekrar gelir), **Zorlandım**, **Bildim**, **Çok kolay**. Bildikçe aralık uzar (1 gün → 3 gün → …).
- Günde en fazla 20 yeni kelime. 21 günden uzun aralığa çıkan kelime "kalıcı öğrenildi" sayılır.
- Klavye: Boşluk = cevabı göster, 1–4 = puan.

## Yeni ders ekleme

1. `data/lessons/` içine yeni bir JSON dosyası ekleyin (örnek: `a1-01.json`).
2. Ders kimliğini `data/curriculum.json` içinde ilgili aşamanın `lessons` listesine yazın.
3. Sesleri üretin: `node tools/make-tts.mjs` (sadece yeni ya da değişen metinleri üretir).
4. Gerçek insan kayıtlarını güncelleyin: `node tools/find-uk-audio.mjs`, ardından `node tools/find-commons-audio.mjs` (ikisi de sadece kaydı henüz bulunmamış kelimeleri arar).
   Bulunan kayıt dersin öğrettiği okunuşla uyuşmuyorsa (ör. "a" kaydı vurgulu "ey"), kelimeye `"noRecording": true` ekleyin; o kelime tarayıcının British sesiyle okunur.

Ödev türleri: `choice` (seçmeli), `write` (Türkçesi verilir, İngilizcesi yazılır), `listen` (dinle ve yaz), `speak` (sesli söyle).

**Okunuş yazımı (`read` alanı):** fonetik sembol yok, duyulan ses Türkçe harflerle yazılır.
- Heceler `-` ile ayrılır, vurgulu hece `[ ]` içine alınır: `kım-[pyuu]-tı` → kım-**PYUU**-tı
- Uzun ses harf tekrarıyla: `şii`, `foo`. British'te okunmayan r yazılmaz: her → `höö`
- Türkçede olmayan sesler `{ }` içinde, renkli gösterilir: `{d}ey` (they), `{t}rii` (three), `{w}ii` (we), `k{a}t` (cat)
- Ders metinlerinde okunuş `«...»` içine yazılır: `«{d}ey»`

## Ses kaynakları

- **Ana ses:** Azure'un British yapay zekâ sesi (en-GB-SoniaNeural). Tüm kelimeler, kalıplar, ödev ve örnek cümleler bir kez MP3 olarak üretilip `audio/tts/` klasöründe durur; her cihazda aynı ses çalar.
  Üretmek için Azure Speech kaynağı (ücretsiz F0 yeter) ve iki ortam değişkeni gerekir; anahtar repoya girmez:
  ```powershell
  [Environment]::SetEnvironmentVariable("AZURE_SPEECH_KEY", "<anahtar>", "User")
  [Environment]::SetEnvironmentVariable("AZURE_SPEECH_REGION", "northeurope", "User")
  ```
  Ücretsiz katman dakikada 20 istek kabul eder; tüm metinlerin ilk üretimi yaklaşık 4 saat sürer.
- **Gerçek kayıtlar:** Wikimedia Commons'taki RP / UK aksanlı insan kayıtları (çoğu CC BY-SA). Kelime kartındaki **🎙 gerçek kişi** düğmesiyle dinlenir; yanında kaynağa bağlantı var.
- **Yedek:** MP3'ü olmayan metinler tarayıcının British (en-GB) sesiyle okunur.
- **Cambridge:** sadece bağlantı olarak; ses dosyaları kopyalanmaz.
- **Konuşma testi:** tarayıcının konuşma tanıması (en-GB). Telaffuza puan vermez, sadece söylediğinizin anlaşılıp anlaşılmadığına bakar.
