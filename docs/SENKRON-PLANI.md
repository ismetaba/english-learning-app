# Video ↔ Kelime Senkronu ve Güvenilirlik Planı

**Tarih:** 2026-10-12 · **Kapsam:** `ios-native` (aktif ürün) · **Hedef:** demo sırasında videonun, altyazının, kelime vurgusunun ve Türkçe karşılıkların aynı anda, kesintisiz ve hatasız akması.

> Bu plan önceki denetim raporunun (`DENETIM-RAPORU-2026-07-02.md`) üzerine kuruludur ama yalnızca **demoda kullanıcının hissedeceği** fonksiyonel sorunlara odaklanır. Her madde önce onu yeniden üreten bir testle kanıtlandı, sonra düzeltildi (CLAUDE.md kuralı).

---

## 1. Ölçülen gerçek durum

Canlı API'den (english-learning-admin.fly.dev) 85 video, 587 klip, 20.112 satır, 105.129 kelime indirilip analiz edildi:

| Bulgu | Ölçüm | Kullanıcının gördüğü |
|---|---|---|
| Oynatıcı zamanı her **220 ms**'de bir bildiriyor | Kelimelerin **%65'i 220 ms'den kısa** (medyan 160 ms) | Karaoke kelimelerin çoğunu atlıyor, vurgu sesin gerisinde kalıyor |
| Klip başlangıcı/bitişi **tam saniyeye yuvarlanıyor** (`Int(start)`) | 10.6 sn → 10.0, 14.7 sn → 14.0 | Altyazı 0,6 sn kayık başlıyor; son kelimeler kesiliyor, bazen bir sonraki klibe hiç geçilmiyor |
| Klip değişince `reload` **ilk klibi** yeniden oynatıyor | `updateUIView` yeni prop'ları yok sayıyor | Ekranda 2. sahnenin altyazısı, videoda 1. sahne |
| Aynı anda gönderilen `seek` + `play` | SwiftUI tek slotlu binding ilkini yutuyor | Satıra dokununca oraya atlamıyor |
| Hazır olmadan gönderilen komutlar | `if(!player)return;` | Kaydırılan reel hiç başlamıyor (siyah kart) |
| Hız seçimi (0.75×) klip değişince | YouTube 1×'e sıfırlıyor | Yavaş dinleyen öğrenci birden hızlı videoya düşüyor |
| Oynatılamayan video (hata 150 vb.) | Hiçbir ekranda ele alınmıyor; ardından zaman=0 akmaya devam ediyor | Sonsuz siyah ekran + "Listening…" |
| Klip penceresi dışında kalan altyazı satırları | 1.319 satır (örnek videoların 15'inde ana klipte) | Cümlenin başı/sonu duyulmadan geçiliyor |
| "Sahneyi aç" | Sahnenin başından (ör. 0. sn) başlıyor | Öğrenci kendi cümlesine kadar 107 sn bekliyor |
| `/poc-videos/{id}/clips` | 4–33 sn, 750 KB'a kadar; her açılışta yeniden; 40 sn zaman aşımı | Setteki videolar arası uzun bekleme / hata |
| Hata metinleri | `HTTP 500 at https://…`, "Something went wrong" | Türk kullanıcıya teknik İngilizce |
| `UserProgress` şema değişimi | Yeni alan eklenince decode başarısız → `try?` → boş ilerleme kaydediliyor | Tüm ilerleme sessizce silinir |
| Tekrar/seri günü | Gün GMT'de, aralık yerel takvimde | TR'de doğru bilinen kelime aynı gün tekrar "zamanı gelmiş" sayılıyor; seri gece 03:00'te dönüyor |
| Sekme çubuğu | 7 ekran tek bir `Bool`'u itiyor | Video üstünde sekme çubuğu beliriyor |

## 2. Hedef mimari: tek senkron zinciri

```
YouTube IFrame (WKWebView)
   │  sayfa: klip penceresini kendisi yönetir (kesirli başlangıç/bitiş,
   │  ≤50 ms bitiş kontrolü, döngü, hız/ses kalıcılığı, komut kuyruğu)
   ▼  olaylar: bridge · ready · state · time{t,playing} (~100 ms) · clipEnd · error
YouTubePlayerController  (Swift, komut kuyruğu, yükleme bekçisi)
   ▼  her olay + CACurrentMediaTime damgası
SyncDriver = PlaybackClock (tikler arası interpolasyon, geri sekmeme)
           + KaraokeTimeline (ikili arama; satır/kelime konumu, "yapışkan" vurgu)
   ▼  60 fps hesap, yalnızca konum değişince yayın
Ekranlar: ClipPlayer · Cinema · Kelime Reels · Kalıp Reels · Sahne oynatıcı
```

Saf (Foundation-only) çekirdek `EnglishLearning/Core/` altında; aynı testler hem Linux'ta (`swift test`) hem Xcode'da çalışır.

## 3. Fazlar

| Faz | İş | Durum |
|---|---|---|
| 0 | Test altyapısı: SwiftPM çekirdek, Chromium oyuncu test düzeneği (sahte IFrame API), macOS CI, kayıpsız XcodeGen | ✅ |
| 1 | Her hata için önce kırmızı test (9 oyuncu-sayfası testi + 72 Swift testi) | ✅ |
| 2 | Paralel düzeltmeler (alt ajanlar): oyuncu köprüsü · senkron motoru · kalıcılık/gün sınırı · ağ/klip deposu | ✅ |
| 3 | Ekran entegrasyonu: tüm oynatıcı ekranları yeni çekirdeğe | ✅ |
| 4 | Doğrulama: Linux testleri, oyuncu düzeneği, macOS simülatör derleme+test | ✅ |
| 5 | Ekranların çekişmeli incelemesi (13 doğrulanmış hata) + UX denetimi (100 bulgu → `UX-YOL-HARITASI.md`); her ikisinin kod tarafı düzeltildi | ✅ |
| 5b | İkinci inceleme turu: önceki 15 hatanın hepsinin kapandığı doğrulandı; UX değişikliklerinde 12 yeni hata bulundu (her biri iki şüpheci tarafından onaylandı) ve düzeltildi | ✅ |
| 6 | Gerçek YouTube ile cihaz provası (aşağıdaki kontrol listesi) | ⏳ sizde |

## 4. Bilerek kapsam dışı bırakılanlar (sonraki adımlar)

Bunlar demoyu bozmaz ama yayından önce mutlaka yapılmalı (denetim raporunda ayrıntılı):

1. **Admin/API kimlik doğrulaması** — yazma uç noktaları ve `/api/pipeline` hâlâ herkese açık (kritik güvenlik).
2. `/poc-videos/{id}/clips` yanıtı tüm klipleri döndürüyor; uygulama yalnızca birini kullanıyor → sunucuda `?primary=1` ile ~15× küçültme.
3. YouTube ToS / App Store 5.2.3 pozisyonu, `NSAllowsArbitraryLoads` kaldırma, gizlilik manifesti.
4. Gerçek YouTube ile cihaz testi (bu ortamdan YouTube oynatma engelli — aşağıdaki kontrol listesi).
5. Sunucu hızlandırması (`/poc-videos/{id}/clips` 2,9 sn → 15 ms) kodda hazır ama **`fly deploy` yapılana kadar canlıda yok**. Uygulama bu arada kayıtlı kopya + ön yükleme ile idare eder; ilk açılış yine yavaş olabilir.

## 5. Kanıt: neyin, hangi testle güvence altında olduğu

| Sorun (bölüm 1) | Test(ler) | Sonuç |
|---|---|---|
| Karaoke kelimeleri atlıyor / geride kalıyor | `KaraokeTimelineTests.test_realClips_everyWordLightsUp_andHighlightTracksTheAudio`, `…sparseTicksWithoutInterpolationWouldMissWords`, `PlaybackClockTests` (8) | 5 gerçek klipte 1×, 0,75× ve 0,5× hızda **0 atlanan kelime**; vurgu karelerin %96–99'unda sesle aynı kelimede |
| Atlanan/döngüdeki satırda önceki satırın görünmesi | `test_pinnedLineOwnsItsLeadIn`, `test_loopedLineNeverFlickersToItsNeighbour`, `test_unpinningRestoresPlainTimeline` | ✅ |
| Tam saniyeye yuvarlama, kesilen cümleler | `PlayerProtocolTests.test_loadCarriesFractionalBoundsAndOptions`, `ClipTimingTests.test_playbackWindowPlaysEveryDisplayedLineInFull` | ✅ kesirli sınırlar; her satır baştan sona çalınıyor |
| Sonraki klip yüklenmiyor, komut kaybı, hız sıfırlanması, döngü yok, hatadan sonra akan zaman | Chromium düzeneği `tests/bridge.test.mjs` (9 test, sahte IFrame API) | 9/9 ✅ |
| Siyah ekran / oynatılamayan video | `PlayerProtocolTests.test_errorMessagesAreTurkishAndActionable`, `YouTubePlayerViewTests` (iOS) | ✅ Türkçe hata katmanı + "Tekrar dene" / otomatik atlama |
| Set videoları 4–7 dk, sonda 20–36 sn ölü süre | `test_primaryClipPrefersAShortSceneWithEnoughDialogue`, `test_setWindowTrimsTheSilentHeadAndTail` | ✅ başta ≤3 sn, sonda ≤1,5 sn sessizlik |
| "SPEAKER" yazan yer tutucu konuşmacı | `CurriculumDecodingTests` (3) | ✅ |
| "Sahneyi aç" 0. saniyeden başlıyor | `ScenePlanTests` (6) | ✅ dokunulan cümleden açılıyor |
| Yavaş klip uç noktası | `NetworkingTests` (12), `admin/tests/api-latency.test.ts` (6) | ✅ istemci: tek istek, ön yükleme, kayıtlı kopya hemen; sunucu: 15 ms (deploy bekliyor) |
| "Kelimelerimi gör" eski reel'e / eski kelime sayfasına düşüyor; onboarding seviyesi hiçbir şeyi değiştirmiyor | `FeedOrderTests` (9), `OnboardingLevelTests` (3) | ✅ yeni kelimeye iniyor; "Orta" 1×, diğerleri 0,75× başlıyor |
| Bazı kelimelerde okunuş satırı boş | `OkunusCoverageTests` (videolarda yakalanabilen 98 kelimenin hepsi) | ✅ |
| İlerlemenin sessizce silinmesi | `ProgressPersistenceTests` (8, 1.0.1 sürümünün gerçek verisiyle) | ✅ çözülemeyen veri önce yedekleniyor |
| Gün/seri saat dilimi hatası | `DayBoundaryTests` (7) | ✅ |
| Video üstünde sekme çubuğu | `ImmersivePresenceTests` (2) | ✅ |

**CI** (GitHub Actions, her push'ta): Linux `swift test` · macOS `swift test` · proje dosyası tutarlılığı · iOS simülatörde `xcodebuild test` · Chromium oyuncu düzeneği.

## 6. Demo öncesi cihaz kontrol listesi (gerçek YouTube, ~20 dk)

Bu ortamdan YouTube oynatılamadığı için aşağıdakiler yalnızca gerçek cihazda doğrulanabilir. Demo telefonunda, Türkiye ağından, **iki kez** baştan sona:

**Hazırlık**
- [ ] `fly deploy` yapıldı; `/api/v1/poc-videos/<id>/clips` tarayıcıda 1 sn'nin altında dönüyor.
- [ ] Bölüm A içerik düzeltmeleri (`UX-YOL-HARITASI.md`) canlı veride yapıldı: Set 01 sırası, oynamayan videolar, kalıp havuzu, çeviriler.
- [ ] Otomatik Kilit "Asla"; iPhone (iPad değil); sessiz tuşu **açık**.

**Video sekmesi → Set 01 → "Sete Başla"**
- [ ] İlk video 15 sn içinde başlıyor; başta en fazla ~3 sn altyazısız bölüm var.
- [ ] Karaoke vurgusu duyulan kelimeyle aynı anda ilerliyor (1× ve 0,75×); hiçbir kelime atlanmıyor.
- [ ] Bir satıra dokun → video o satırın başına atlıyor, vurgu o satırdan başlıyor (önceki satır yanıp sönmüyor).
- [ ] Satır döngüsü: aynı satır tekrar tekrar, komşu satıra kaymadan çalıyor.
- [ ] Hız 0,75×'e alındı → sonraki videoda da 0,75× kalıyor; uygulamayı kapatıp açınca da.
- [ ] Amber kelimeye dokun → "Ekle" → kelime Kelimeler sekmesinde en üstte.
- [ ] Video bitince "Sıradaki" ekranı geliyor; başlık "Video 2 / N"; sonraki video hemen başlıyor.
- [ ] Yatay (sinema) moda geç ve çık: kaldığı yerden devam ediyor, karaoke senkron.
- [ ] Ses sessiz tuşu açıkken de geliyor.

**Kelimeler sekmesi**
- [ ] Eklenen kelime → sahne oynatıcı dokunulan cümleden açılıyor.
- [ ] Akış (reels) kaydırılınca her kart 2–3 sn içinde başlıyor; siyah kart yok; dokununca duraklıyor/devam ediyor.

**Kalıplar sekmesi**
- [ ] "I am + sıfat" reels: Türkçe satırlar doğru, uygunsuz sahne yok.
- [ ] Bitir → yola dönüyor, kalıp ✓ işaretli.

**Dayanıklılık**
- [ ] Video oynarken uygulamayı arka plana al, 30 sn sonra dön → "Video yüklenemedi" deyip atlamıyor.
- [ ] Uçak modunda daha önce açılmış bir video → kayıtlı kopyadan açılıyor; açılmamış olan → Türkçe hata + "Tekrar dene".
- [ ] Uygulamayı güncelle/yeniden kur (TestFlight) → ilerleme, seri ve kelimeler duruyor.

Herhangi bir madde başarısız olursa: hangi ekran, hangi video ve ne gördüğünü yazın. Önce onu yeniden üreten bir test yazılır, sonra düzeltilir.
