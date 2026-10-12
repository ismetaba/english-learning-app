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
| 2 | Paralel düzeltmeler (alt ajanlar): oyuncu köprüsü · senkron motoru · kalıcılık/gün sınırı · ağ/klip deposu | ⏳ |
| 3 | Ekran entegrasyonu: tüm oynatıcı ekranları yeni çekirdeğe | ⏳ |
| 4 | Doğrulama: Linux testleri, oyuncu düzeneği, macOS simülatör derleme+test | ⏳ |

## 4. Bilerek kapsam dışı bırakılanlar (sonraki adımlar)

Bunlar demoyu bozmaz ama yayından önce mutlaka yapılmalı (denetim raporunda ayrıntılı):

1. **Admin/API kimlik doğrulaması** — yazma uç noktaları ve `/api/pipeline` hâlâ herkese açık (kritik güvenlik).
2. `/poc-videos/{id}/clips` yanıtı tüm klipleri döndürüyor; uygulama yalnızca birini kullanıyor → sunucuda `?primary=1` ile ~15× küçültme.
3. YouTube ToS / App Store 5.2.3 pozisyonu, `NSAllowsArbitraryLoads` kaldırma, gizlilik manifesti.
4. Gerçek YouTube ile cihaz testi (bu ortamdan YouTube oynatma engelli — aşağıdaki kontrol listesi).
