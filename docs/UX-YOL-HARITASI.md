# Feynman: UX yol haritası (demo odaklı, 12 Ekim 2026)

**Değerlendirme.** Uygulamanın kalbi doğru kurulmuş: film sahnesi, kelime kelime karaoke, her kelimenin altında Türkçe karşılık ve amber kelimeye dokunup "Ekle". Devam eden senkron, hata ekranı ve yükleme işleri bitince oynatıcı sağlam bir zemin olacak. Demoyu bugün asıl bozan şey içerik ve çevredeki ekranlar:
- Set 01, "orta seviye" etiketli ve kurtların bebek yemekten söz ettiği bir Storks sahnesiyle açılıyor.
- Her video en uzun kesimi seçtiği için 4–7 dakika sürüyor ve 20–30 saniye altyazısız bitiyor.
- Kelimeler sekmesi az önce eklenen kelimeye "MASTERED, 7+ sahnede gördün" diyor.
- Profil "0 XP, Level 1" gösteriyor.

Ekranlar ana döngüyü (izle → dokun → ekle → başka sahnede tekrar gör) ne öğretiyor ne de adımları birbirine bağlıyor. Renklerin anlamı oynatıcıda yazmıyor. Tam cümle çevirisi verinin içinde olduğu halde gösterilmiyor. Aşağıdakilerin çoğu küçük (S) uygulama işi artı bir içerik temizliği turu. Ürün kararı gerektirenler en sona bırakıldı. Parantez içindeki numaralar birleştirilen bulgulardır.

---

## Demodan önce (bu iterasyonda yapılacaklar)

> **Durum (12 Ekim 2026):** **B** bölümü uygulandı (yalnızca isteğe bağlı "açık sekmeye tekrar dokununca köke dön" yapılmadı) ve iki kez çekişmeli incelemeden geçti; iOS simülatörde derleniyor ve testleri geçiyor. B17'deki eksik okunuşlar da eklendi. **A** (canlı veride içerik düzeltmeleri) ve **C** (cihazda prova) sizde. Prova için `SENKRON-PLANI.md` bölüm 6'daki kontrol listesini kullanın.

### A. İçerik ve veri: demo engelleyiciler
Bunlar veritabanı ve yönetim tarafında yapılacak işler, kod entegrasyonundan bağımsız. Uygulama içeriği canlı sunucudan okuduğu için bu düzeltmeler doğrudan canlı veride yapılmalı.

1. **Set 01 açılışı (Video sekmesi → Set 01 → "Sete Başla")** _(#93)_
   - **Bugün:** Öğrenci "intermediate" etiketli Storks sahnesine düşüyor. Önce ~12 sn altyazısız kurtlar, sonra "I am gonna bite her arm clean off" ve "babies are dumb" geliyor. Sonda anlamsız satırlar ekranda donup kalıyor. Üçüncü video, "ratatouille-thank-you" adıyla kayıtlı, hızlı kurgulu bir Barbie fragmanı.
   - **Değişiklik:** `video_set_items.sort_order` ile seti Frozen (Olaf'la tanışma) → Coco → … sırasına al. Storks ve Barbie'yi sona ya da Set 02'ye taşı. Barbie kaydının adını ve türünü düzelt. Kart ve set sayfası mozaiği ilk 4 küçük resmi kullandığı için onlar da kendiliğinden düzelir.
   - **Neden:** "BAŞLANGIÇ" etiketli setin ilk dakikası ürünün vaadini çürütüyor.

2. **Oynamayan videolar (Set 01 #19 ve #29, reels havuzu)** _(#89, #87)_
   - **Bugün:** "Part of Your World" ve "MICHAEL" videoları gömülü oynatıcıda açılmıyor. Mevcut oEmbed kontrolü bunları "oynar" sayıyor. Set 02'de 0 klipli bir ".mp4" kaydı listede duruyor.
   - **Değişiklik:**
     - Bu kimlikleri setlerden ve reels havuzundan çıkar.
     - Set sorgusuna "klip sayısı > 0" şartı ekle.
     - Demo yolunu demo telefonuyla, Türkiye ağından iki kez baştan sona oynat.
   - **Neden:** Aksi halde demonun ortasında uyarı üçgeni ve otomatik atlama çıkıyor.

3. **Kalıp reels havuzu: "I am + sıfat" (Kalıplar → Video akışı)** _(#95)_
   - **Bugün:** 234 kartlık rastgele havuzda şunlar var:
     - Euphoria'dan "I don't give a shit who's fucking who", altında "bok" karşılığıyla,
     - "I'm drunk", "I am pregnant",
     - R-18 filmler ve boş ya da "AT", "MA" gibi film başlıkları.
     Kartların üçte biri "I'm sorry".
   - **Değişiklik:**
     - Sıfat listesinden drunk, pregnant, stupid, ugly vb. kelimeleri çıkar.
     - Cümle metnine küfür filtresi koy.
     - "sorry" oranını ~%15 ile sınırla.
     - Başa doğrulanmış 7 temiz sahne koy: I am ready / wonderful / good / bad / new / calm / so excited.
     - Bozuk film başlıklarını düzelt.
   - **Neden:** Kalıp bölümünün doruk noktası şu an rastgele ve riskli.

4. **Yanlış Türkçe cümle çevirileri (kalıp reels kartı, ileride oynatıcı)** _(#96)_
   - **Bugün:** Kalıp reels kartındaki en büyük amber satır çeviridir ve yanlışlar var:
     - "I'm proud of you" → "Seni gururlandırıyorum"
     - "I am strong" → "Ben güçlüydüm"
     Storks verisinde "Look at you, dude" → "Bak şimdi, göt" olarak duruyor.
   - **Değişiklik:** Raporda listelenen satırları elle düzelt ve "(Literally: …)" eklerini temizle. Demo kalıbı için gözden geçirilmiş satır listesi kullan. Oynatıcıya cümle çevirisi eklenmeden önce (B5) demo yolundaki videoların çevirileri gözden geçirilmeli.
   - **Neden:** Öğrenci önce Türkçeyi okuyor. Yanlış çeviri, yanlış öğretir.

5. **Kelime altı karşılıklar (oynatıcı)** _(#98, #24, #7)_
   - **Bugün:**
     - Frozen'da "All right" altında "tüm doğru", "Come on" altında "gelmek üzerinde", "You are welcome" altında "sen -sın hoş geldin" yazıyor.
     - "we/they are" altında "-sın" çıkıyor.
     - "like" kelimesine dokununca kart "beğenmek / sevmek" diyor, altındaki karşılık "gibi". Çoğu kullanımda doğru olan da "gibi".
   - **Değişiklik:** Sunucu tarafında yapılır, uygulamayı yeniden derlemek gerekmez.
     - Klip yanıtında, reels'te zaten çalışan ifade algılamayı kullan. İfade çevirisini ilk kelimeye yaz.
     - Şu durumlar için bağlam kuralları ekle: we/they + are, there + is, soru başındaki do/did, cümle başındaki "Well".
     - Eksik ifadeleri ekle: all right, thank you, you are welcome.
     - "like" etiketini yalnızca fiil kullanımlarında bırak.
   - **Neden:** Kelime altındaki Türkçe, başlangıç düzeyindeki öğrencinin can simidi.

6. **Başlıklar ve yapı renkleri (set listesi, oynatıcı)** _(#92, #99, #94)_
   - **Bugün:** Set satırlarında "SHARK TALE CLIP", "ENDING", "- CinemaFilmClips" gibi başlıklar var. İlk üç videonun ~%9 satırında isimler yeşil (fiil rengi), "just", "Some", "my" mavi (özne rengi).
   - **Değişiklik:** Demo setinin `movie_title` alanlarını gerçek film adlarıyla düzelt. İlk 3–5 videonun yapı etiketlerini elle kontrol et.
   - **Not:** Önce kural, sonra veri. B1'deki yeni klip seçme kuralı hangi klibi seçiyorsa, düzeltmeler o klibin satırlarında yapılmalı.
   - **Neden:** "Küratörlü set" hikâyesini ve 3 renk kodunun güvenilirliğini korur.

### B. Uygulama (kod): devam eden entegrasyonla birlikte

1. **Set oynatıcı: ölü süre** _(#94, #88)_
   - **Bugün:** Her video, aynı satır sayısındaki kesimlerin en uzununu seçiyor. Storks 0.75× hızda 4,5 dk sürüyor. Girişte ~16 sn "Sahne başlıyor…" yazıyor, sonda son altyazı ~36 sn donuk kalıyor. Bazı videolarda YouTube'un kendi bitiş ekranı görünüyor.
   - **Değişiklik:** Eşitlikte en kısa kesimi seç, varsa ≤150 sn'lik kesimi tercih et. Set oynatıcıda pencereyi son satırdan 1,5 sn sonra kes, ilk satırdan en fazla 3 sn önce başlat.
   - **Neden:** "Kısa sahne" vaadi gerçek olur ve demo beklemeden akar.

2. **Set ilerlemesi (oynatıcı başlığı, "Sıradaki" ekranı)** _(#52, #5, #20, #64)_
   - **Bugün:** Başlık her videoda "Sahne 1 / 1" diyor. Set 02'de (100 video) "Sıradaki" ekranının nokta satırı ekrandan taşıyor ve içeriği sola itiyor.
   - **Değişiklik:** Başlıkta "Video 3 / 30" yazsın. Noktaların yerine genişliği video sayısına bağlı olmayan tek bir ilerleme çubuğu koy.
   - **Neden:** Öğrenci setin neresinde olduğunu izlerken görür. İkinci setteki görünür yerleşim hatası da kapanır.

3. **"SPEAKER" etiketi (oynatıcı)** _(#97)_
   - **Bugün:** Her vurgulu satırın üstünde mor, İngilizce "SPEAKER" yazıyor. Bu, veritabanındaki tüm satırların varsayılan değeri.
   - **Değişiklik:** Uygulama "Speaker" değerini boş saysın.
   - **Neden:** Hata ayıklama çıktısı gibi duruyor.

4. **Ana hareketi öğretmek (oynatıcı)** _(#1, #13, #14, #46, #74)_
   - **Bugün:** Renklerin anlamı yalnızca Kalıplar sekmesinde yazıyor. Amber çizgi yalnızca o an çalan satırda, ~2–3 sn görünüyor. Hiçbir şey "dokun" demiyor.
   - **Değişiklik:**
     - Transkriptin üstüne küçük bir "özne · fiil · tamamlayıcı" anahtarı ekle.
     - Önceki ve sonraki satırlarda da hedef kelimelerin altını amber çiz.
     - İlk amber kelimede videoyu bir kez durdur ve şu ipucunu göster: "Altı çizili kelimeye dokun → anlamını gör, Ekle ile kelimelerine kat".
   - **Neden:** Demoyu izleyen biri, sunucu açıklamadan döngüyü anlar.

5. **Tam cümle çevirisi (oynatıcı)** _(#12, #7)_
   - **Bugün:** Verideki satırların ~%94'ünün Türkçe çevirisi var ama oynatıcı göstermiyor. Kelime kelime karşılıklar ("there is" → "orada -dir") çoğu zaman tek başına anlamsız.
   - **Değişiklik:**
     - Aktif satırın altına tek satır Türkçe çeviri ekle. Kapatmak için bir "Çeviri" çipi olsun.
     - Kelime kartına "Bu cümlede: …" satırı ekle.
     - Geçmiş satırların altında çeviri soluk görünsün.
     - Bunu, A4'teki çeviri düzeltmesinden sonra aç.
   - **Neden:** Öğrencinin sahneyi "anladım" demesini sağlayan şey bu.

6. **Kelime kartı: "Ekle" anı** _(#18, #3, #33, #63)_
   - **Bugün:**
     - "Ekle" gri ikincil buton, "Devam" mor ana buton.
     - Ekleyince yalnızca etiket "Eklendi" oluyor.
     - Havuzdaki kelimeye bile "YENİ KELİME" deniyor.
     - Havuzdaki kelime yeniden karşısına çıktığında yenisinden farkı yok.
   - **Değişiklik:**
     - Kelime eklenmemişken "Ekle" dolu, amber ana buton olsun.
     - Ekleyince altında "“look” kelimelerine eklendi" yazsın.
     - Havuzdaki kelimede başlık "KELİMELERİNDE ✓" olsun.
     - Karaokede havuzdaki kelimelerin arkasına yumuşak bir amber zemin koy.
   - **Neden:** Ürünün "yine karşıma çıktı, tanıdım" anı görünür olur.

7. **Kelimeler sekmesi: sahte ilerleme** _(#2, #23, #59, #29)_
   - **Bugün:** Noktalar, "MASTERED" ve "7+ sahnede gördün" metni öğrencinin değil, tüm film arşivinin sayısına dayanıyor. 100 kelimenin 80'i eklendiği anda "MASTERED" görünüyor.
   - **Değişiklik:**
     - Bu sayıyı ilerleme olarak değil, bilgi olarak göster: "N sahnede geçiyor".
     - MASTERED rozetini, noktaları, Yeni/Yakın/Mastered filtrelerini ve özet sayıları gerçek veri gelene kadar kaldır.
     - Detay sayfası başlığını "BU KELİMENİN GEÇTİĞİ SAHNELER" yap.
   - **Neden:** Oyunlaştırmasız bir üründe tek ilerleme sinyali yalan söylememeli.

8. **Döngüyü bağlamak (video arası ekran, set sonu, boş Kelimeler)** _(#4, #8, #49, #26, #62, #28)_
   - **Bugün:**
     - Video arası ekranda "ne yakaladın" bilgisi yok.
     - "SET TAMAMLANDI" ekranı öğrencinin eklediklerini değil, setin toplam kelime sayısını (93) gösteriyor ve yalnızca "Sete dön" diyor.
     - Boş Kelimeler sekmesi "Bir set izleyince akış dolacak" yazıyor ama buton sunmuyor.
     - Akış'ın ilk kartı rastgele bir kelime.
   - **Değişiklik:**
     - Sekme seçimini uygulama durumuna taşı, böylece ekranlar başka sekmeye yönlendirebilsin.
     - Video arası ekrana "Bu videoda yakaladıkların" çiplerini ekle.
     - Set sonunda eklenen kelime sayısını ve "Kelimelerimi gör" butonunu göster.
     - Boş Kelimeler ekranına "Bir set aç" butonu koy. Havuz boşken ağ çağrısı yapma.
     - Akış'ta en son eklenen kelime ilk kartta çıksın.
   - **Neden:** "İzle → ekle → başka sahnede gör" hikâyesi demo sırasında kendiliğinden anlatılır.

9. **Sekme değişince her şeyin sıfırlanması** _(#47, #57, #31)_
   - **Bugün:** Her sekme geçişinde ekran baştan kuruluyor:
     - set listesi yeniden yükleniyor,
     - açık olan set kayboluyor,
     - kelime akışı karışıp başka bir kartla açılıyor,
     - Liste seçimi Akış'a geri dönüyor.
   - **Değişiklik:** Sekme kökleri canlı kalsın. Akış/Liste seçimi hatırlansın.
   - **Neden:** Sunucu Video → Kelimeler → Video yaptığında uygulama "yeniden başlıyor" izlenimi vermez.

10. **Profil** _(#10, #48, #60, #50)_
    - **Bugün:** "Beginner · Level 1 · 0 XP · 50 XP to reach Level 2", "Clips 0", "Yapı 0", düz bir haftalık grafik ve altı dilli dil seçici var. Metinlerin çoğu İngilizce.
    - **Değişiklik:**
      - XP, seviye, kupa, grafik ve dil seçiciyi kaldır.
      - Yerlerine Türkçe dört sayaç koy: İzlenen video, Eklenen kelime, Tamamlanan kalıp, Gün üst üste. Rozet ya da ödül dili kullanma.
      - Sürüm numarasını uygulama paketinden oku.
    - **Neden:** Bugün izledikleri hiçbir şey sayılmamış gibi görünüyor. XP de ürün felsefesine aykırı.

11. **İlk açılış (onboarding)** _(#6, #46, #50, #58)_
    - **Bugün:** 4 adım var. Türkçe başlıkların altında "Tell us where to start", "Hardcore", "10 min / day" yazıyor. "We'll tailor your plan" deniyor ama cevapların hiçbiri hiçbir yerde kullanılmıyor. İlk ekranda 6 dil bayrağı var.
    - **Değişiklik:** Dil, hedef ve dakika adımlarını kaldır. Seviye adımını Türkçe ve "sen" diliyle yaz ("Nereden başlayalım?"). Ana dili Türkçeye sabitle.
    - **Neden:** Temiz kurulumla yapılan bir demonun ilk 30 saniyesi bu ekranlar.

12. **Türkçe büyük harf ve İngilizce kalıntılar (tüm ekranlar)** _(#11, #37, #61, #70, #53, #45, #67)_
    - **Bugün:** "SIRADAKI", "VIDEOLAR", "KELIME", "FIIL", "GENIŞ ZAMAN", "BITIR" gibi noktasız İ'ler, İngilizce "Mastered" ve her alt ekranda İngilizce "< Back" var.
    - **Değişiklik:**
      - Türkçe metinleri Türkçe kurallarla büyük harfe çevir. Sabit metinleri doğrudan doğru yaz.
      - Geri butonunda yalnızca ok kalsın.
      - Küçük metin düzeltmeleri: "Akışa başla", "Baştan başla", "İPUCU". Hata ekranlarında iki kez geçen "Tekrar dene"nin birini kaldır.
    - **Neden:** Türk izleyici noktasız İ'yi anında fark ediyor. Uygulama yarım çevrilmiş gibi duruyor.

13. **Kalıplar akışı** _(#34, #35, #54, #43, #41, #56, #77)_
    - **Bugün:**
      - Video akışından geri dönünce aynı "Video akışını aç" kartına dönülüyor, oysa altındaki yazı "bitir adımına geçeceksin" diyor.
      - "Bitir", öğrenciyi değişmemiş giriş ekranına ("Akış'a başla") bırakıyor.
      - Formül satırı ortalanmış cümlenin altında sola yaslı.
      - Videosu olmayan kalıplarda "YAKINDA" kartı çıkıyor.
      - Reels kartlarının altında ~140 pt boş alan var.
    - **Değişiklik:**
      - Dönüşte bitiş kartına geç.
      - "Bitir" doğrudan kalıp yoluna dönsün ve yeni ✓ işareti görünsün.
      - Formülü ortala.
      - Videosuz kalıplarda video kartını hiç gösterme.
      - Reels'teki alt boşluğu kaldır.
    - **Neden:** Kalıp bölümünün kapanış anı bugün bir döngü ya da hata gibi görünüyor.

14. **Ses ve ekran** _(#80, #81)_
    - **Bugün:** Uygulama ses ayarı yapmadığı için telefon sessizdeyken videolar büyük olasılıkla sessiz oynuyor; cihazda doğrulanmalı. Kelime kartı açıkken (video durmuşken) ekran ~30 sn'de kararıp kilitleniyor.
    - **Değişiklik:** Açılışta oynatma ses ayarını yap; müziği açılışta kesmesin. Oynatıcı ve akış ekranlarındayken ekranın kapanmasını engelle.
    - **Neden:** Karaoke ilerlerken ses yoksa demo bozuk görünür. Sunucu konuşurken ekran kilitlenmemeli.

15. **Duraklatma durumu ve hız (reels, sinema modu)** _(#83, #65, #15, #19, #30)_
    - **Bugün:**
      - iOS reels'te ya da sinema modunda videoyu durdurunca hiçbir ▶ görünmüyor; ilk dokunuş hiçbir şey yapmıyor gibi.
      - Sinema modu hızı 1×'e çıkarıyor.
      - Hız çipine ilk dokunuş videoyu hızlandırıyor.
      - Her yeni videoda hız 0.75×'e dönüyor.
    - **Değişiklik:**
      - ▶ göstergesi oynatıcının gerçek durumundan gelsin. Sinemada ortaya ▶ koy; kontroller yalnızca video oynarken gizlensin.
      - Tek bir paylaşılan hız ayarı olsun (varsayılan 0.75×), portre, sinema ve reels'te geçerli.
      - Çip yerine "Hız" menüsü: 0.5× Yavaş / 0.75× Rahat / 1× Normal.
    - **Neden:** Donmuş görüntü "uygulama kilitlendi" izlenimi veriyor.

16. **Okunabilirlik ve dokunma (oynatıcı, butonlar)** _(#17, #68, #69, #78, #72, #22, #21)_
    - **Bugün:**
      - Türkçe karşılık 10 pt, gri, italik ve gelecek kelimelerde %55 soluk. Reels ve sinemada iki kez soluklaştırıldığı için ~%30.
      - Ana butonlarda parlak turkuaz üstünde beyaz yazı var.
      - Kontrol çipleri ~27 pt. Çiplerin arasına yapılan dokunuş arkadaki görünmez transkript satırına gidiyor ve videoyu başka cümleye atlatıyor.
      - Aktif satır en üste yapışıyor, bir önceki satır görünmüyor.
    - **Değişiklik:**
      - Karşılıklar 12 pt, düz yazı olsun; çift soluklaştırmayı kaldır.
      - Turkuaz zeminlerde koyu yazı kullan.
      - Kontrol alanı dokunuşları yutsun; dokunma alanları 44 pt olsun.
      - Transkript bir önceki satırı göstersin; öğrenci kaydırırken otomatik takibi bıraksın.
    - **Neden:** Projeksiyonda ya da gün ışığında okunabilirlik, ve "dokundum, başka yere atladı" hatası.

17. **Diğer küçük düzeltmeler**
    - Kelime sahnesi bitince ekranın kendiliğinden kapanmasını durdur. _(#16)_
    - Kelime kartı, reel ve kelime detayında okunuş satırı göster (ör. "ay em hepi"). _(#27)_
    - Set kartı mozaiklerindeki siyah bantları kırp. _(#91)_
    - 15 sn'lik yükleme bekçisi, arka plandan dönüşte ya da yavaş başlayan bir videoda "Video yüklenemedi" deyip iyi videoyu atlamasın. _(#87, #84)_
    - Ülke ya da telif engelinde "videonun sahibi izin vermiyor" yerine gerçek nedeni söyle. _(#89)_

### C. Demo provası (kod gerektirmez)
- Demoyu iPad'de değil iPhone'da yap. Bir gruba göstereceksen AirPlay ya da QuickTime ile yansıt. _(#79)_
- Sessiz tuşu açıkken bir set klibi, bir kelime reeli ve bir kalıp reeli oynat. Ses yoksa B14 engelleyicidir. _(#80)_
- Otomatik Kilit ayarını "Asla" yap. _(#81)_
- Demo yolunu Türkiye ağından iki kez oynat. Reklam çıkan ya da 15 sn içinde başlamayan videoyu demo setinden çıkar. _(#87, #89)_
- Demoya temiz kurulumla mı, onboarding'i geçilmiş cihazla mı başlanacağına karar ver. _(#58)_
- Provada dört "BE" kalıbının hepsini bitirme; bitirirsen videosuz kalıplar açılır. _(#41)_

---

## Kısa vadede (1–2 hafta)

1. **Kelimeler: gerçek ilerleme** _(#2, #23, #59)_
   - **Bugün:** B7'den sonra ilerleme göstergesi tamamen kalkmış olacak.
   - **Değişiklik:** Kelime başına, öğrencinin gördüğü farklı satırları cihazda kaydet: karaoke satırı bitince, bir reel turu tamamlanınca, bir sahne açılınca. Noktalar, filtreler ve detaydaki "GÖRDÜĞÜN SAHNELER / YENİ SAHNELER" ayrımı bu sayıdan beslensin. Liste ve Akış aynı sayıyı göstersin.
   - **Neden:** "Kelimeyi 7 farklı bağlamda görmek" fikri ürünün çekirdeği; ancak gerçek veriyle anlam kazanır.

2. **Oynatıcıda ifade hücreleri** _(#98, #7, #24)_
   - **Bugün:** A5'teki sunucu yaması kelime kelime çalışıyor.
   - **Değişiklik:** Reels'te kullanılan birleşik ifade hücrelerini (ör. "come on" → "haydi") portre ve sinema oynatıcıya getir. Sonraki adım: her geçiş için bağlama uygun anlam.
   - **Neden:** Çok kelimeli ifadeler tek anlam olarak okunur.

3. **Yapı etiketlerini yeniden üretmek** _(#99)_
   - **Değişiklik:** Özneyi alt ağacıyla al ("my heels", "Some things"). Fiil = yardımcı fiil + çekimli fiil. Her yan cümleyi etiketle. Hatalı etiketleri işaretleyen bir doğrulama adımı ekle. Tüm demo setlerine uygula.
   - **Neden:** 3 renk kodu ürünün imzası; yanlış renk, yanlış dilbilgisi öğretir.

4. **Sinema modunda hedef kelimeler** _(#9, #15, #73)_
   - **Bugün:** Yatay modda amber kelimeler yok ve kelime yakalanamıyor.
   - **Değişiklik:** Amber alt çizgi ekle. Dokununca ortak bir kelime kartı açılsın. Videolar arasında kısa bir "Sıradaki" bilgisi göster.
   - **Neden:** Sinema modu vitrin ekranı; çekirdek mekaniğin orada da çalışması gerekir.

5. **Kelime detay sayfası** _(#29)_
   - **Bugün:** "know" için 274 İngilizce cümle listeleniyor, hiç Türkçe yok.
   - **Değişiklik:** Bağlam kartlarında kelime altı Türkçeyi göster (veri zaten geliyor). İlk 8 kartı göster, altına "Tümünü göster" koy. Buton metni "Sahneyi izle" olsun.
   - **Neden:** Sayfa şu an ham veritabanı dökümü gibi okunuyor.

6. **Kelime çıkarma** _(#25)_
   - **Bugün:** Reels'teki kalp her kartta "Eklendi" yazıyor ve dokununca bir şey olmuyor. Hiçbir yerde kelime çıkarılamıyor.
   - **Değişiklik:** Kalbi gerçek bir aç/kapa yap ve "Geri al" seçeneği ver. Kelime detayına "Kelimelerimden çıkar" ekle.
   - **Neden:** Yanlışlıkla eklenen kelime sonsuza dek havuzda kalıyor.

7. **Kalıp reels'te öğretim** _(#38, #39, #40)_
   - **Değişiklik:**
     - Sıfatın geldiği yeri vurgula.
     - İngilizce cümle önce, Türkçe altta ve daha küçük olsun.
     - "I'm" için okunuş sesle eşleşsin: "ay em" değil "aym".
     - Okunuş ve Türkçe satırları hizalansın.
     - Videosuz 9 kalıbın örnek kartlarına da okunuş verisi ekle.
   - **Neden:** Öğrenci uzun film cümlesinde az önce çalıştığı kalıbı bulabilmeli.

8. **Kalıp formülleri** _(#36)_
   - **Değişiklik:** Formül çipleri İngilizce olsun ("I · am · sıfat"), Türkçe ek küçük harfle altında dursun. "want to" kalıplarında lavanta renkli "fiil" çipiyle renk anahtarı arasındaki çelişkiyi gider. Giriş ekranına renkli bir örnek cümle ekle.
   - **Neden:** Renk anahtarı ile formül aynı şeyi söylemeli.

9. **Kilitli kalıp düğümleri** _(#44)_
   - **Bugün:** Kilitli düğüme dokununca hiçbir şey olmuyor.
   - **Değişiklik:** Dokununca "Önce X kalıbını bitir" yazsın. Yolda kalıp ailesi başlıkları göster.
   - **Neden:** Öğrenci nedenini ve nasıl açılacağını bilmeli.

10. **Kilit, uygulama değiştirme, arama** _(#82, #84, #85, #86)_
    - **Değişiklik:**
      - Telefon kilitlenince, uygulama değişince ya da arama gelince videoyu durdur; dönüşte satırın başına sar ve "Kaldığın yerden devam et" de.
      - Kulaklık çıkınca durdur.
      - Öğrenci müzik dinlerken Akış sessiz başlasın.
      - Oynatıcı yeniden kurulduğunda tekrar (döngü) ayarı korunsun.
    - **Neden:** Dönüşte cümlenin ortasından başlayan video rastgele görünüyor.

11. **Erişilebilirlik** _(#71, #75, #76, #78, #74)_
    - **Değişiklik:**
      - Amber kelimeler VoiceOver'da buton olarak okunsun; ikon butonlarına Türkçe etiketler ver.
      - "Hareketi Azalt" ayarına uy.
      - VoiceOver açıkken otomatik geri sayımları durdur.
      - Tema yazı tiplerini sistem yazı boyutu ayarına (Dynamic Type) bağla.
      - Renk körlüğüne uygun özne/tamamlayıcı ayrımı yap.
    - **Neden:** Görme ya da hareket hassasiyeti olan öğrenci bugün çekirdek döngüyü kullanamıyor.

12. **Oynanabilirlik denetimi** _(#89)_
    - **Değişiklik:** Türkiye çıkışlı, her gece çalışan bir oynanabilirlik betiği yaz; sonucu üç içerik rotasında filtre olarak kullan.
    - **Neden:** Oynamayan videolar bugün ancak öğrenci karşılaşınca fark ediliyor.

13. **Reklam ve yavaş başlangıç** _(#87, #90)_
    - **Değişiklik:** Cihaz provasında reklam görülürse:
      - "Reklam, sahne birazdan başlıyor" durumu ekle,
      - reklamın atla butonu dokunulabilir olsun (YouTube politikası).
      Ayrıca YouTube arayüz dilini Türkçe yap, YouTube'un kendi altyazılarını kapat, portre oynatıcıda yükleme posteri göster.
    - **Neden:** Reklam ya da yavaş başlangıç bugün "bağlantını kontrol et" hatasına dönüşüp videoyu atlatıyor.

14. **Set listesi** _(#5, #91, #51)_
    - **Değişiklik:** Set kartında tahmini süre göster ("~N dk"). Video listesini tembel yükle. Küçük resimleri bellekte önbelleğe al. Yarım kalan videoyu kaldığı saniyeden aç.
    - **Neden:** Öğrenci bir setin ne kadar süreceğini ve nerede kaldığını görmeli.

15. **Hata durumları** _(#32, #66)_
    - **Değişiklik:** Liste modunda yükleme hatası için mesaj ve "Tekrar dene" göster. Yenileme başarısız olursa "son liste gösteriliyor" bandı göster. Set listesi boşsa ayrı bir boş durum ekranı göster.
    - **Neden:** Sessiz hata, öğrenciye kelimeleri kaybolmuş gibi görünüyor.

16. **Karaokede çok kısa kelimeler** _(#100)_
    - **Değişiklik:** "I am" gibi çok kısa kelimeleri tek bir vurgu aralığında birleştir.
    - **Neden:** Vurgu bugün özneyi ve fiili atlıyormuş gibi görünüyor.

---

## Sonra (ürün kararı gerektirenler)

1. **Uzun setler** _(#5)_
   - **Bugün:** 100 videolu Set 02 bitirilemiyor; iki başlangıç seti birbirinden ayırt edilemiyor.
   - **Karar:** Setler 5 videoluk "Bölüm"lere mi ayrılsın, yoksa setler mi kısaltılsın? Set 1'e "Buradan başla" işareti konsun mu?
   - **Neden:** Oyunlaştırmasız bir üründe asıl motivasyon "bugün bir şey bitirdim" duygusu.

2. **Tekrar planı** _(#28)_
   - **Bugün:** Aralıklı tekrar kodu var ama hiçbir ekrandan ulaşılamıyor.
   - **Karar:** "Bugün tekrar: N kelime → Akışta izle" gibi tarafsız bir yönlendirme ne kadar ısrarcı olmalı?

3. **Keşif kartları** _(#25, #26, #62)_
   - **Karar:** Havuz küçükken Akış'ta havuz dışı kelimeler ("KEŞFET") gösterilsin mi? Bu kapatma bilinçli yapılmıştı.

4. **Onboarding'in rolü** _(#6, #46, #58)_
   - **Karar:** Mekaniği öğreten 1–2 ekran ve bittikten sonra ilk videonun kendiliğinden açılması isteniyor mu? Seviye sorusu açılacak seti mi belirlesin, yoksa kaldırılsın mı?

5. **Sekme sırası ve adı** _(#55)_
   - **Bugün:** Kalıplar bilinçli bir kararla ilk sekmede, ama uygulama ikinci sekmede açılıyor.
   - **Karar:** "İzle · Kalıplar · Kelimeler · Ben" sırasına geçilsin mi? Sahibine sorulmalı.

6. **Örnek kartlarına ses** _(#42)_
   - **Karar:** Cihazın sesli okumasıyla bir "Dinle" butonu mu, yoksa her örneğe gerçek bir film satırı mı?

7. **Ürün adı** _(#6, #67)_
   - **Bugün:** Ana ekranda "English Learning" yazıyor.
   - **Karar:** "Feynman" adı kullanılacak mı?

8. **Çok dil ve iPad** _(#50, #79)_
   - **Karar:** Dil seçici kaldırıldı. Başka diller gelecekse gerçek yerelleştirme gerekir. iPad desteği hedef mi?

9. **Profil'de zaman** _(#10)_
   - **Karar:** Haftalık izleme süresi gösterilsin mi, gösterilecekse nasıl ölçülsün?

10. **Anlam bazlı kelime etiketleme** _(#24)_
    - **Karar:** like, look, mean gibi çok anlamlı kelimeler yalnızca öğretilen anlamda mı etiketlensin? Bunun için her geçişe bir anlam alanı ve yönetim panelinde "bu geçişi etiketten çıkar" seçeneği gerekir.
