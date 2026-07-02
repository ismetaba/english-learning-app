# Uygulama Denetim Raporu ve Profesyonelleştirme Tasarımı

**Tarih:** 2026-07-02 · **Kapsam:** ios-native (aktif ürün), legacy Expo/RN, admin/backend (Fly.io), veri pipeline'ı, repo sağlığı, ürün/UX

**Yöntem:** 6 paralel derin denetim ajanı → kritik/yüksek bulgular bağımsız adversarial doğrulayıcılardan geçirildi (hiçbir bulgu çürütülemedi) → 2 tasarım ajanı hedef mimariyi çıkardı. Toplam 105 bulgu.

---

## Bölüm 1 — Bulgular (alan alan)

## iOS Mimarisi (App / State / Services / Models)

**Genel durum:** ios-native/EnglishLearning'in App/State/Services/Models katmanları POC için düzenli yazılmış: @MainActor ViewModel'ler, actor tabanlı APIClient/CacheService, typed hata enum'u ve TTL'li disk cache var; kod yorumları olağanüstü iyi. Buna karşılık üretim kalitesi açısından ciddi boşluklar mevcut: UserProgress persistence'ı şema değişikliğinde sessizce tüm kullanıcı verisini silecek şekilde kurgulanmış, ATS (App Transport Security) Info.plist'te tamamen kapatılmış, spaced-repetition ve streak tarih hesapları timezone/locale hatalarıyla dolu (UTC+3 Türk kullanıcıda interval fiilen 1 gün kısalıyor), API'de auth ve environment ayrımı yok, hiçbir loglama/crash-reporting yok ve kritik iş mantığının (SR algoritması, cache, AppState) tek bir unit testi yok. Bulguların tamamı dosya:satır kanıtına ve çalıştırılan doğrulama scriptlerine dayanıyor.

**Korunması gereken güçlü yanlar:**
- Actor tabanlı APIClient ve CacheService — network/disk katmanı doğal olarak thread-safe (APIClient.swift:20, CacheService.swift:4)
- Tüm ViewModel'ler ve AppState @MainActor ile işaretli; SwiftUI state mutasyonları doğru izolasyonda (AppState.swift:5, Features genelinde @MainActor final class ...ViewModel)
- Typed APIError enum'u (invalidURL/http/decoding/transport) ve 4xx'te retry'ı kesen bilinçli retry politikası — hata sınıflandırması düşünülmüş (APIClient.swift:3-17, 183)
- TTL'li Envelope tabanlı disk cache tasarımı temiz; decode hatasında kendini onarıyor (CacheService.swift:26-45)
- LessonSection tagged-union Codable implementasyonu (type discriminator + singleValueContainer) doğru ve genişletilebilir (Curriculum.swift:63-105)
- ClipWord/ClipLine'da decodeIfPresent ile geriye-uyumlu optional stratejisi ve alan bazında ne-neden-nullable açıklamaları (Curriculum.swift:249-302)
- Kod yorumu kalitesi olağanüstü: neredeyse her tasarım kararının gerekçesi yerinde yazılı (ör. CurriculumRepository'de neden cache'lenmediği tek tek açıklanmış)
- Gerçek bir production crash'inden (duplicate dictionary keys) regresyon testi çıkarılmış — TurkishPhoneticsTests bilinçli olarak 'tabloyu erken evaluate et' stratejisi kullanıyor
- YouTube embed error-152 fix'i hem unit hem canlı entegrasyon testiyle karakterize edilmiş — bug-önce-test disiplini CLAUDE.md talimatıyla uyumlu
- completedPatterns'ı ayrı UserDefaults key'inde tutma kararı (mevcut decoder'ı kırmamak için) — kök sorunu çözmese de veri kaybı riskinin farkında olunduğunu gösteren pragmatik önlem (AppState.swift:20-25)

### 🔴 CRITICAL · UserProgress şema evrimi = sessiz ve kalıcı tam veri kaybı — ✅ bağımsız doğrulandı

AppState, UserProgress'i UserDefaults'ta tek JSON blob olarak saklıyor ve `try? decoder.decode(...)` ile okuyor; decode başarısız olursa hata yutulur ve progress varsayılan (boş) değere döner. Swift'in synthesize ettiği Codable decoder, struct alanlarının default değeri olsa bile eksik key'de throw eder — doğruladım: eski blob'a yeni non-optional alan eklenince decode nil dönüyor. Yani UserProgress'e eklenecek ilk yeni alan, mevcut tüm kullanıcıların XP/streak/lesson ilerlemesini sıfırlar; ilk mutasyonda boş state eski blob'un üzerine yazılır ve geri dönüş kalmaz. Ekip riskin farkında: completedPatterns bilerek ayrı key'e konmuş (AppState.swift:20-22 'adding it doesn't risk breaking the UserProgress Codable decoder' yorumu) — bu bir migration stratejisi değil, semptom yönetimi.

**Kanıt:** AppState.swift:55-57 `try? decoder.decode(UserProgress.self, from: data)`; AppState.swift:20-22 itiraf yorumu; Progress.swift:139-158 tamamı non-optional alanlar; doğrulama scripti çıktısı: 'decode old blob with new non-optional field -> FAILS (nil) -> silent full reset'

**Dosyalar:** `ios-native/EnglishLearning/State/AppState.swift:55`, `ios-native/EnglishLearning/Models/Progress.swift:139`

**Öneri:** UserProgress'e custom `init(from:)` yazıp her alanı `decodeIfPresent ?? default` ile oku (veya @DefaultCodable tarzı property wrapper kullan). Blob'a `schemaVersion` alanı ekle ve versiyonlu migration fonksiyonu kur. Decode başarısız olursa mevcut ham blob'u `user_progress_v2_backup` gibi bir key'e kopyalayıp üzerine yazmadan önce koru; decode hatasını logla.

<details><summary>Doğrulayıcı notu</summary>

Bulgu birebir doğrulandı, abartı yok. Kanıtlar: (1) AppState.swift:55-57 — `try? decoder.decode(UserProgress.self, from: data)` decode hatasını yutuyor, progress varsayılan boş değerde kalıyor. (2) Progress.swift:139-158 — UserProgress'in synthesized Codable'ı var (repo genelinde custom `init(from:)` sadece Curriculum.swift'te; UserProgress için CodingKeys/decodeIfPresent yok); 17 alandan 16'sı non-optional (yalnız dailyTasks Optional — bulgudaki 'tamamı non-optional' ifadesi bu tek alan için hafif imprecise ama riski değiştirmiyor, çünkü sorun EKLENECEK yeni non-optional alan). (3) Davranışı bağımsız Swift scriptiyle yeniden ürettim: eski blob + yeni non-optional alanlı struct -> DecodingError.keyNotFound, `try?` -> nil; alan Optional yapılırsa decode başarılı. Yani default değer synthesized decoder'ı kurtarmıyor — iddia teknik olarak doğru. (4) Kalıcılık: AppState.swift:14-16 `didSet { persistProgress() }` — ilk mutasyon (ör. addXP, satır 110-114) boş progress'i "user_progress_v2" key'ine yazıp eski blob'u geri dönüşsüz siler; repo'da yedek/migration/iCloud KV mekanizması yok (grep: tek referans AppState.swift:36). (5) AppState.swift:20-22 yorumu ekibin riski bildiğini kanıtlıyor: completedPatterns bilerek ayrı key'de. Öneri: UserProgress'e custom `init(from:)` + `decodeIfPresent` (veya @DecodableDefault tarzı property wrapper) eklenmeli ve decode başarısız olursa eski blob ayrı bir 'user_progress_v2_backup' key'ine kopyalanmalı.

</details>

### 🟠 HIGH · ATS tamamen kapalı: NSAllowsArbitraryLoads = true production'da — ✅ bağımsız doğrulandı

Info.plist'te NSAppTransportSecurity > NSAllowsArbitraryLoads true — App Transport Security tüm app için devre dışı. Uygulama TestFlight'ta (1.0.1 build 2) ve tüm trafik zaten HTTPS (fly.dev, youtube-nocookie.com), yani bu istisnaya ihtiyaç yok. Cleartext HTTP'ye ve zayıf TLS'e kapı açıyor; App Store review'da gerekçe istenir ve güvenlik denetimlerinde kırmızı bayraktır.

**Kanıt:** ios-native/EnglishLearning/Resources/Info.plist: `<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><true/></dict>`; APIClient.swift:37 default base zaten https.

**Dosyalar:** `ios-native/EnglishLearning/Resources/Info.plist`

**Öneri:** NSAllowsArbitraryLoads'u kaldır. Lokal backend'e (http://localhost) ihtiyaç varsa DEBUG şemasına özel bir Info.plist/xcconfig ile `NSAllowsLocalNetworking` veya domain-bazlı exception ekle; release plist'i temiz kalsın.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. ios-native/EnglishLearning/Resources/Info.plist:25-29'da NSAppTransportSecurity > NSAllowsArbitraryLoads=true aynen var; NSExceptionDomains veya debug-only kapsam daraltması yok ve aynı plist 1.0.1/build 2 (TestFlight'taki production build). APIClient.swift:37 default base https://english-learning-admin.fly.dev; ios-native Swift kaynaklarında hiç cleartext http:// URL yok (tüm YouTube/fly.dev endpoint'leri https), yani istisna gerçekten gereksiz. Ek kanıt: istisna XcodeGen kaynağı project.yml:44-45'te de tanımlı — sadece Info.plist'ten silmek yetmez, xcodegen yeniden üretir; düzeltme iki dosyada birden yapılmalı. Lokal backend iterasyonu için ADMIN_API_BASE_URL override'ı (APIClient.swift:31-40) global istisna yerine debug-only NSAllowsLocalNetworking ile karşılanabilir.

</details>

### 🟠 HIGH · SpacedRepetition ve streak tarih hesapları timezone tutarsız — TR kullanıcıda interval 1 gün kısalıyor — ✅ bağımsız doğrulandı

isoDay() günü GMT'de formatlıyor (TimeZone(secondsFromGMT: 0)) ama computeNextReview() 'bugünün başlangıcını' cihazın YEREL takvimiyle alıp gün ekliyor. UTC+3'teki bir Türk kullanıcı için yerel gece yarısı GMT'de bir önceki gün 21:00'dir; buna 1 gün ekleyip GMT'de formatlayınca nextReviewDate = bugün çıkıyor. Doğruladım: 2026-07-02 10:00 İstanbul'da today='2026-07-02', interval=1 için nextReview='2026-07-02' — yani doğru cevaplanan kelime aynı gün tekrar 'due' oluyor; tüm intervaller pozitif UTC offset'lerde fiilen 1 gün kısa. Aynı GMT/yerel karışımı AppState.updateStreak()'te de var: gün sınırı Türk kullanıcı için 03:00'te dönüyor (00:00-03:00 arası aktivite önceki güne yazılır), streak artışı/sıfırlaması buna göre kayıyor.

**Kanıt:** SpacedRepetition.swift:12-17 (GMT isoDay), :53-57 (yerel Calendar ile byAdding); AppState.swift:137-155; doğrulama scripti çıktısı: "today(GMT-string): 2026-07-02 | nextReview for interval=1: 2026-07-02"

**Dosyalar:** `ios-native/EnglishLearning/Services/SpacedRepetition.swift:12`, `ios-native/EnglishLearning/State/AppState.swift:137`

**Öneri:** Tek bir timezone standardı seç: kullanıcı deneyimi açısından doğrusu YEREL gün — isoDay'de `TimeZone.current` kullan ve computeNextReview'daki Calendar ile aynı zone'u paylaş; ya da her yerde UTC'ye geç. String yerine `Date` + `Calendar.isDate(_:inSameDayAs:)` ile karşılaştırmak bu hata sınıfını kökten kaldırır.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru, hatta iddia edilenden biraz daha kötü. Kanıt: SpacedRepetition.swift:12-17'de isoDay() GMT (secondsFromGMT: 0) ile formatlıyor; :53-55'te ise Calendar(identifier: .iso8601) timezone verilmeden oluşturuluyor ve Foundation'da varsayılan olarak cihazın YEREL timezone'unu alıyor (repro çıktısı: calendar.timeZone = Europe/Istanbul). Yerel gece yarısına (İstanbul için GMT'de bir önceki gün 21:00) interval gün eklenip GMT'de formatlanınca tüm intervaller pozitif UTC offset'te 1 gün kısalıyor. TZ=Europe/Istanbul ile çalıştırdığım Swift repro'su (2026-07-02 10:00 İstanbul): today='2026-07-02', interval=1 -> nextReviewDate='2026-07-02', interval=3 -> '2026-07-04' (+2 gün). Ek kanıt: dueEntries() (SpacedRepetition.swift:70) 'nextReviewDate <= today' ile filtrelediği için interval=1'de doğru cevaplanan kelime aynı gün değil ANINDA tekrar due oluyor. AppState.swift:137-155 updateStreak() için de doğrulandı: hem today hem yesterday GMT-isoDay ile hesaplandığından TR kullanıcıda gün sınırı yerel 03:00'te dönüyor; repro'da 2026-07-03 01:30 İstanbul aktivitesi isoDay='2026-07-02' (önceki güne) yazıldı. Küçük düzeltme: updateStreak kendi içinde GMT açısından tutarlı (yerel/GMT karışımı computeNextReview'daki gibi fonksiyon içi değil), ama kullanıcının yerel gün algısıyla çelişen 03:00 sınırı ve streak kayması iddiası aynen geçerli.

</details>

### 🟠 HIGH · DateFormatter'da en_US_POSIX locale yok — Arapça/Tay locale'lerde tarih stringleri bozuluyor — ✅ bağımsız doğrulandı

SpacedRepetition.isoDay() DateFormatter'a locale atamıyor; cihaz locale'i formatlamaya sızar. Doğruladım: ar_SA locale'de çıktı '١٤٤٨-٠١-١٧' (Hicri takvim + Arap rakamları), th_TH'de '2569-07-02' (Budist yıl). Uygulama Profile'da Arapça ve Çince dil seçeneği sunduğuna göre bu locale'lerdeki cihazlarda nextReviewDate/lastActiveDate/lastPracticeDate tamamen anlamsız stringler olarak persist edilir; `nextReviewDate <= today` lexicographic karşılaştırması ve streak mantığı çöker.

**Kanıt:** SpacedRepetition.swift:12-17'de `f.locale` set edilmiyor; doğrulama scripti çıktısı: "ar_SA formatted: ١٤٤٨-٠١-١٧", "th_TH formatted: 2569-07-02"; Progress.swift:5-30 NativeLanguage.ar/.zh destekleniyor.

**Dosyalar:** `ios-native/EnglishLearning/Services/SpacedRepetition.swift:13`

**Öneri:** `f.locale = Locale(identifier: "en_US_POSIX")` ekle (Apple'ın sabit-format tarih stringleri için resmi önerisi). Formatter'ı her çağrıda yeniden yaratmak yerine static let yap. Orta vadede string yerine Date/epoch persist et.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru. (1) ios-native/EnglishLearning/Services/SpacedRepetition.swift:12-17'de isoDay() DateFormatter'a yalnızca dateFormat ve timeZone atıyor; locale (ve calendar) atanmıyor — grep ile doğruladım, ios-native/ altında hiçbir Swift dosyasında locale ataması yok (en_US_POSIX hiç geçmiyor). (2) İddia edilen script çıktısını bağımsız olarak yeniden ürettim: ar_SA locale ile çıktı '١٤٤٨-٠١-١٧' (Umm al-Qura Hicri takvim + Arap-Hint rakamları), th_TH ile '2569-07-02' (Budist yıl), en_US_POSIX ile doğru '2026-07-02'. (3) Etki alanı iddia edildiği gibi geniş: SpacedRepetition.swift:70'te `$0.nextReviewDate <= t` lexicographic string karşılaştırması; AppState.swift:137-155 streak mantığı (lastActiveDate == today/yesterday); AppState.swift:209-216 lastPracticeDate oturum tespiti; DailyTasksView.swift:112-115 günlük plan cache'i tarih string'ine bağlı. (4) Progress.swift:5-6 NativeLanguage .ar ve .zh içeriyor, yani Arapça konuşan hedef kitle gerçek. Ek kanıt: aynı bug bağımsız bir ikinci noktada da var — ProfileView.swift:203-204'te haftalık grafik için oluşturulan DateFormatter'larda da locale yok; sessionHistory `$0.date == iso` eşleşmesi de aynı şekilde bozulur. Küçük nüans: cihaz locale'i sabit kaldığı sürece stringler kendi içinde tutarlı kalabilir; asıl çöküş cihaz dili/takvim ayarı değişince veya farklı locale'de yazılmış kayıtlarla karışınca yaşanır (ör. Budist '2569-...' kaydı Gregoryen '2026-...' ile karşılaştırıldığında hiçbir kelime asla 'due' olmaz). Bu nüans bulgunun ciddiyetini düşürmüyor; persist edilen veri yazım anında bozuk.

</details>

### 🟠 HIGH · API'de hiçbir kimlik doğrulama yok; admin backend'i herkese açık — ✅ bağımsız doğrulandı

APIClient hiçbir auth header/token/API key göndermiyor; tüm istekler anonim GET. Base URL admin panelinin kendisi (english-learning-admin.fly.dev) — yani içerik API'si ile admin backend aynı origin'de ve iOS istemcisinin kullandığı endpointler tamamen public. Rate limit/abuse koruması istemci tarafında da yok. İçerik şu an okuma-amaçlı olsa da admin ile aynı serviste auth'suz yüzey, veri kazıma ve maliyet (Fly.io) riskini büyütür.

**Kanıt:** APIClient.swift:144-176 `get()` — Authorization header yok, sadece Content-Type ve User-Agent set ediliyor; APIClient.swift:37 base = https://english-learning-admin.fly.dev.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift:144`, `ios-native/EnglishLearning/Services/APIClient.swift:37`

**Öneri:** En azından statik bir API key/App Attest tabanlı hafif doğrulama ekle ve admin route'ları ile public içerik API'sini ayır (ör. ayrı subdomain veya path-prefix + backend'de admin route'lara auth middleware). Fly.io tarafında rate limiting aç.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru ve hatta eksik. (1) APIClient.swift:151-154 yalnızca Content-Type ve User-Agent header'ı set ediyor, Authorization/API key yok; iOS kodundaki tek header set eden yer burası. (2) APIClient.swift:37 base URL'i https://english-learning-admin.fly.dev — admin paneliyle aynı origin. (3) Ek kanıt: admin backend tarafında da hiçbir auth yok — admin/ altında middleware.ts, next-auth, 401/unauthorized kontrolü bulunmuyor; dahası sadece okuma değil YAZMA endpointleri de public: admin/app/api/videos/route.ts (POST/DELETE), admin/app/api/lessons/[id]/route.ts (POST/PUT/DELETE), admin/app/api/clips/route.ts (DELETE), admin/app/api/pipeline/route.ts ve admin/app/api/process/route.ts (POST). Yani anonim istemci production DB'yi değiştirebilir/silebilir. (4) admin/fly.toml [http_service] ile servis herkese açık deploy ediliyor (min_machines_running=1, /data mount'unda admin.db). Bulgunun 'high' seviyesi yerinde; yazma endpointleri nedeniyle etki bulguda anlatılandan daha büyük.

</details>

### 🟡 MEDIUM · fetchLessonClips(all:true) URL'i bozuk: '?' path'e gömülüp %3F olarak encode ediliyor

APIClient.fetchLessonClips, `all=true` query'sini string birleştirmeyle path'e ekliyor; get() bu path'i `base.appendingPathComponent(path)`'e verdiği için '?' karakteri %3F'e percent-encode ediliyor ve istek `/clips%3Fall=true` diye tek bir path segmentine gidiyor — server bunu farklı (muhtemelen 404) endpoint olarak görür. Bunu çağıran tek yer CurriculumRepository.allClips() ve o da şu an hiçbir Feature'dan çağrılmıyor; yani bug ölü kodda gizleniyor ve ilk kullanan geliştiricide patlayacak.

**Kanıt:** APIClient.swift:105 `"/api/v1/lessons/\(lessonId)/clips" + (all ? "?all=true" : "")`; CacheService.swift:152 tek çağrı noktası; doğrulama scripti çıktısı: 'https://english-learning-admin.fly.dev/api/v1/lessons/lesson-01/clips%3Fall=true'; Features/ altında allClips kullanımı grep'te sıfır.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift:105`, `ios-native/EnglishLearning/Services/CacheService.swift:152`

**Öneri:** Query'yi diğer endpointlerdeki gibi `URLQueryItem(name: "all", value: "true")` olarak geçir (get() zaten query parametresi alıyor). allClips() gerçekten kullanılmayacaksa repository'den sil.

### 🟡 MEDIUM · VocabContext.asLessonClip() içinde try! — production crash riski

asLessonClip(), elle kurduğu [String: Any] dict'i `try! JSONSerialization.data` + `try! JSONDecoder().decode(LessonClip.self)` ile LessonClip'e çeviriyor. ClipLine/ClipWord decoder'ına ileride zorunlu bir alan eklenirse (veya dict kurulumu ile decoder arasında bir key uyumsuzluğu oluşursa) bu satır kullanıcının elinde fatalError ile çöker. Kelime detayından klip oynatma ana akışlarından biri olduğu için crash yüzeyi gerçek.

**Kanıt:** VocabContext.swift:101-102 `let data = try! JSONSerialization.data(...)` ve `return try! JSONDecoder().decode(LessonClip.self, from: data)`

**Dosyalar:** `ios-native/EnglishLearning/Models/VocabContext.swift:101`

**Öneri:** JSON round-trip hilesi yerine ClipLine/ClipWord'e memberwise init ekleyip LessonClip'i doğrudan kur; bu mümkün değilse fonksiyonu `throws` veya optional dönecek şekilde değiştirip çağıran view'da fallback göster.

### 🟡 MEDIUM · Retry mekanizması Task cancellation'ı yutuyor ve decode hatalarını boşuna retry ediyor

withRetry içindeki `try? await Task.sleep(...)` CancellationError'ı yutar: kullanıcı ekrandan çıkıp .task iptal edildiğinde istek zinciri durmaz, iptal edilmiş URLSession hatası 'transport' sayılıp 2 kez daha retry edilir (aralarda 1-2 sn uyuyarak). Ayrıca retry sadece 4xx'i eliyor; APIError.decoding deterministik olduğu halde aynı yanıt 3 kez fetch+decode denenir. Bu hem gereksiz ağ trafiği hem de geç gelen sonuçların stale state basma riskini artırır.

**Kanıt:** APIClient.swift:178-192 — `try? await Task.sleep(nanoseconds: delay)` ve yalnızca `(400..<500)` kontrolü; `Task.isCancelled` / `Task.checkCancellation()` hiç yok.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift:186`

**Öneri:** Sleep'i `try await Task.sleep` yapıp CancellationError'ı dışarı fırlat (veya döngü başında `try Task.checkCancellation()`). Retry koşulunu whitelist'e çevir: yalnızca transport hataları ve 5xx retry edilsin; decoding hataları hemen fırlatılsın. Delay'e jitter ekle.

### 🟡 MEDIUM · Sıfır loglama, crash reporting ve analytics

App genelinde tek bir os.Logger, print, Crashlytics/Sentry veya analytics çağrısı yok (grep sonucu boş). API hataları yalnızca `errorMessage = error.localizedDescription` olarak ekrana düşüyor, hiçbir yere kaydedilmiyor. TestFlight'ta gerçek kullanıcılar varken decode hatası, cache bozulması, YouTube embed hatası gibi sorunlar tamamen görünmez; MEMORY'deki 'duplicate dictionary keys' crash'i gibi vakalar ancak kullanıcı şikayetiyle fark edilir.

**Kanıt:** `grep -rn "os_log|Logger(|OSLog|Crashlytics|Sentry|Analytics|print("` app kodunda sonuç döndürmedi (yalnızca build/ klasörü hariç tutuldu); HomeView.swift:15-17 hataların tek gittiği yer UI state.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift`, `ios-native/EnglishLearning/State/AppState.swift`

**Öneri:** os.Logger ile kategorili (network, persistence, player) loglama ekle; MetricKit veya hafif bir crash reporter (Sentry/Crashlytics) bağla. En kritik nokta: AppState.loadInitial'daki decode başarısızlıklarını ve APIClient hatalarını logla.

### 🟡 MEDIUM · Kritik iş mantığının hiçbir unit testi yok; mevcut tek entegrasyon testi canlı network'e bağımlı

EnglishLearningTests yalnızca 3 dosya: TurkishPhonetics sözlük regresyonu, YouTube embed HTML string assertleri ve YouTube'a gerçek network çağrısı yapan bir entegrasyon testi (kendi yorumuyla 'requires the simulator to have connectivity' — CI'da flaky). SpacedRepetition.computeNextReview, AppState.updateStreak, Levels.levelFromXP, CacheService TTL ve UserProgress decode geriye-uyumluluğu — yani bu denetimde bulunan bug'ların yaşadığı her yer — test kapsamı dışında. Timezone bug'ı ve veri kaybı riski testle yakalanabilirdi.

**Kanıt:** ios-native/EnglishLearningTests/ altında yalnızca TurkishPhoneticsTests.swift, YouTubePlayerViewTests.swift, YouTubePlayerEmbedIntegrationTests.swift var (find çıktısı); YouTubePlayerEmbedIntegrationTests.swift:9-11 network bağımlılığı yorumu.

**Dosyalar:** `ios-native/EnglishLearningTests/TurkishPhoneticsTests.swift`, `ios-native/EnglishLearningTests/YouTubePlayerEmbedIntegrationTests.swift:9`

**Öneri:** SpacedRepetition (interval progression, timezone sınırları, due filtresi), updateStreak (dün/bugün/gap senaryoları) ve 'eski JSON blob yeni modelle decode olur mu' testlerini ekle — bunlar pure function/Codable olduğu için test yazması ucuz. Canlı YouTube testini ayrı bir test plan'e taşıyıp default suite'ten çıkar.

### 🟡 MEDIUM · Environment ayrımı yok: DEBUG dahil her build production backend'e gidiyor + force-unwrap URL

APIClient tüm build'lerde https://english-learning-admin.fly.dev'e bağlanıyor; DEBUG/RELEASE ayrımı yok, override yalnızca env var/Info.plist ile manuel. Geliştirme sırasındaki her deneme prod DB'ye istek atıyor (yorumda bilinçli tercih olduğu yazılmış, ama staging'siz büyümek risk). Ayrıca `URL(string: baseString)!` — Info.plist'e bozuk bir override girilirse app açılışta çöker.

**Kanıt:** APIClient.swift:27-39 — yorum: 'both simulator and physical-device DEBUG hit production now'; :39 `URL(string: baseString)!`.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift:27`

**Öneri:** xcconfig tabanlı environment ayrımı kur (Debug→staging, Release→prod) ve base URL'i build setting'den oku. Force unwrap yerine `guard let ... else { fallback to default }` kullan ve geçersiz override'ı logla.

### 🟡 MEDIUM · AppState god-object'e evriliyor + her mutasyonda tüm blob main thread'de senkron re-encode

AppState dil, çeviriler, progress, vocab pool, pattern completion, günlük görevler, session log, XP/level, streak ve hatta player-görünürlüğü (isVideoPlayerActive) gibi birbiriyle ilgisiz sorumlulukları tek sınıfta topluyor. didSet tabanlı persistence yüzünden her küçük mutasyon (ör. tek kelime review'ı) TÜM vocabPool dictionary'sinin veya TÜM UserProgress'in (90 kayıtlık sessionHistory + lessonMastery dahil) JSONEncoder ile main thread'de senkron encode edilip UserDefaults'a yazılmasını tetikliyor; updateStreak gibi çok alan değiştiren fonksiyonlar bunu ardışık birden çok kez yapıyor. Pool birkaç yüz kelimeye çıktığında review ekranında her cevap gözle görülür main-thread işi üretir.

**Kanıt:** AppState.swift:14-25 didSet zinciri, :80-92 persist fonksiyonları (senkron encode, @MainActor sınıf), :137-155 updateStreak'te ardışık progress mutasyonları; :31 isVideoPlayerActive UI-koordinasyon state'inin aynı sınıfta olması.

**Dosyalar:** `ios-native/EnglishLearning/State/AppState.swift:14`

**Öneri:** Persistence'ı debounce'lu tek bir 'save' noktasına topla (ör. Combine `throttle` veya bir `Task` ile 500ms coalescing) ve encode işini background'a al. Orta vadede AppState'i ProgressStore / VocabPoolStore / SettingsStore gibi alan-bazlı store'lara böl; isVideoPlayerActive gibi geçici UI koordinasyonunu ayrı bir küçük ObservableObject'e taşı.

### 🟡 MEDIUM · Singleton'lar doğrudan kullanılıyor — dependency injection ve protokol soyutlaması yok

APIClient.shared, CacheService.shared, CurriculumRepository.shared ve OrientationLock.shared tüm ViewModel'lerde doğrudan çağrılıyor (Features altında 18 kullanım). Hiçbiri protokolle soyutlanmamış ve init'leri de private değil — hem yanlışlıkla ikinci instance yaratılabilir hem de ViewModel'lere mock enjekte edilemediği için HomeViewModel.load gibi akışlar unit-test edilemez durumda. Test yokluğu bulgusunun kök nedeni bu.

**Kanıt:** APIClient.swift:21 `static let shared` + :27 public init; CacheService.swift:5 ve :61; HomeView.swift:13 `CurriculumRepository.shared.curriculum(...)` doğrudan çağrı; grep: Features/ altında 18 `.shared` kullanımı.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift:21`, `ios-native/EnglishLearning/Services/CacheService.swift:60`, `ios-native/EnglishLearning/Features/Home/HomeView.swift:13`

**Öneri:** En az bir `CurriculumRepositoryProtocol` tanımlayıp ViewModel init'lerine default parametreli enjeksiyon ekle (`init(repo: CurriculumRepositoryProtocol = CurriculumRepository.shared)`) — mevcut çağrı yerleri değişmeden testte mock geçilebilir. Singleton init'lerini `private init()` yap.

### ⚪ LOW · updateStreak içinde ölü/çelişkili mantık

Streak sıfırlama dalında `progress.streak = max(progress.streak, 1)` satırı hemen ardından gelen if/else tarafından ezildiği için ölü kod; if ve else dallarının İKİSİ de `streak = 1` atıyor, yani koşulun hiçbir etkisi yok. Davranış bugün doğru (reset=1) ama kod ilk bakışta 'streak korunuyor' izlenimi veriyor ve gelecekte yanlış düzenlemeye davetiye çıkarıyor. Ayrıca her progress mutasyonu ayrı persist tetikliyor.

**Kanıt:** AppState.swift:150-152: `progress.streak = max(progress.streak, 1); if progress.lastActiveDate.isEmpty == false { progress.streak = 1 } else { progress.streak = 1 }`

**Dosyalar:** `ios-native/EnglishLearning/State/AppState.swift:150`

**Öneri:** Üç satırı tek `progress.streak = 1` ile değiştir; streak mantığını timezone düzeltmesiyle birlikte pure function'a çıkarıp (`Streak.next(lastActive:now:)`) unit test yaz.

### ⚪ LOW · VideoSet.totalDurationSeconds her zaman 0 döndürüyor (bozuk + ölü kod)

`videos.reduce(0) { acc, _ in acc }` accumulator'a hiçbir şey eklemediği için her zaman 0 döner; doc yorumu 'clip count × ~1 dakika heuristic' vaat ediyor ama implementasyon yok. Şu an hiçbir yerden çağrılmadığı için ('5 video · ~20 dk' rozeti bunu kullanmıyor) sessizce duruyor — ilk kullanan geliştirici 0 sn'lik süre gösterecek.

**Kanıt:** VideoSet.swift:38-40; grep: totalDurationSeconds'a tanım dışında hiçbir referans yok.

**Dosyalar:** `ios-native/EnglishLearning/Models/VideoSet.swift:38`

**Öneri:** Ya yorumda anlatılan heuristic'i gerçekten uygula (`videos.reduce(0) { $0 + $1.clipCount * 60 }`) ya da property'yi tamamen sil.

### ⚪ LOW · Debug launcher Release build'e derleniyor (#if DEBUG yok)

RootView'daki `-StartInClipPlayer` / `START_IN_CLIP_PLAYER` debug giriş noktası ve DebugClipPlayerLauncher hiçbir derleme koşuluna bağlı değil; TestFlight/App Store binary'sinde de mevcut. iOS'ta son kullanıcının launch argümanı geçmesi pratik olarak zor olsa da, hardcoded 'lesson-01-greetings' fetch'i içeren test kodunun production binary'de yaşaması gereksiz yüzey.

**Kanıt:** EnglishLearningApp.swift:26-29 (ProcessInfo kontrolü) ve :55-87 (DebugClipPlayerLauncher) — dosyada hiç `#if DEBUG` yok.

**Dosyalar:** `ios-native/EnglishLearning/App/EnglishLearningApp.swift:26`

**Öneri:** startsInClipPlayer kontrolünü ve DebugClipPlayerLauncher'ı `#if DEBUG ... #endif` içine al.

### ⚪ LOW · Cache anahtarı sanitizasyonu collision'a açık; boyut sınırı ve sürüm invalidation'ı yok

CacheService yalnızca '/' karakterini '_' ile değiştiriyor: 'lesson:a/b' ve 'lesson:a_b' aynı dosyaya düşer (bugünkü key'lerde ID'ler kontrollü olduğu için teorik, ama repo dışından gelen ID'lerle gerçekleşebilir). Cache klasöründe toplam boyut sınırı ve app-version bazlı invalidation yok — model şeması uyumlu-ama-anlamı-değişmiş şekilde evrilirse TTL süresince (24 saate kadar) bayat veri servis edilir. Decode başarısızlığı `try?` ile nil dönüp kendini onardığı için felaket değil, hijyen eksiği.

**Kanıt:** CacheService.swift:31-34 tek replacingOccurrences; :36-45 try? decode; boyut/versiyon yönetimi dosyada yok.

**Dosyalar:** `ios-native/EnglishLearning/Services/CacheService.swift:31`

**Öneri:** Key'i dosya adına çevirirken hash ekle (ör. `key.hashValue` veya SHA256 suffix). Envelope'a `appVersion`/`schemaVersion` alanı koyup uyuşmayanları at; clearAll'ı sürüm yükseltmede çağır.

### ⚪ LOW · SM-2 basitleştirmelerinde aynı-gün review şişmesi ve tek yönlü ease artışı

Algoritma bilinçli olarak basitleştirilmiş (binary doğru/yanlış, EF 1.3-2.5 clamp) ve bu dokümante edilmiş — sorun değil. Ancak iki edge case var: (1) aynı kelime aynı gün üst üste doğru cevaplanırsa interval her seferinde çarpılarak büyür (1→3→8→20...), gerçek 'spacing' olmadan kelime mastered'a fırlar — computeNextReview'da aynı-gün dampening yok; (2) EF her doğruda +0.1 artıp 2.5'te doyduğu için zorlanılan-ama-doğru kelimelerle kolay kelimeler ayrışamıyor. dueEntries yalnızca due olanları döndürse de processReview'ı çağıran quiz akışları due-dışı kelimelerde de tetiklenebilir.

**Kanıt:** SpacedRepetition.swift:32-59 — lastReviewDate kontrolü yok, interval koşulsuz büyüyor; AppState.swift:225-232 processReview her çağrıda computeNextReview çalıştırıyor.

**Dosyalar:** `ios-native/EnglishLearning/Services/SpacedRepetition.swift:32`

**Öneri:** computeNextReview'a `if e.lastReviewDate == today { return e /* sayaçlar hariç */ }` tarzı aynı-gün koruması ekle veya interval güncellemesini yalnızca entry gerçekten due iken yap.

### ⚪ LOW · 6 dil seçeneği sunuluyor ama içerik katmanı Türkçe'ye sabitlenmiş

NativeLanguage es/ar/zh/pt/en seçenekleri sunuyor ve Localization bu diller için UI-string bundle'ları taşıyor; fakat asıl öğrenme içeriği tek dilli: modellerdeki tüm çeviri alanları *Tr (translationTr, starterTr, exampleTr...), PatternCatalog tamamen hardcoded Türkçe (familyTr, introTr, labelTr='özne') ve partOfSpeechTr yalnız Türkçe karşılık döndürüyor. İspanyolca seçen kullanıcı menüleri İspanyolca, tüm kelime anlamlarını ve kalıp anlatımını Türkçe görür. Ürün Türk kullanıcılara odaklandığına göre bu seçenekler yanıltıcı ve ölü bakım yükü.

**Kanıt:** Progress.swift:5-30 (6 dil); Localization.swift:180-299 (es/ar/zh/pt bundle'ları); Pattern.swift:9-24 labelTr ve :112+ hardcoded Türkçe catalog; Curriculum.swift:243 translationTr; VocabContext.swift:168-177 partOfSpeechTr.

**Dosyalar:** `ios-native/EnglishLearning/Models/Progress.swift:5`, `ios-native/EnglishLearning/Services/Localization.swift:180`, `ios-native/EnglishLearning/Models/Pattern.swift:19`

**Öneri:** POC aşamasında dil seçiciyi tr (+belki en) ile sınırla ve diğer bundle'ları sil; çok-dillilik gerçekten hedefse çeviri alanlarını `translations: [lang: String]` şeklinde modelleyip backend'den dile göre iste.

### ⚪ LOW · isVideoPlayerActive: paylaşılan Bool'u birden çok ekranın onAppear/onDisappear'ı yönetiyor

Tab bar görünürlüğünü kontrol eden bu bayrak en az üç farklı view'ın yaşam döngüsünden yazılıyor (VideoWatchView, SetDetailView, PatternReelsView). SwiftUI'da push/pop geçişlerinde yeni view'ın onAppear'ı ile eskisinin onDisappear'ının sırası garanti değildir: player-üstüne-player navigasyonunda onDisappear sonradan gelirse bayrak false kalır ve tab bar video üzerinde belirir. PatternReelsView'daki onChange ile bayrağı geri true'ya zorlayan workaround (satır 109-112) yarışın zaten yaşandığının kanıtı.

**Kanıt:** AppState.swift:28-31 tanım ve doc yorumu; Features grep: VideoWatchView.swift:36-37, SetDetailView.swift:369-370, PatternReelsView.swift:102-116 (onChange ile geri-set workaround'u).

**Dosyalar:** `ios-native/EnglishLearning/State/AppState.swift:31`, `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:109`

**Öneri:** Bool yerine sayaç kullan (`activePlayerCount`, onAppear'da +1 / onDisappear'da -1; `isVideoPlayerActive = count > 0`) veya SwiftUI'nin `.toolbar(.hidden, for: .tabBar)` mekanizmasına geç.

### ⚪ LOW · CurriculumRepository API'si tutarsız: yok sayılan forceRefresh parametreleri

pocVideos/pocVideoClips/videoSets/starterWordSummaries imzalarında `forceRefresh` parametresi var ama gövdede hiç kullanılmıyor (cache'siz oldukları için anlamsız); lesson() ve allClips() ise cache kullandıkları halde force-refresh seçeneği hiç sunmuyor. Çağıran taraf forceRefresh:true geçtiğinde bir kısmında etkisi olur bir kısmında olmaz — API sözleşmesi yanıltıcı. Ayrıca repository actor olarak tanımlanmış ama hiçbir mutable state'i yok.

**Kanıt:** CacheService.swift:65-81 (parametre gövdede kullanılmıyor), :132-140 lesson() forceRefresh'siz cache, :147-155 allClips aynı; :60 `actor CurriculumRepository` — stored property yok.

**Dosyalar:** `ios-native/EnglishLearning/Services/CacheService.swift:60`

**Öneri:** Kullanılmayan forceRefresh parametrelerini kaldır, cache'li metodların hepsine gerçek forceRefresh davranışı ekle; state'siz repository'yi actor yerine struct/enum + static metodlar veya sıradan final class yap.

---

## iOS UI Katmanı (Features / Components / DesignSystem)

**Genel durum:** ios-native/EnglishLearning UI katmanı görsel olarak özenli ve alışılmadık derecede iyi belgelenmiş; Theme token mimarisi, merkezi Loading/Error bileşenleri ve FlowLayout gibi paylaşılan parçalar doğru kurulmuş. Ancak katmanın omurgası olan YouTubePlayerView kırılgan: updateUIView prop değişimini işlemiyor, reload komutu makeUIView anında gömülen eski videoId/start/end değerlerini çalıştırıyor, tek slotlu command binding'i komut kaybediyor ve error 152 geçmişine rağmen onError hiçbir ekranda bağlanmamış. Reel kartları (Pattern/Vocab) ~450'şer satır birebir kopya, kontraksiyon sözlüğü ve 3 renkli yapı paleti 5 yerde tekrarlanmış; ClipPlayerView 1371 satırlık ViewModel'siz bir god-view. Erişilebilirlik (VoiceOver etiketi, Dynamic Type) tamamen sıfır, lokalizasyon altyapısı 6 dil iddia ederken ekranlar hardcoded Türkçe+İngilizce karışımı basıyor ve ~2.500 satır legacy ekran hâlâ derlenip TestFlight'a gidiyor. POC hedefi için ürün çalışır durumda, ama player altyapısı ve tekrar eden kart kodu konsolide edilmeden eklenen her yeni akış bu borcu katlayacak.

**Korunması gereken güçlü yanlar:**
- Loading/Error state'ler için merkezi bileşenler (LoadingStates.swift) yazılmış ve repo-destekli ekranların çoğunda tutarlı kullanılıyor (LoadingState/ErrorState + retry closure kalıbı).
- Kod içi dokümantasyon olağanüstü iyi: neredeyse her tasarım kararının gerekçesi (coalescing davranışı, chrome hit-test sırası, FlowLayout ölçüm tuzağı, cinema hoisting) yorumlarla açıklanmış — denetimi bile kolaylaştırdı.
- Embed error 152 için regresyon testleri yazılmış (YouTubePlayerViewTests + YouTubePlayerEmbedIntegrationTests) — CLAUDE.md'deki 'önce repro testi' disiplini uygulanmış.
- FlowLayout, iOS 16 Layout protokolüyle temiz yazılmış tek bir custom layout olarak 5+ ekranda paylaşılıyor.
- Haptics ve PressableStyle merkezi ve tutarlı: her dokunulabilir öğe aynı pressable ölçekleme + doğru haptic tipini kullanıyor.
- Theme.swift renk/spacing/radius/typography token mimarisi doğru kurgulanmış; tipografi hiyerarşisi yorumlarla gerekçelendirilmiş (rounded yalnızca sayısal/hero).
- Liste ekranlarında ViewModel + repository (CurriculumRepository, cache + forceRefresh) kalıbı düzenli; .task(id:) ile pool değişiminde otomatik yeniden yükleme gibi incelikler var.
- SetPlayerView'ın phase-machine + portrait/cinema pozisyon senkronu (onTick/resumeAt) karmaşık bir UX problemini çalışır şekilde çözüyor.

### 🟠 HIGH · YouTubePlayerView: updateUIView prop değişikliklerini yok sayıyor, '.reload' komutu ilk klibin baked değerlerini çalıştırıyor — ✅ bağımsız doğrulandı

YouTubePlayerView'da HTML, makeUIView anında videoId/start/end değerleri string içine gömülerek (baked) üretiliyor; updateUIView yalnızca command'ı işliyor, videoId/startTime/endTime değişimini hiç ele almıyor. JS tarafındaki 'reload' dalı da HTML'e gömülü endSetter'ı çalıştırıyor: `player.loadVideoById({ videoId: '<İLK videoId>', startSeconds: <İLK start>, endSeconds: <İLK end> })`. Sonuç: ClipPlayerView çok klipli bir dizide ilerlerken (`onChange(of: clip.id) { command = .reload }`) her zaman İLK klibin segmenti yeniden yüklenir; JS'deki `endSec` sabiti de ilk klibin bitişinde durdurur. LessonClipsView `Array(vm.clips[startIndex...])` ile çok klipli dizi geçiriyor, yani bu akışta klip ilerletme bozuk. Ekip bu kısıtın farkında ve SetPlayerView'da `.id(currentVideo.id)` + videoId eşleşme guard'ı ile workaround yazmış (SetDetailView.swift:410-419'daki yorum bunu açıkça itiraf ediyor) — ama kök neden düzeltilmemiş.

**Kanıt:** YouTubePlayerView.swift:69 `endSetter = "player.loadVideoById({ videoId: '\(videoId)', startSeconds: \(Int(start))..."` (makeUIView anında sabitleniyor); updateUIView (53-58) sadece command işliyor. SetDetailView.swift:415-419 yorumu: "its UIViewRepresentable.updateUIView doesn't handle videoId changes, so the WebView keeps showing the just-finished video".

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:53-58`, `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:62-72`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:165-179`, `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:410-421`, `ios-native/EnglishLearning/Features/Lesson/LessonClipsView.swift:76-77`

**Öneri:** updateUIView içinde `context.coordinator.lastVideoId != videoId || lastStart != startTime` karşılaştırması yapıp değişiklikte `loadVideoById`'ı GÜNCEL parametrelerle evaluateJavaScript üzerinden gönderin (endSec'i de JS'te değişken yapıp güncelleyin). `PlayerCommand.reload` yerine `reload(videoId:start:end:)` gibi parametreli bir komut tanımlayın. Coordinator'da `parent`'ı da updateUIView'da tazeleyin (şu an ilk struct'a sabitlenmiş: `let parent`). Böylece `.id()` remount hack'lerine gerek kalmaz.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru. YouTubePlayerView.swift:48,62-72'de videoId/start/end HTML'e makeUIView anında gömülüyor; updateUIView (:53-58) yalnızca command işliyor ve .reload (:102, :127) parametresiz gidip baked endSetter'ı çalıştırıyor. ClipPlayerView.swift:215'teki YouTubePlayerView'da .id() yok, next() (:1289) sadece index artırıyor; dolayısıyla .onChange(of: clip.id) → .reload (:165-167) hep mount anındaki ilk klibin segmentini yükler. Ek kanıt: (1) JS'teki `const endSec` (:81) de baked, ticker (:92) ilk klibin bitişinde pause ediyor — sonraki klibin endTime'ı daha geçse Swift tarafı auto-advance (t >= clip.endTime, ClipPlayerView:235) hiç tetiklenmez ve akış takılır; (2) LessonClipsView.swift:76-77 çok klipli dizi geçiyor ve bu ekran ScenesLandingView.swift:22 ile CoursesView.swift:24'ten canlı olarak erişilebilir (ölü kod değil); (3) SetDetailView.swift:412-419 yorumu kısıtı aynen itiraf ediyor, :436'daki .id(currentVideo.id) + :420-421'deki videoId guard'ı yalnızca video-arası geçişi kurtaran workaround — aynı ClipPlayerView içindeki klip-arası geçiş sorunu duruyor.

</details>

### 🟠 HIGH · Tek slotlu command Binding'i komut kaybediyor — seek+play aynı tick'te üst üste yazılıyor — ✅ bağımsız doğrulandı

Player'a komutlar `@Binding var command: PlayerCommand?` üzerinden tek slot ile gidiyor. ClipPlayerView'da `seekLine`, `replayCurrentLine` ve `contextRow` aynı çağrıda önce `command = .seek(...)` sonra `if !isPlaying { command = .play }` yazıyor; SwiftUI aynı render tick'inde binding yazımlarını birleştirdiği için seek komutu KAYBOLUR (video duraklatılmışken transcript satırına dokununca sadece play gider, seek gitmez). Ekip bu davranışı VocabFeedView.swift:228-233'te kendisi belgelemiş ("Sending both commands in the same render tick collapses to just the last one") ve orada DispatchQueue.main.async ile geçici çözüm uygulamış — ama ClipPlayerView'daki üç yerde aynı hata duruyor. Ayrıca updateUIView'daki `DispatchQueue.main.async { self.command = nil }` sıfırlaması, araya giren yeni bir komutu silme yarışına açık.

**Kanıt:** ClipPlayerView.swift:1255-1256 `command = .seek(clip.lines[target].startTime); if !isPlaying { command = .play }`; VocabFeedView.swift:229-233 yorumu aynı SwiftUI coalescing davranışını doğruluyor.

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:1250-1264`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:484-488`, `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:53-58`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:224-240`

**Öneri:** Binding-tabanlı tek slot yerine Coordinator'a referansla erişilen bir komut kuyruğu (ör. `PlayerController: ObservableObject` içinde `send(_ cmd:)` fonksiyonu) kullanın; ya da kısa vadede `.loop` benzeri birleşik `seekAndPlay(Double)` komutu ekleyip çift yazımları kaldırın.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. YouTubePlayerView.swift:17 tek slot @Binding, :53-58 updateUIView tek komut okuyup async nil'liyor. ClipPlayerView.swift'te üç yerde (seekLine 1255-1256, replayCurrentLine 1262-1263, contextRow 486-487) aynı tick'te önce .seek sonra .play yazılıyor; ikinci atama @State'i render öncesi ezdiği için seek kaybolur (video duraklıyken transcript satırına dokunma senaryosu birebir tutuyor). VocabFeedView.swift:227-236 yorumu davranışı ekibin kendi ağzından belgeliyor ve DispatchQueue.main.async workaround'u uyguluyor. EK KANIT: aynı workaround ClipPlayerView.swift:192-199'daki resumeAt handler'ında da var — yani sorun aynı dosyada biliniyor ama üç site düzeltilmemiş. updateUIView'daki async command=nil sıfırlamasının araya giren yeni komutu silme yarışı da yapısal olarak mevcut.

</details>

### 🟠 HIGH · onError hiçbir view'da bağlanmamış — embed error 152 tekrar olursa kullanıcı siyah ekranda kalır — ✅ bağımsız doğrulandı

YouTube embed error 152 geçmişi nedeniyle YouTubePlayerView'a `onError: ((Int) -> Void)?` hook'u eklenmiş ve testler (YouTubePlayerViewTests.test_embedHTMLRegistersPlayerErrorHandler) bu callback'in HTML'de kayıtlı olduğunu doğruluyor. Ancak Features altında YouTubePlayerView'ı kullanan HİÇBİR view (ClipPlayerView, CinemaPlayerView, VocabReelCard, PatternReelCard) onError parametresini geçmiyor. Kısıtlı/kaldırılmış bir video geldiğinde player sessizce hata verir; kullanıcı sonsuza dek siyah bir kare + hareketsiz karaoke paneli görür, retry/fallback yoktur. Reels akışında böyle bir kart, kullanıcı manuel kaydırana kadar akışı öldürür.

**Kanıt:** `grep -rn onError Features/` yalnızca YouTubePlayerView.swift içindeki tanımı döndürüyor; ClipPlayerView.videoBlock (215-262) onReady/onEnded geçiyor, onError geçmiyor.

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:15`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:215-262`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:251-278`, `ios-native/EnglishLearningTests/YouTubePlayerViewTests.swift:46-57`

**Öneri:** ClipPlayerView ve reel kartlarına onError bağlayıp bir hata durumu state'i ekleyin: hata kodu 101/150/152'de "Bu sahne oynatılamıyor" kartı + Atla/Tekrar dene aksiyonu gösterin; reels'te otomatik bir sonraki karta geçin. Backend'e de kırık videoId raporlayın (oEmbed temizliği zaten yapılmış — runtime telemetri onu besler).

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. YouTubePlayerView.swift:15'te onError optional (default nil) tanımlı; Coordinator 158/160'ta self.parent.onError?(code) ile optional-chaining kullandığından nil'ken hata sessizce yutulur. EnglishLearning/ kaynak ağacında onError yalnızca YouTubePlayerView.swift'te geçiyor — dört call site'ın hiçbiri (ClipPlayerView.swift:215-262, CinemaPlayerView.swift:171+, VocabFeedView.swift:251+ VocabReelCard, PatternReelsView.swift:297+ PatternReelCard) onError: parametresini geçmiyor; ClipPlayerView'ın kapanış argümanları (246-262) sadece onReady/onEnded/command içeriyor. Caller view'larda onReady-timeout gibi alternatif hata yakalama da yok. Ek kanıt: YouTubePlayerViewTests.swift:13-14 doc yorumu hook'un tam da 'callers can show a fallback' amacıyla eklendiğini söylüyor, ancak hiçbir caller kullanmıyor. Hafifletici not: içerik pipeline'ındaki oEmbed availability check (commit eb9d8be) kısıtlı videoları önceden eliyor, fakat runtime'da bölge kısıtı/sonradan kaldırılma durumunda kullanıcı yine sessiz siyah ekranda kalır — bulgunun runtime iddiasını çürütmez.

</details>

### 🟠 HIGH · Accessibility sıfır: hiç accessibilityLabel yok, Dynamic Type tamamen devre dışı — ✅ bağımsız doğrulandı

ios-native/EnglishLearning altında `accessibility`, `dynamicTypeSize` veya `@ScaledMetric` için tek bir eşleşme bile yok (grep boş dönüyor). Tüm metinler 320 adet sabit `.font(.system(size:))` çağrısıyla kurulmuş (Theme.Font token'ları da `.system(size:)` sabit boyut döndürüyor — metric olarak text style'a bağlanmamış), yani kullanıcının Dynamic Type ayarı hiçbir ekranı etkilemiyor. İkon-only butonların (geri chevron'u, cinema toggle, mute, replay, tab bar itemları) hiçbirinde VoiceOver etiketi yok — VoiceOver kullanıcısı 'button' dışında bir şey duymaz. Ek olarak textMuted (#5E6B8A) rengi #080A14 zemin üzerinde ~3.7:1 kontrastta ve uygulama boyunca 9-11pt caps etiketlerde kullanılıyor; WCAG AA küçük metin eşiği 4.5:1'in altında.

**Kanıt:** `grep -rn "accessibility\|dynamicTypeSize" EnglishLearning/` → 0 sonuç; `.font(.system` 320 kez, Theme.Font 83 kez; Theme.swift:50 textMuted=#5E6B8A (koyu zemine ~3.7:1).

**Dosyalar:** `ios-native/EnglishLearning/DesignSystem/Theme.swift:124-143`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:326-338`, `ios-native/EnglishLearning/Features/MainTabView.swift:145-182`, `ios-native/EnglishLearning/DesignSystem/Theme.swift:50`

**Öneri:** 1) Theme.Font fonksiyonlarını `UIFontMetrics`/`.system(.body)` relative olacak şekilde değiştirin (ör. `Font.system(.body, design:.default).weight(...)` + @ScaledMetric). 2) İkon-only her butona `.accessibilityLabel(...)` ekleyin; karaoke satırına `.accessibilityElement(children: .combine)` verin. 3) textMuted'ı küçük punto etiketlerde bir ton açın (ör. #7C8BAE) veya punto/weight artırın.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. (1) ios-native/EnglishLearning altında 'accessib', dynamicTypeSize, @ScaledMetric, relativeTo:, preferredFont için grep 0 sonuç — hiçbir accessibility API'si kullanılmıyor. (2) .font(.system 322 kez (bulgu 320 demiş, ihmal edilebilir); Theme.swift:124-143'teki tüm Font token'ları sabit .system(size:) döndürüyor, text style'a bağlı değil → Dynamic Type tamamen etkisiz. (3) ClipPlayerView.swift:327-338 geri chevron'u ve :358-373 cinema toggle'ı ikon-only, accessibilityLabel yok. (4) Kontrast hesabı birebir tutuyor: textMuted #5E6B8A (Theme.swift:50) / background #080A14 = 3.71:1; kart zemini #111827 üzerinde 3.33:1 (daha kötü); textMuted 90 yerde, 9-11pt heavy caps etiketlerde de kullanılıyor (HomeView.swift:350, LearningPathView.swift:363). Küçük düzeltmeler: tab bar itemlarında görünür Text label var (MainTabView.swift:155), yani tam ikon-only değiller (ama isSelected trait'i yok); ayrıca bazı SF Symbol'lar için iOS otomatik İngilizce etiket türetebilir — 'sadece button duyar' ifadesi hafif abartı, fakat açık VoiceOver etiketi sıfır olduğu gerçeği değişmiyor. Bulgunun özü ve high şiddeti yerinde.

</details>

### 🟠 HIGH · Localization mimarisi çökmüş: 6 dillik sözlük var ama ekranlar hardcoded Türkçe + İngilizce karışımı — ✅ bağımsız doğrulandı

Services/Localization.swift 6 dil (en/tr/es/ar/zh/pt) için manuel sözlük tutuyor ve onboarding dil seçtiriyor; ama aktif ürün ekranlarının neredeyse tamamı metni hardcode ediyor: VideoFeedView 'Bir set seç, başla.'/'SETLER', SetDetailView 'Sete Başla'/'BİTİRDİN'/'Setten çık', PatternsView 'CÜMLE KALIPLARI', PatternReelsView 'Akış hazırlanıyor', VocabFeedView 'Bir set izleyince akış dolacak'... Aynı anda ClipPlayerView aynı ekranda İngilizce chrome kullanıyor: 'Scene 1 of 3' (satır 346), 'Replay line'/'Loop' (1203-1206), 'Listening…' (548) — banner ise Türkçe ('Devam', 'Ekle'). CinemaPlayerView aynı bilgiyi 'Sahne 1 / 3' (218) diye Türkçe basıyor: tek üründe iki dilde aynı etiket. ErrorState de 'Something went wrong'/'Try again' İngilizce hardcoded (LoadingStates.swift:100,109) — halbuki 'errorLoading'/'tryAgain' anahtarları sözlükte mevcut. Bonus: ClipPlayerView:1015 'YENI KELIME' — Türkçe noktalı İ eksik ('YENİ KELİME' olmalı). String Catalog/Localizable.strings hiç yok.

**Kanıt:** ClipPlayerView.swift:346 `Text("Scene \(index + 1) of \(totalClips)...")` vs CinemaPlayerView.swift:218 `Text("Sahne \(index + 1) / \(clips.count)")`; ClipPlayerView.swift:1015 `Text("YENI KELIME")`; `find . -name "*.strings" -o -name "*.xcstrings"` → 0 sonuç.

**Dosyalar:** `ios-native/EnglishLearning/Services/Localization.swift:26-105`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:346`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:1015`, `ios-native/EnglishLearning/Features/ClipPlayer/CinemaPlayerView.swift:218`, `ios-native/EnglishLearning/Components/LoadingStates.swift:100-110`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:80`

**Öneri:** Kısa vadede ürün kararını netleştirin: TR-only POC ise Localization.swift'i ve dil seçimini kaldırıp tüm metinleri tek yerden (TR string enum'u) yönetin; çok dillilik hedefse String Catalog'a (xcstrings) geçin, tüm hardcoded literalleri anahtarla değiştirin. Her durumda ClipPlayer/Cinema chrome'daki EN/TR karışımını ve 'YENI KELIME' yazımını düzeltin, ErrorState'i t() üzerinden besleyin.

<details><summary>Doğrulayıcı notu</summary>

Tüm kanıt satırları birebir doğrulandı: Localization.swift 6 dil sözlüğü tutuyor (bundle(for:) satır 15-24; errorLoading/tryAgain anahtarları satır 70-71 ve TR karşılıkları 148-149 mevcut) ama ClipPlayerView.swift:346 "Scene X of Y", 548 "Listening…", 1203/1206 "Replay line"/"Loop" İngilizce iken aynı dosyada 1050 "Ekle"/"Eklendi" ve 1066 "Devam" Türkçe; CinemaPlayerView.swift:218 aynı etiketi "Sahne X / Y" diye Türkçe basıyor. LoadingStates.swift:100 "Something went wrong" ve 109 "Try again" hardcoded. VideoFeedView.swift:76,80 ("SETLER", "Bir set seç, başla."), SetDetailView.swift:95/657/756, PatternsView.swift:45, PatternReelsView.swift:56, VocabFeedView.swift:47/107 hardcoded Türkçe. ios-native altında .strings/.xcstrings dosyası 0 adet. Tek küçük sapma: "YENI KELIME" satır 1015 değil 1014 (noktalı İ hatası aynen mevcut). Ek kanıt: t.t(...) sadece MainTabView/Onboarding/DailyTasks/Profile gibi çevre ekranlarda kullanılıyor; çekirdek ürün akışı (set feed, oynatıcılar, patterns, vocab) tamamen hardcode — Türkçe dışı dil seçen kullanıcı çekirdek deneyimde Türkçe görür, "high" severity yerinde.

</details>

### 🟠 HIGH · PatternReelCard ile VocabReelCard neredeyse birebir kopya (~450'şer satır) — ✅ bağımsız doğrulandı

PatternReelsView.swift:197-675 ve VocabFeedView.swift:126-616 aynı kartın iki kopyası: videoBlock (16:9 frame + allowsHitTesting(false) + loop seek), üst/alt gradient overlay'ler, topMeta, actionStack + actionButton (aynı 54pt genişlik, aynı shadow değerleri), manuallyPaused/pause göstergesi, onChange(of: isActive) seek+async play mantığı, sentenceFlow/wordCell/phraseCell/makeCells fonksiyonları — satır satır aynı. Fark yalnızca hedef kelime vurgusu ve splitContraction hücresi. Ayrıca feed konteynerleri (GeometryReader + LazyVStack + scrollTargetBehavior(.paging) + visibleId snap) da PatternReelsView:65-125 ve VocabFeedView:56-94'te kopya. Bir player davranış düzeltmesi (ör. loop kaçağı, komut coalescing) iki dosyada ayrı ayrı yapılmak zorunda; şimdiden ıraksamış durumdalar (PatternReelCard'da okunuş satırı var, VocabReelCard'da yok).

**Kanıt:** İki dosyada aynı imzalı fonksiyonlar: `videoBlock` (PatternReels 293-323 / VocabFeed 245-290), `actionButton(icon:label:tint:action:)` (400-420 / 428-448), `makeCells()` (495-528 / 503-529), `wordCell` (530-584 / 531-568), `phraseCell` (634-674 / 575-615) — gövdeler karakter bazında hemen hemen özdeş.

**Dosyalar:** `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:197-675`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:126-616`

**Öneri:** Tek bir `ReelCard`/`ReelPlayerView` bileşeni çıkarın: `configuration` (target word var mı, kontraksiyon split var mı, okunuş var mı) parametreleriyle. Feed konteynerini de `VerticalReelFeed<Item, Card>` generic'ine alın. Karaoke hücre render'ı için tek `KaraokeWordCell` kullanın.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. İddia edilen tüm satır aralıkları birebir tutuyor: videoBlock (PatternReelsView.swift:293-323 / VocabFeedView.swift:245-290), actionButton (400-420 / 428-448), makeCells (495-528 / 503-529), wordCell (530-584 / 531-568), phraseCell (634-674 / 575-615), gradient overlay'ler (221-235 / 162-176), pause göstergesi (262-268 / 208-214), onChange(of: isActive) seek+async-play (278-288 / 224-240) ve feed konteynerleri (65-84+121-125 / 56-75+89-94) kopya. Ek kanıt: ıraksama bulguda yazandan daha ileri — Pattern wordCell'deki FlowLayout truncation fix'i (.fixedSize'ı .scaleEffect'ten önce uygulama, PatternReelsView.swift:553-559) VocabFeedView.swift:553-557'deki wordCell'e taşınmamış; ayrıca @Binding coalescing'i açıklayan kritik yorum yalnızca Vocab kopyasında (224-236) var. Tek nüans: 'satır satır aynı' ifadesi wordCell/topMeta/bottomBlock için hafif abartılı (yapı aynı, detay ıraksamış); bulgu bu farkları zaten belirttiği için sonuç değişmiyor.

</details>

### 🟡 MEDIUM · Contraction map + 3 renk yapı paleti + karaoke render mantığı 5 ayrı yerde kopyalanmış

56 girişli contractionMap ve displayText/splitTrailingPunctuation/matchCase/areColorsEqual dörtlüsü hem ClipPlayerView.swift:797-874 hem CinemaPlayerView.swift:472-510'da birebir kopya (CinemaPlayerView:429-433'teki yorum bunu itiraf ediyor: 'the cost is one duplicated table that drifts together'). 3 renkli cümle-yapısı paleti (0x5BA3DD/0x6BC084/0xB093D2) — uygulamanın ÇEKİRDEK öğretim dili — Theme'de token değil; ClipPlayerView:718-724, CinemaPlayerView:421-427, PatternReelsView:540-544, VocabFeedView:542-547 ve VocabWordDetailView:350-356'da ayrı ayrı hardcoded. BucketKind enum'u da 3 kez tanımlı. PatternReelsView ayrıca kendi contractionSplits tablosunu (477-488) tutuyor — üçüncü bir kontraksiyon sözlüğü. Palette değişikliği (geçmişte caramel→sage geçişi yapılmış) 5 dosyada elle senkron gerektiriyor.

**Kanıt:** CinemaPlayerView.swift:429-433: "Same contraction-expansion logic as ClipPlayerView... the cost is one duplicated table that drifts together with the source." — kopya bilinçli bırakılmış. Hex 0x5BA3DD 5 dosyada geçiyor.

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:718-874`, `ios-native/EnglishLearning/Features/ClipPlayer/CinemaPlayerView.swift:421-510`, `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:477-544`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:542-547`, `ios-native/EnglishLearning/Features/Vocab/VocabWordDetailView.swift:350-356`

**Öneri:** `SentenceStructure` adında tek bir dosya: `enum Bucket { case subject, aux, rest; var color: Color }` (Theme'e bağlı), `ContractionLexicon` (tek map) ve `KaraokeTextBuilder` (AttributedString üretimi). Tüm view'lar bunu tüketsin. areColorsEqual'daki `String(describing:)` karşılaştırma hack'i de (ClipPlayerView:785-790) isActive bool'unu doğrudan geçirerek ortadan kalkar.

### 🟡 MEDIUM · ClipPlayerView 1371 satırlık god-view: playback denetleyicisi, karaoke motoru ve UI tek struct'ta, ViewModel yok

ClipPlayerView 13 @State + 9 callback parametresiyle player durum makinesi (auto-advance advancedFromClip, loop, hız döngüsü, starter-pause, cinema senkronu), karaoke renderer'ı, kontraksiyon sözlüğü ve transport UI'ını tek view'da barındırıyor; hiçbir mantık test edilebilir değil (TurkishPhoneticsTests dışında view logic testi yok). SetDetailView.swift de 940 satır: SetPlayerView'ın 4-durumlu phase makinesi + cinema/portrait pozisyon senkronu tamamen @State'lerle view içinde (278-529). Buna karşın basit list ekranları (VideoFeedView, VocabFeedView...) düzenli ViewModel'lere sahip — mimari tutarsız: en karmaşık ekranlar en az yapılandırılmış olanlar. LessonDetailView.swift 939 satır ve 8 ayrı bileşen struct'ı tek dosyada.

**Kanıt:** wc -l: ClipPlayerView 1371, SetDetailView 940, LessonDetailView 939. ClipPlayerView.swift:52-79 arası 13 @State tanımı; SetPlayerView phase enum'u SetDetailView.swift:286-291 view içinde.

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:52-113`, `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:278-529`, `ios-native/EnglishLearning/Features/Lesson/LessonDetailView.swift`

**Öneri:** `ClipPlaybackController: ObservableObject` çıkarın (currentTime, isPlaying, index, loop, speed, advance mantığı + komut gönderimi) — böylece auto-advance/loop birimleri test edilir hale gelir. SetPlayerView'ın phase makinesini de `SetPlaybackViewModel`e taşıyın. Dosyaları bileşen başına bölün (SectionCards.swift, StarterBanner.swift, NextUpOverlay.swift...).

### 🟡 MEDIUM · Her reel kartı kendi WKWebView'ını mount ediyor; 220ms JS ticker'ı hiç temizlenmiyor, dismantleUIView yok

VocabFeedView/PatternReelsView LazyVStack'inde görünür kartın komşuları da mount kalır — her biri tam teşekküllü bir WKWebView + YouTube IFrame player. makeHTML'deki `ticker=setInterval(...,220)` (YouTubePlayerView.swift:92) onReady'de başlar ve player pause olsa bile durmaz: mount edilmiş her kart 220ms'de bir JS→Swift köprü mesajı pompalamaya devam eder (pause yalnızca getCurrentTime değerini sabitler, mesajları değil). YouTubePlayerView'da `static func dismantleUIView` yok: view söküldüğünde `removeScriptMessageHandler(forName:"ytBridge")` çağrılmıyor, `web.stopLoading()` yapılmıyor, ticker clearInterval edilmiyor. WKUserContentController coordinator'ı strong tuttuğu için temizlik tamamen WKWebView'ın dealloc zamanlamasına kalıyor. 80 öğeli feed'de hızlı kaydırma = eşzamanlı birden çok canlı YouTube player → bellek/pil/ağ maliyeti ve arka planda çalan ses riski.

**Kanıt:** YouTubePlayerView.swift:92 `ticker=setInterval(function(){...},220)` — hiçbir yerde clearInterval yok; dosyada `dismantleUIView` ve `removeScriptMessageHandler` geçmiyor. VocabFeedView.swift:58 LazyVStack her karta ayrı YouTubePlayerView veriyor (251).

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:31-51`, `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:92`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:56-75`

**Öneri:** 1) `static func dismantleUIView(_:coordinator:)` ekleyip message handler'ı kaldırın, `loadHTMLString("")` ile içeriği boşaltın. 2) Ticker'ı yalnızca PLAYING state'inde çalıştırın (onStateChange'de start/stop). 3) Reels'te tek bir paylaşılan player instance'ı kullanıp kartlar arasında videoId swap etmeyi düşünün (TikTok mimarisi) — bu, yukarıdaki updateUIView düzeltmesini gerektirir.

### 🟡 MEDIUM · appState.isVideoPlayerActive global bayrağı 7 view'dan onAppear/onDisappear ile itiliyor — yarış koşulu için watchdog hack'i bile yazılmış

Tab bar'ı gizleyen `isVideoPlayerActive` tek bir Bool ve VideoWatchView, SetPlayerView, PatternReelsView, PatternFlowView, CinemaPlayerView, VocabContextPlayerView, VocabWordDetailView kendi yaşam döngülerinde set/reset ediyor. İç içe push'larda (PatternFlowView → PatternReelsView) parent'ın onDisappear'ı child'ın onAppear'ından SONRA tetiklenip bayrağı false'a çekiyor; PatternReelsView bunu düzeltmek için `onChange(of: appState.isVideoPlayerActive)` içinde bayrağı geri true'ya zorlayan bir 'watchdog' taşıyor (109-113) — global mutable state'in tipik semptomu. Yeni bir player ekranı ekleyen herkes bu tuzağa yeniden düşecek.

**Kanıt:** PatternReelsView.swift:104-113 yorumu: "Parent PatternFlowView's own onDisappear flips the flag back to false... that race leaves the floating tab bar visible behind us. Watch the flag and re-assert true..." — yarış koşulu kodda belgelenmiş.

**Dosyalar:** `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:100-117`, `ios-native/EnglishLearning/Features/MainTabView.swift:76-82`, `ios-native/EnglishLearning/State/AppState.swift:31`

**Öneri:** Boolean yerine sayaç/set tabanlı bir model kullanın (ör. `activePlayerScreens: Set<UUID>` + `.trackVideoPlayerActive()` view modifier'ı; boş olmayan set = bar gizli). Veya SwiftUI'nin PreferenceKey mekanizmasıyla 'bu ekran tab bar istemiyor' bilgisini aşağıdan yukarı taşıyın — onAppear/onDisappear sıralama yarışları tamamen ortadan kalkar.

### 🟡 MEDIUM · OrientationLock refcount'suz: cinema'da video geçişinde maske anlık portrait'e düşüyor

OrientationLock tek global mask ve LandscapeLock modifier'ı onDisappear'da koşulsuz `.portrait` yazıyor. SetPlayerView'ın fullScreenCover'ında hem sarmalayıcı ZStack'te `.lockToLandscape()` (SetDetailView.swift:402) hem CinemaPlayerView gövdesinde `.lockToLandscape()` (CinemaPlayerView.swift:130) var. Video ilerleyince `.id(currentVideo.id)` CinemaPlayerView'ı remount eder: eski instance'ın onDisappear'ı `set(.portrait)` çağırır (cover hâlâ ekranda!), yeni instance onAppear'da tekrar `set(.landscape)` der. Arada `requestGeometryUpdate` tetiklendiği için cihaz geçiş anında portrait'e dönmeye çalışabilir; clips boşken (yükleme aralığı) CinemaPlayerView hiç mount olmadığından pencere daha da uzar. Ayrıca CinemaPlayerView içindeki lock, cover kapatıldığında iki kez portrait yazar (zararsız ama tasarımın kırılganlığını gösterir).

**Kanıt:** OrientationLock.swift:50-56 LandscapeLock onDisappear → `set(.portrait)` koşulsuz; SetDetailView.swift:398 `.id(currentVideo.id)` remount + 402 `.lockToLandscape()` ve CinemaPlayerView.swift:130'da ikinci `.lockToLandscape()` — aynı global maskeye iki yazar.

**Dosyalar:** `ios-native/EnglishLearning/App/OrientationLock.swift:47-57`, `ios-native/EnglishLearning/Features/ClipPlayer/CinemaPlayerView.swift:130`, `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:380-403`

**Öneri:** OrientationLock'u push/pop (sayaç) semantiğine geçirin: `push(.landscape) -> token`, `pop(token)` — en az bir landscape isteği varken maske landscape kalsın. CinemaPlayerView içindeki `.lockToLandscape()`'i kaldırıp kilidi yalnızca cover sarmalayıcısında tutun (tek sahiplik).

### 🟡 MEDIUM · MainTabView switch'i tab değişiminde tüm ekran state'ini yok ediyor; TabView kullanılmıyor, deep link desteği sıfır

MainTabView, `Group { switch selected { ... } }` ile tab içeriğini değiştiriyor (57-68). SwiftUI'de switch dalları farklı yapısal kimlik taşıdığından tab değiştirmek önceki tab'ın view ağacını tamamen söker: NavigationStack path'i, scroll pozisyonu, @StateObject ViewModel'ler (VideoFeedViewModel, VocabViewModel...) sıfırlanır ve her tab dönüşünde veriler yeniden fetch edilir (VideoFeedView.task her mount'ta çalışır). Kullanıcı SetDetail'de 3 seviye derindeyken Vocab'a bakıp dönerse listenin başına düşer. Ayrıca uygulamada `onOpenURL`, URL scheme veya universal link işleme hiç yok — bildirim/pazarlama linkiyle belirli bir sete/kelimeye açılmak imkânsız; TestFlight sonrası büyüme için engel.

**Kanıt:** MainTabView.swift:57-68 `switch selected` — dallar arasında geçiş yapısal kimliği değiştirir; `grep -rn onOpenURL` → 0 sonuç. Her tab kökü kendi NavigationStack'ini kuruyor (VideoFeedView:31, VocabView:84, PatternsView:10, ProfileView:7) ve path dışarıdan yönetilemiyor.

**Dosyalar:** `ios-native/EnglishLearning/Features/MainTabView.swift:53-88`, `ios-native/EnglishLearning/App/EnglishLearningApp.swift:12-19`

**Öneri:** Standart `TabView(selection:)` + `.toolbar(.hidden, for: .tabBar)` üzerine custom bar overlay'i koyun (TabView offscreen tab'ların state'ini korur), veya en azından her tab'ı sürekli mount edip `opacity/zIndex` ile değiştirin. Navigasyonu `NavigationPath` tabanlı bir Router'a toplayıp `.onOpenURL` ile `app://set/{id}`, `app://word/{id}` rotalarını ekleyin.

### 🟡 MEDIUM · Safe area yerine hardcoded 56pt üst padding — farklı çentik/Dynamic Island cihazlarda kayma

Full-screen ekranlar `.ignoresSafeArea()` yaptıktan sonra üst çubuğu sabit `.padding(.top, 56)` ile konumlandırıyor: PatternReelsView.swift:91, PatternFlowView.swift:90, VocabFeedView topMeta `.padding(.top, 56)` (184), VideoFeedView heroHeader (58). iPhone SE (status bar 20pt) ile 15 Pro Max (59pt) arasında bu değer ya içeriği status bar altına sokar ya da gereksiz boşluk bırakır. Benzer şekilde alt boşluklar 140/150pt magic number ve FloatingTabBar'ın 78pt yüksekliği + padding'ine elle bağlanmış (VocabFeedView.swift:192-196 yorumu bu bağımlılığı açıkça sayarak yazmış: '78pt bar + 10pt padding + ~34pt safe-area'). Tab bar boyutu değişirse 6+ yerde magic number güncellenmeli.

**Kanıt:** PatternReelsView.swift:91 `.padding(.top, 56)`; VocabFeedView.swift:192-196 yorum: "The MainTabView's FloatingTabBar covers roughly the bottom 122pt (78pt bar + 10pt padding + ~34pt safe-area)" + `.padding(.bottom, 140)`.

**Dosyalar:** `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:87-92`, `ios-native/EnglishLearning/Features/Patterns/PatternFlowView.swift:86-92`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:179-197`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:55-68`

**Öneri:** Üst çubuklar için `.safeAreaInset(edge: .top)` veya GeometryReader'ın `safeAreaInsets.top`'unu kullanın. Tab bar yüksekliğini tek bir `Theme.Layout.tabBarClearance` sabitine ya da tercihen `.safeAreaInset(edge: .bottom)` ile MainTabView'dan otomatik aktarın.

### 🟡 MEDIUM · Design token'lar bypass ediliyor: Features içinde 70 adet Color(hex:) — çoğu zaten Theme'de tanımlı renklerin kopyası

Theme.Color token seti düzgün kurulmuş ama Features katmanında 8 dosyada 70 adet ham `Color(hex:)` çağrısı var ve bunların çoğu mevcut token'ların literal kopyası: ClipPlayerView'da `Color(hex: 0x080A14)` (=Theme.Color.background, satır 156), `0x8577FF` (=primary, 1127/1239), `0x94A0C4` (=textSecondary, 1148), `0x1E2A42` (=border, 1151), `0x111827` (=backgroundCard, 1150), `0x222D47` (=backgroundSurface, 1167), `0x5E6B8A` (=textMuted, 492). Gloss rengi `0x9CABCC` ve amber `0xE0B07A`/`0xFFB347` gibi tekrar eden ama Theme'de OLMAYAN renkler de 4+ dosyada dağınık. Tipografide durum daha kötü: 320 `.font(.system(...))` vs 83 `Theme.Font` — token'lar istisna, kaçak norm olmuş. Spacing'de Theme.Space neredeyse hiç kullanılmıyor (9, 13, 14, 18, 22, 56... serbest değerler).

**Kanıt:** `grep -rn "Color(hex:" Features/` → 70 eşleşme / 8 dosya; ClipPlayerView.swift:156 `Color(hex: 0x080A14)` = Theme.swift:41 background ile aynı değer; `.font(.system` 320 vs `Theme.Font` 83.

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:156`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:1127-1151`, `ios-native/EnglishLearning/DesignSystem/Theme.swift:41-55`, `ios-native/EnglishLearning/Features/MainTabView.swift:118`

**Öneri:** 1) Birebir kopya hex'leri mekanik olarak token'a çevirin (basit sed geçişi). 2) Eksik semantik token'ları ekleyin: `Theme.Color.karaokeGloss (0x9CABCC)`, `translationAmber (0xE0B07A)`, `targetUnderline (0xFFB347)` ve 3 yapı rengi. 3) SwiftLint'e `no_raw_color_hex` custom rule ekleyip Features altında Color(hex:)'i yasaklayın.

### 🟡 MEDIUM · Aktif nav grafiğine bağlı olmayan ~2.500+ satır legacy ekran hâlâ derlenip TestFlight'a gidiyor

MainTab.displayed = [.patterns, .home(VideoFeedView), .vocab, .profile]. Grep ile doğrulandı: HomeView, CoursesView, DailyTasksView, ScenesLandingView, LearningPathView, VideoWatchView, VocabReviewView, VocabSetView hiçbir aktif view'dan instantiate edilmiyor (LessonDetailView yalnızca kendisi de erişilemeyen HomeView'dan çağrılıyor). MainTabView'da `.courses/.play` legacy case'leri de duruyor (10-11, 63-67). Bu ekranlar Feynman pivot'u ÖNCESİ davranışlar içeriyor: LessonDetailView.performCurrentTask test adımını soru sormadan `testPassed = true; testScore = 100` yazıyor (384-387) ve XP ekliyor — 'gamification yok' felsefesiyle çelişen XP/streak kodu canlı üründe derli. Ölü kod, denetim/refactor maliyetini şişiriyor (örn. bu incelemedeki LessonDetailView 939 satırın tamamı fiilen ölü). ClipPlayerView'daki `karaokeAttributed` (958-1000) ve `checkStarterPause` (1321-1342) fonksiyonları da hiç çağrılmıyor.

**Kanıt:** `grep -rn "HomeView(\|CoursesView(\|DailyTasksView(\|ScenesLandingView(\|VideoWatchView(\|VocabReviewView(" Features/ App/` → instantiation yok; `grep -rn karaokeAttributed` yalnızca tanımı buluyor (ClipPlayerView.swift:958). LessonDetailView.swift:384-386 `$0.testPassed = true; $0.testScore = 100` — test UI'sı olmadan.

**Dosyalar:** `ios-native/EnglishLearning/Features/MainTabView.swift:46`, `ios-native/EnglishLearning/Features/Home/HomeView.swift`, `ios-native/EnglishLearning/Features/Lesson/LessonDetailView.swift:383-387`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:958-1000`, `ios-native/EnglishLearning/Features/Home/VideoWatchView.swift`

**Öneri:** Legacy ekranları ya ayrı bir 'Legacy' target/feature-flag'e taşıyın ya da git geçmişine güvenip silin (kod git'te durur). Periodically `periphery scan` gibi bir dead-code aracı çalıştırın. MainTab'daki .courses/.play case'lerini kaldırın.

### 🟡 MEDIUM · 8 ViewModel aynı isLoading/errorMessage/load kalıbının kopyası; hata mesajı olarak ham error.localizedDescription gösteriliyor

VideoFeedViewModel, VideoWatchViewModel, PatternReelsViewModel, VocabFeedViewModel, VocabViewModel, VocabWordDetailViewModel, LessonDetailViewModel, LessonClipsViewModel — hepsi `@Published items/isLoading/errorMessage` + `load(forceRefresh:)` şablonunun elle kopyası. Daha önemlisi hepsi `error.localizedDescription`'ı doğrudan ErrorState'e basıyor: kullanıcı 'The operation couldn't be completed. (NSURLErrorDomain error -1009.)' gibi İngilizce/teknik metin görüyor (LessonDetailView.swift:15, VideoFeedView.swift:17, VocabFeedView.swift:22...). Offline/timeout/server ayrımı yok, kullanıcı-dostu Türkçe mesaj yok.

**Kanıt:** Dört dosyada birebir aynı gövde: `if !forceRefresh { isLoading = true }; errorMessage = nil; do { ... } catch { self.errorMessage = error.localizedDescription }; isLoading = false`.

**Dosyalar:** `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:5-21`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:5-26`, `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:5-27`, `ios-native/EnglishLearning/Features/Lesson/LessonDetailView.swift:3-19`

**Öneri:** Generic bir `LoadableState<T>` (idle/loading/loaded/failed(AppError)) + `AppError: LocalizedError` katmanı yazın; URLError.notConnectedToInternet → 'İnternet bağlantını kontrol et' gibi eşlemeleri tek yerde yapın. ViewModel'ler `func fetch() async throws -> T` sağlayan tek bir base'e insin.

### 🟡 MEDIUM · Info.plist'te NSAllowsArbitraryLoads=true — ATS tamamen kapalı

App Transport Security istisnasız kapatılmış (`NSAllowsArbitraryLoads: true`). Uygulama zaten HTTPS API + youtube-nocookie kullanıyor; bu bayrak muhtemelen geliştirme kalıntısı. Tüm HTTP bağlantılarına izin vermek MITM yüzeyini açar ve App Store review'da gerekçe istenmesine yol açabilir.

**Kanıt:** Info.plist: `<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><true/></dict>`.

**Dosyalar:** `ios-native/EnglishLearning/Resources/Info.plist`

**Öneri:** NSAllowsArbitraryLoads'u kaldırın; gerçekten HTTP gereken tek domain varsa `NSExceptionDomains` ile daraltın. WKWebView içerikleri için gerekiyorsa `NSAllowsArbitraryLoadsInWebContent` daha dar bir istisnadır.

### ⚪ LOW · Loading/empty state metinleri ekrandan ekrana tutarsız; EmptyState bileşeni yalnız 1 ekranda kullanılıyor

LoadingState/ErrorState bileşenleri güzelce merkezileştirilmiş ve çoğu ekranda kullanılıyor (artı). Ama etiketler tutarsız: bazı ekranlar `appState.t.t("loading")` (VideoFeedView:36, LessonClipsView:58), bazıları hardcoded 'Akış hazırlanıyor' (VocabFeedView:47, PatternReelsView:56), 'Bağlamlar yükleniyor' (VocabWordDetailView:242), 'Fetching clips…' İngilizce (LessonClipsView:238). Ortak `EmptyState` bileşeni yalnızca LessonClipsView'da kullanılırken VocabFeedView (102-117) ve PatternReelsView (172-187) kendi el yapımı emptyState'lerini kurmuş. DebugClipPlayerLauncher düz `ProgressView()` kullanıyor (EnglishLearningApp.swift:64).

**Kanıt:** EmptyState referansı yalnızca LessonClipsView.swift:62,242'de; VocabFeedView.swift:102 `private var emptyState` ve PatternReelsView.swift:172 `private var emptyState` ayrı implementasyonlar.

**Dosyalar:** `ios-native/EnglishLearning/Components/LoadingStates.swift:50-84`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:102-117`, `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:172-187`, `ios-native/EnglishLearning/Features/Lesson/LessonClipsView.swift:238`

**Öneri:** Loading etiketlerini tek anahtar setine bağlayın; reels'in koyu-tema empty durumları için EmptyState'e bir `variant: .dark` parametresi ekleyip el yapımı kopyaları silin.

### ⚪ LOW · cleanedTitle / ThumbnailMosaic / difficultyLabel aynı dosya(lar) içinde bile kopyalanmış

`cleanedTitle(_:)` regex temizleyicisi SetDetailView.swift'te İKİ kez (260-268 SetVideoRow'da ve 803-811 NextUpOverlay'de) birebir aynı; thumbnail mozaiki hem SetDetailView.ThumbnailMosaic (165-189) hem VideoFeedView.thumbnailMosaic (148-168) olarak kopya; difficultyLabel/difficultyTint switch'leri SetDetailView (142-160) ve VideoFeedView (201-219)'da aynı. AsyncImage'ın `case .success/.empty/.failure/@unknown` boilerplate'i 4 yerde tekrar ediyor. Bunlar model/extension seviyesine alınmalı: örn. `PocVideo.cleanTitle`, `VideoSet.difficultyLabelTr`.

**Kanıt:** SetDetailView.swift:260 ve 803'te aynı `private func cleanedTitle(_ raw: String)` gövdesi; VideoFeedView.swift:201-219 ile SetDetailView.swift:142-160 aynı switch.

**Dosyalar:** `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:260-268`, `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:803-811`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:148-168`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:201-219`

**Öneri:** cleanedTitle'ı `String` ya da `PocVideo` extension'ına, difficulty eşlemelerini `VideoSet` extension'ına taşıyın; `RemoteThumbnail(url:)` adında tek bir AsyncImage sarmalayıcısı yazın.

### ⚪ LOW · Dark-mode tek yönlü: renkler adaptive değil, sistem light modu ve OLED dışı senaryolar yok sayılmış

Uygulama kökten `.preferredColorScheme(.dark)` zorluyor (EnglishLearningApp.swift:16) ve tüm Theme renkleri sabit hex — Asset Catalog'da adaptive color yok. Dark-only bir ürün kararı POC için savunulabilir; ancak alt view'larda gereksiz tekrar `preferredColorScheme(.dark)` çağrıları var (ClipPlayerView:164, CinemaPlayerView:125, PatternReelsView:57,94, VocabFeedView:78) ve Info.plist `UIUserInterfaceStyle` yerine runtime zorlaması kullanıldığı için launch screen/system alert'ler light kalabiliyor. Ayrıca `UIStatusBarStyle` + `UIViewControllerBasedStatusBarAppearance=false` eski yöntem.

**Kanıt:** EnglishLearningApp.swift:16 `.preferredColorScheme(.dark)`; Info.plist'te `UIUserInterfaceStyle` anahtarı yok; ClipPlayerView.swift:164, CinemaPlayerView.swift:125, PatternReelsView.swift:57 ve 94'te tekrar eden preferredColorScheme(.dark).

**Dosyalar:** `ios-native/EnglishLearning/App/EnglishLearningApp.swift:16`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:164`, `ios-native/EnglishLearning/Resources/Info.plist`

**Öneri:** Info.plist'e `UIUserInterfaceStyle = Dark` ekleyin (tek satır, tüm UIKit yüzeylerini kapsar), dağınık preferredColorScheme çağrılarını kaldırın. İleride light tema istenirse Theme renklerini Asset Catalog semantic color'a taşıyın.

### ⚪ LOW · RuleSectionCard'da dört dalı da aynı sonucu üreten no-op ternary zinciri

LessonDetailView.swift:647-656'daki iç içe ternary, idx==0&&last / idx==0 / idx==last dallarının ÜÇÜNDE de aynı `RoundedRectangle(cornerRadius: 8).fill(backgroundElevated)` üretiyor; tek fark ortadaki satırların radius 0 olması — ve 664'teki `.clipShape(RoundedRectangle(cornerRadius: 8))` zaten tüm grubu kırptığı için per-satır radius görsel olarak tamamen anlamsız. 10 satırlık okunmaz kod, `Rectangle().fill(Theme.Color.backgroundElevated)` + gruba clipShape ile 1 satıra iner. (Ekran legacy olsa da dosya hâlâ derleniyor.)

**Kanıt:** LessonDetailView.swift:648-654: idx==0&&last, idx==0, idx==last dallarının üçü de `RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.Color.backgroundElevated)` döndürüyor; 664'te `.clipShape(RoundedRectangle(cornerRadius: 8...))` mevcut.

**Dosyalar:** `ios-native/EnglishLearning/Features/Lesson/LessonDetailView.swift:647-664`

**Öneri:** Ternary zincirini silip satır arka planını düz `Theme.Color.backgroundElevated` yapın; köşeleri dıştaki clipShape'e bırakın.

### ⚪ LOW · NextUpOverlay geri sayımı 50ms'lik Timer ile @State güncelliyor

5 saniyelik countdown, saniyede 20 kez `remaining -= 0.05` yazan bir `Timer.scheduledTimer` ile sürülüyor (SetDetailView.swift:782-796) — her tick tüm overlay gövdesini yeniden hesaplatıyor ve Timer closure'ı Double birikim hatasına açık. SwiftUI'de bunun idiomatik karşılığı `TimelineView(.animation)` ya da tek seferlik `withAnimation(.linear(duration: 5))` + onAppear tetiklemesidir; auto-advance için `Task.sleep` yeterli.

**Kanıt:** SetDetailView.swift:785 `Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true)` + 786-794 DispatchQueue.main.async içinde remaining azaltma.

**Dosyalar:** `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:782-801`

**Öneri:** Ring'i `withAnimation(.linear(duration: 5)) { progress = 0 }` ile animasyona, auto-advance'i `.task { try? await Task.sleep(for: .seconds(5)); onComplete() }`'e taşıyın; Timer'ı ve manuel invalidation'ı silin.

---

## Backend & Admin Panel (Next.js / Fly.io)

**Genel durum:** admin/ katmanı, tek SQLite dosyasının üstünde hem içerik-üretim paneli hem de iOS uygulamasının production API'si olarak çalışan bir Next.js uygulaması; /api/v1 altında iOS'a özel, salt-okunur ve genel olarak düzgün tasarlanmış bir yüzey var ve iOS APIClient/CacheService tarafı özenli yazılmış. Ancak en kritik sorun güvenlik: uygulama Fly.io'da tamamen auth'suz yayında ve video/klip/subtitle silen mutasyon endpoint'leri ile 'claude --dangerously-skip-permissions' spawn eden pipeline endpoint'leri internete açık — production içerik DB'si herhangi biri tarafından silinebilir durumda. İkinci büyük tema operasyonel kırılganlık: kod içindeki şema gerçek DB'nin çok gerisinde (temiz kurulumda tüm v1 500 döner), production DB'sinin nasıl güncellendiği repo'da tanımsız (local data.db ↔ Fly volume'daki admin.db çift-yazma riski) ve health check/rate limit/backup otomasyonu yok. API tarafında kontrat eksikliği (OpenAPI yok, snake_case/camelCase karışık, nullable→non-optional decode kırılganlığı) ve iOS'ta ana feed'in offline fallback'inin olmaması POC sonrası büyümede ilk ağrıyacak yerler. Bulguların çoğu POC evresi için bilinçli hız tercihleri, ama auth ve DB senkron/backup konuları TestFlight'ta gerçek kullanıcı varken artık erteleme taşımıyor.

**Korunması gereken güçlü yanlar:**
- Tüm SQL sorguları prepared statement + parametre bağlama ile yazılmış (değer enjeksiyonu yok); better-sqlite3 WAL modu ve foreign_keys açık (admin/lib/db.ts:222-224).
- iOS APIClient temiz tasarlanmış: actor tabanlı, 4xx'te retry yapmayan exponential backoff'lu retry, timeout'lar ve waitsForConnectivity ayarlı (APIClient.swift:41-47, 178-192).
- iOS istemcisi için ayrılmış /api/v1 read-only yüzeyi mevcut ve OPTIONS/CORS preflight'ları tutarlı şekilde ele alınmış; endpoint'lerde try/catch + anlamlı 404/500 yanıtları var.
- CacheService düşünülmüş TTL katmanı sunuyor (curriculum 24h, lesson 1h, clips 30m) ve cache kararları yorumlarla gerekçelendirilmiş (CacheService.swift:7-12).
- Admin sayfalarında force-dynamic doğru kullanılmış (build sırasında DB'ye bakılıp bayat statik sayfa üretilmiyor); Dockerfile'daki warmup.sh cold-start disk maliyetini akıllıca ele alıyor.
- vocab-feed'in cooldown'lu shuffle algoritması ve poc-videos'un 'healthy clip band' (WPM 80-200) agregasyonu ürün felsefesiyle uyumlu, iyi yorumlanmış backend mantığı.
- Hardcoded API key/secret bulunmadı; DB yolu ve base URL env değişkenleriyle override edilebiliyor (DATABASE_PATH, ADMIN_API_BASE_URL).

### 🔴 CRITICAL · Admin panel ve tüm yazma (mutasyon) endpoint'leri auth'suz olarak Fly.io'da public — ✅ bağımsız doğrulandı

admin/ altında hiçbir kimlik doğrulama katmanı yok: middleware.ts dosyası yok, hiçbir route'ta auth/login/token kontrolü yok (grep ile doğrulandı). Uygulama https://english-learning-admin.fly.dev adresinde herkese açık (fly.toml + Dockerfile 'COPY . .' tüm route'ları deploy ediyor) ve TestFlight'taki iOS uygulaması aynı host'u kullanıyor (APIClient.swift:37). Sonuç: internetteki herhangi biri DELETE /api/videos (deleteVideo → ON DELETE CASCADE ile tüm clip/subtitle/word verisi), DELETE /api/clips, DELETE/PUT /api/videos/[id]/subtitles, DELETE /api/tags, POST /api/review, POST /api/curriculum/[lessonId]/clips gibi çağrılarla production içerik DB'sini tamamen silebilir veya bozabilir. Ayrıca admin UI sayfaları (videos, review, curriculum, pipeline) da public.

**Kanıt:** admin/app/api/videos/route.ts:36-45 → `export async function DELETE(request)` sadece body'den id alıp deleteVideo(id) çağırıyor; lib/db.ts:755-758 deleteVideo cascade siler. Repo genelinde 'auth|login|session|x-api-key' grep'i sıfır gerçek sonuç döndü; admin/ altında middleware dosyası yok. fly.toml:10-15 http_service public.

**Dosyalar:** `admin/app/api/videos/route.ts:36`, `admin/app/api/clips/route.ts:37`, `admin/app/api/videos/[id]/subtitles/route.ts:19`, `admin/app/api/review/route.ts:4`, `admin/app/api/curriculum/[lessonId]/clips/route.ts:52`, `admin/fly.toml:10`, `ios-native/EnglishLearning/Services/APIClient.swift:37`

**Öneri:** En hızlı çözüm: Fly'da ayrı bir 'public read-only API' yüzeyi bırakıp tüm admin route'larını ve GET dışındaki tüm metodları bir auth arkasına almak. Pratik yol: Next middleware.ts ile /api/v1/* GET hariç her isteğe Authorization: Bearer <ADMIN_TOKEN> zorunluluğu (token Fly secrets ile: fly secrets set ADMIN_TOKEN=...). Panel için basic auth veya Fly'ın private networking'i (admin'i sadece WireGuard/wg üzerinden erişilebilir ikinci app olarak ayırmak) da yeterli. Uzun vadede admin ve public API'yi ayrı deployment'lara bölün.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğrulandı. admin/ altında hiçbir kimlik doğrulama yok: middleware.ts dosyası mevcut değil (find boş), next.config.ts boş, Dockerfile 'COPY . .' ile tüm route'ları deploy ediyor, auth/login/session/token/x-api-key grep'i sıfır gerçek sonuç. Public mutasyon endpoint'leri fiilen auth'suz: videos/route.ts DELETE handler'ı (export satır 35, id ile deleteVideo çağırıyor) → lib/db.ts:755 deleteVideo cascade siler; db.ts satır 32/40/49/61 clips→subtitle_lines→words ON DELETE CASCADE ve db.ts:224 'foreign_keys = ON' pragma açık olduğundan cascade gerçekten çalışıyor. Diğer endpoint'ler de teyit edildi: clips/route.ts:34 DELETE→deleteClip, tags/route.ts:15 DELETE→deleteTag, videos/[id]/subtitles/route.ts:18/38/50 PUT/POST/DELETE, review/route.ts:3 POST (targeted_lines insert/delete), curriculum/[lessonId]/clips/route.ts:27/47 POST/DELETE. fly.toml:10-15 http_service public + force_https + min_machines_running=1. iOS APIClient.swift:37 defaultBase='https://english-learning-admin.fly.dev' — TestFlight dahil tüm build'ler aynı public host'a bağlanıyor. Tek küçük kusur: açıklama DELETE handler'ı 'videos/route.ts:36' diyor ama export ifadesi aslında satır 35'te (36 gövdenin ilk satırı) — 1 satırlık offset, iddianın özünü değiştirmiyor. Critical severity yerinde.

</details>

### 🔴 CRITICAL · POST /api/pipeline ve /api/process: auth'suz endpoint 'claude --dangerously-skip-permissions' çalıştırıyor — ✅ bağımsız doğrulandı

İki endpoint de istek üzerine detached bir `claude -p <PROMPT> --dangerously-skip-permissions` süreci spawn ediyor (pipeline/route.ts:196-205, process/route.ts:222-231). Dev makinede (Mac) admin çalışırken herhangi bir web sitesi, CORS preflight gerektirmeyen basit bir POST ile http://localhost:3000/api/pipeline tetikleyebilir → izin kontrolsüz bir agent, DB'ye yazan ve yt-dlp indiren komutlar çalıştırır (drive-by tetikleme + API maliyeti + DB mutasyonu). Fly production'da ise CLAUDE_BIN (/root/.local/bin/claude, node:22-slim image'ında yok) bulunmaz; spawn'ın 'error' event'ine handler takılmadığı için ENOENT unhandled error olarak Node sürecini düşürebilir → public, auth'suz bir DoS/crash vektörü. Ayrıca PID/progress dosyaları /tmp'de, süreç yönetimi kırılgan.

**Kanıt:** pipeline/route.ts:196-205: `const child = spawn(CLAUDE_BIN, ['-p', prompt, '--dangerously-skip-permissions'], { detached: true, ... }); child.unref();` — hiçbir auth kontrolü yok, 'error' listener yok. CLAUDE_BIN = path.join(process.env.HOME, '.local', 'bin', 'claude') (route.ts:10).

**Dosyalar:** `admin/app/api/pipeline/route.ts:196`, `admin/app/api/process/route.ts:222`, `admin/app/api/pipeline/route.ts:10`

**Öneri:** Bu iki route'u production build'inden tamamen çıkarın (ör. NODE_ENV=production'da 404 döndüren guard, ya da dosyaları docker context dışına alma). Localde de en azından bir shared-secret header kontrolü ekleyin ve spawn edilen child'a `child.on('error', ...)` handler'ı takın. `--dangerously-skip-permissions` yerine kısıtlı bir allowlist ile çalıştırmayı düşünün.

<details><summary>Doğrulayıcı notu</summary>

Çekirdek kritik iddia DOĞRU ve kanıtlandı: pipeline/route.ts:165 POST ve process/route.ts POST hiçbir auth/middleware/CSRF/Origin kontrolü olmadan `spawn(CLAUDE_BIN, ['-p', prompt, '--dangerously-skip-permissions'], {detached:true})` çalıştırıyor; CLAUDE_BIN=route.ts:10 teyit. admin/app ve admin/lib altında hiçbir auth mekanizması yok (grep boş), middleware.ts yok. req.json() try/catch ile sarılı olduğundan gövdesiz simple POST bile tetikler → dev Mac'te drive-by/CSRF tetikleme geçerli.

İKİ DÜZELTME: (1) Satır referansı hatalı — process/route.ts sadece 161 satır; iddia edilen :222-231/:222 dosya DIŞINDA. Gerçek spawn process/route.ts:144-153. pipeline'da da spawn 191'de başlıyor (196 değil, ama yakın). (2) "Fly'da ENOENT → Node crash → DoS" alt iddiası ÇÜRÜK: Next.js 16.2.0 (next-server.js:504-505) başlangıçta installProcessErrorHandlers çağırıyor; process-error-handlers.js:83-88 uncaughtException handler'ı kurup hatayı sadece logluyor, süreci düşürmüyor. Yani unhandled 'error' event crash'e yol açmaz. Bu nedenle kritik açığın gerçek etkisi Fly-DoS değil, lokal dev makinede auth'suz agent tetikleme (DB mutasyonu + API maliyeti + izin kontrolsüz komut). Çekirdek bulgu kritik olarak geçerli.

</details>

### 🟠 HIGH · Şema drift'i: kod içindeki SCHEMA gerçek DB'nin gerisinde — temiz kurulumda tüm v1 API 500 döner — ✅ bağımsız doğrulandı

lib/db.ts:18-182'deki SCHEMA ve lib/schema.sql, production sorgularının kullandığı kolon/tabloları içermiyor: videos.poc, subtitle_lines.structure, word_timestamps.starter_word_id, clips.wpm/a2_ratio/avg_sentence_len, word_translations, video_sets, video_set_items, video_transcripts (gerçek data.db'de hepsi var — sqlite3 .tables + PRAGMA ile doğrulandı). better-sqlite3 dosya yoksa boş DB yaratır (getDb, db.ts:220-244); yeni bir Fly volume'u, silinmiş /data/admin.db veya LFS db'siz taze clone'da getDb() eski şemayla boş DB oluşturur ve getPocVideos() 'no such column: poc' ile patlar → /api/v1/poc-videos, video-sets, vocab-feed, patterns... hepsi 500. Migration sistemi de yok — tek migration db.ts:228-232'de try/catch'li tek ALTER.

**Kanıt:** db.ts:320 `WHERE v.poc = 1` ve db.ts:306 `sl.structure IS NOT NULL` sorguları; buna karşın SCHEMA'daki videos tanımı (db.ts:19-29) 'poc' kolonu içermiyor, subtitle_lines (db.ts:38-46) 'structure' içermiyor; 'word_translations|video_sets|starter_word_id' grep'i schema.sql'de sıfır sonuç. Gerçek DB: PRAGMA table_info(videos) → 9|poc|INTEGER.

**Dosyalar:** `admin/lib/db.ts:18`, `admin/lib/db.ts:228`, `admin/lib/schema.sql:1`, `admin/lib/db.ts:320`

**Öneri:** Gerçek DB şemasını `sqlite3 data.db .schema` ile dump edip SCHEMA/schema.sql'i senkronlayın; ideali versiyonlu migration (örn. user_version pragma tabanlı basit migration runner veya drizzle/knex migrations). CI'da 'boş DB + SCHEMA → tüm v1 endpoint smoke testi' ekleyin. Ayrıca boot'ta DB dosyası yoksa sessizce boş DB yaratmak yerine fail-fast loglayın (warmup.sh zaten 'DB not found' diyor ama uygulama yine ayağa kalkıyor).

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı ve ampirik olarak reprodüke edildi. (1) admin/lib/db.ts:18-182 SCHEMA'sında videos.poc, subtitle_lines.structure (+translation_tr), clips.wpm/a2_ratio/avg_sentence_len, word_timestamps.starter_word_id kolonları ve word_translations/video_sets/video_set_items/video_transcripts tabloları yok; admin/lib/schema.sql'de de yok (tek grep eşleşmesi clip_structures, false-positive). (2) Gerçek data.db'de hepsi mevcut (PRAGMA ile doğrulandı: 9|poc|INTEGER vb.). (3) Reprodüksiyon: SCHEMA'yı boş DB'ye uygulayıp production sorgularını çalıştırdım — 'no such column: v.poc', 'no such column: sl.structure', 'no such table: video_sets', 'no such column: wpm' hataları aynen alındı. (4) Taze kurulum senaryosu gerçek: admin/fly.toml DATABASE_PATH=/data/admin.db + volume mount, Dockerfile DB kopyalamıyor, warmup.sh DB yoksa 'skipping' deyip çıkıyor, start=next start (boot migration yok); tek migration db.ts:228-232'deki try/catch'li ALTER. (5) admin/app/api/v1/poc-videos/route.ts:18-23 catch→500. Ek kanıt: 14 v1 route'tan 8'i (poc-videos, poc-videos/[id]/clips, video-sets, vocab-feed, starter-words, starter-words/[id]/contexts, patterns/[patternId]/scenes, clips/by-structure/[id]) eksik şemaya doğrudan bağımlı — iOS uygulamasının ana içerik akışının tamamı. Tek nüans: 'tüm v1 API' hafif abartı; 6 legacy route (curriculum, vocab/sets, lessons) sadece SCHEMA tablolarını kullandığından taze DB'de çalışmaya devam eder — ama bu, bulgunun özünü ve high severity'yi değiştirmez.

</details>

### 🟠 HIGH · Production DB senkronu tanımsız: iki ayrı yazma noktası (local data.db ↔ Fly /data/admin.db), veri kaybı riski — ✅ bağımsız doğrulandı

DB image'a gömülmüyor (.dockerignore: data.db) ve fly.toml volume mount'undaki /data/admin.db'yi kullanıyor; ancak repo'da bu dosyayı güncelleyen hiçbir script/dokümantasyon yok ('fly sftp|flyctl|fly deploy' grep'i boş). İçerik pipeline'ı (admin/scripts/* — tagger, translate, seed) repo kökündeki data.db'ye yazıyor; production'daki admin UI mutasyonları ise volume'daki kopyaya yazıyor. Local kopya prod'a elle yüklendiğinde prod'da yapılmış düzenlemeler (review/subtitle edit) sessizce ezilir; tersi yönde de local pipeline çıktısı prod'a hiç gitmeyebilir. Tek volume + tek makine; otomatik yedekleme stratejisi de tanımlı değil (backup'lar repo kökünde elle kopyalanmış dosyalar: data.db.backup-*).

**Kanıt:** fly.toml:7 DATABASE_PATH=/data/admin.db + [mounts] data→/data; admin/.dockerignore 'data.db' satırı (image'a girmiyor); repo genelinde 'admin.db|fly sftp|flyctl|fly deploy' araması sadece warmup.sh'ı buldu — senkron mekanizması yok. Root'ta data.db.backup-2026-04-29, data.db.backup-pre-tagger-rewrite-* elle kopyalar.

**Dosyalar:** `admin/fly.toml:6`, `admin/fly.toml:17`, `admin/.dockerignore`, `admin/Dockerfile:16`, `admin/lib/db.ts:14`

**Öneri:** Tek yazma yönü belirleyin: prod'u read-only içerik sunucusu yapın (volume yerine DB'yi release aşamasında image'a/objeye gömüp deploy ile atomik değiştirin — örn. Litestream/LiteFS veya 'fly deploy sırasında db upload + sha kontrol' script'i) ve admin mutasyon UI'sını localde tutun; ya da tüm content script'lerini prod DB'ye karşı çalıştırın. Süreci bir README/Makefile hedefi olarak dokümante edin ve `fly volumes snapshots` politikasını doğrulayın.

<details><summary>Doğrulayıcı notu</summary>

Bulgu birebir doğrulandı. (1) admin/fly.toml:7 DATABASE_PATH=/data/admin.db + :17-19 mounts data→/data; admin/Dockerfile:16 aynı env. (2) admin/lib/db.ts:14 local fallback'i repo kökü data.db; pipeline script'lerinin 20+'si (batch-whisperx.ts:14, apply-poc-tags.ts:47, harvest-clips.ts:12 vb.) repo kökü data.db'yi hard-code ediyor, DATABASE_PATH'i bile okumuyor. (3) Prod admin UI gerçek mutasyon yapıyor (admin/app/api/review/route.ts, videos/[id]/subtitles/route.ts, clips/route.ts POST/PUT/DELETE) → volume kopyasına yazar; iki yazma noktası çakışıyor. (4) admin/.dockerignore:3-5 data.db(+shm/wal) hariç → DB image'a girmiyor. (5) Senkron mekanizması yok: repo genelinde 'fly sftp|flyctl|fly deploy|fly ssh|admin.db' grep'i sadece fly.toml, Dockerfile ve warmup.sh:5'i buluyor; admin/package.json'da yalnız dev/build/start; .github/workflows/deploy.yml sadece GitHub Pages (Expo web); admin/README.md boilerplate. (6) Backup'lar elle: kökte data.db.backup-2026-04-29 ve data.db.backup-pre-tagger-rewrite-20260502-210404. EK KANIT: admin/lib/db.ts:18+ şeması CREATE TABLE IF NOT EXISTS ile boot'ta uygulanıyor — boş volume ile fresh deploy sessizce boş DB oluşturup API'lerden boş veri döndürür; prod DB'nin dolumu repo dışı elle bir işlem gerektiriyor, bu da senkronun tanımsız olduğunu güçlendiriyor.

</details>

### 🟠 HIGH · Rate limiting yok + senkron better-sqlite3 ile ağır endpoint'ler: tek makinede kolay DoS — ✅ bağımsız doğrulandı

Hiçbir route'ta rate limiting/istek boyutu sınırı yok. better-sqlite3 senkron çalışır; /api/v1/vocab-feed her istekte ~8k satır çekip (route.ts:145-183) seçilen her satır için ayrı wordsStmt sorgusu (N+1, satır başına sorgu) çalıştırıyor ve karıştırma/dedup işini JS'te yapıyor — bunların tamamı Node event loop'unu bloklar. /api/v1/poc-videos ve /api/v1/lessons/[id]/clips?all=true da benzer şekilde satır başına iç sorgu yapıyor. CORS '*' ile herkes tarayıcıdan bile bu endpoint'lere yüksek frekansta istek atabilir; min_machines_running=1 tek makinede tüm API (iOS uygulamasının beslendiği) kilitlenir.

**Kanıt:** vocab-feed/route.ts: tek prepare ile tüm korpus (`FROM vocab_words vw JOIN word_timestamps wt ...`).all() + döngü içinde `wordsStmt.all(r.line_id)` (seçilen her context için); tümü senkron. fly.toml'da concurrency/checks tanımı yok; hiçbir dosyada rate limit kodu yok.

**Dosyalar:** `admin/app/api/v1/vocab-feed/route.ts:145`, `admin/app/api/v1/vocab-feed/route.ts:210`, `admin/app/api/v1/poc-videos/[id]/clips/route.ts:100`, `admin/fly.toml:10`

**Öneri:** En azından Fly seviyesinde http_service concurrency limitlerini bilinçli ayarlayın ve uygulamada basit bir in-memory token-bucket rate limiter ekleyin. vocab-feed'in satır-başına word sorgusunu tek JOIN'li sorguya çevirin veya sonucu birkaç dakikalığına memoize edin (feed zaten server-side shuffle; shuffle'ı cache'lenmiş veri üzerinde yapın). Ağır read-only sorgular için response cache (s-maxage) düşünün.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru, hatta kanıt biraz daha güçlü. (1) Rate limiting/istek boyutu sınırı yok: admin/ altında middleware.ts hiç yok; "rate limit" grep'i yalnızca içerik pipeline script'lerinde (admin/scripts/validate-videos.ts:161, tag-sentence-structure.ts:230) çıkıyor, hiçbir API route'unda yok. (2) admin/lib/db.ts:1 better-sqlite3 import ediyor (package.json:13, v12) — tamamen senkron, event loop'u bloklar. (3) vocab-feed: admin/app/api/v1/vocab-feed/route.ts:145-184 tek sorguda tüm korpusu .all() ile çekiyor (koddaki yorum satır 143'te '~8k satır' diyor); satır 209'da hazırlanan wordsStmt satır 288'de seçilen HER context için `wordsStmt.all(r.line_id)` olarak çalışıyor. Ek kanıt: limit kırpması satır 336'da, N+1 sorgulardan SONRA yapılıyor — yani ?limit=10 verilse bile pool doluysa ~95 kelime × 5 context ≈ yüzlerce senkron sorgu yine koşuyor; GET zaten `export function GET` (async bile değil, satır 125). Cache yok (api/v1 altında revalidate/Cache-Control grep'i boş). (4) poc-videos clips: admin/app/api/v1/poc-videos/[id]/clips/route.ts:99-114 clip başına lines sorgusu + satır 151'de line başına wordsStmt.all — N+1 doğru. (5) lessons clips: admin/app/api/v1/lessons/[id]/clips/route.ts:49 `all=true` destekleniyor ve satır 115'te döngü İÇİNDE `db.prepare(...).all(line.id)` — prepare bile döngüde, iddia edilenden kötü. (6) CORS '*' her iki route'ta satır 4-8'de. (7) admin/fly.toml: concurrency/hard_limit/checks tanımı yok (grep boş), min_machines_running=1 (satır 15) ve [mounts] ile volume'a bağlı olduğundan pratikte tek makine; auto_stop_machines="off". Endpoint'lerde auth da yok. High severity yerinde.

</details>

### 🟡 MEDIUM · API kontratı yok; casing tutarsız; nullable alan → non-optional Swift alanı tüm feed'i kırabiliyor

OpenAPI/şema tanımı yok; iOS modelleri elle mirror ediliyor. v1 içinde bile casing tutarsız: /api/v1/poc-videos, /api/v1/curriculum, /api/v1/vocab/sets snake_case dönerken /api/v1/poc-videos/[id]/clips ve vocab-feed camelCase dönüyor; iOS tarafı her modelde ayrı CodingKeys ile telafi ediyor (PocVideo.swift:30-40). Kritik kırılganlık: SQL 'vw.translation_tr AS tr' NULL dönebilir (kolon nullable) ama PocStarterWord.tr non-optional String (PocVideo.swift:8) — tek bir çevirisiz kelime, /api/v1/poc-videos response'unun TAMAMININ decode'unu bozup ana feed'i hata ekranına düşürür (commit 3d0561b 'Fill 97 missing Turkish translations' bu sınıf sorunun yaşandığını gösteriyor). Ayrıca eski unversioned endpoint'ler (/api/clips, /api/lessons/list, /api/lessons/[id]/full) hâlâ canlı — hangi istemcinin neye bağımlı olduğu belirsiz.

**Kanıt:** db.ts:326 `SELECT vw.id, vw.word, vw.translation_tr AS tr ...` (vocab_words.translation_tr nullable, db.ts:123); PocVideo.swift:8 `let tr: String`. poc-videos route'u DB satırlarını snake_case ile aynen JSON'lıyor; clips route'u ise elle camelCase map ediyor (formatClip).

**Dosyalar:** `ios-native/EnglishLearning/Models/PocVideo.swift:8`, `admin/lib/db.ts:326`, `admin/app/api/v1/poc-videos/[id]/clips/route.ts:160`, `admin/app/api/lessons/list/route.ts:5`

**Öneri:** v1 için tek casing standardı (camelCase) seçip route çıkışlarını normalize edin; en azından bir types.ts'te response tiplerini tek yerde tanımlayın (ileride OpenAPI/typespec). iOS'ta sunucudan gelebilecek NULL'lar için alanları optional yapın (tr: String? + UI fallback'i) veya endpoint'te COALESCE(translation_tr, word) döndürün. Legacy unversioned endpoint'leri deprecation planına bağlayın.

### 🟡 MEDIUM · iOS: ana video feed'inin offline/backend-down davranışı yok; kullanıcı ilerlemesi yalnızca UserDefaults'ta

CurriculumRepository.videoSets/pocVideos/pocVideoClips bilinçli olarak hiç cache'lenmiyor (CacheService.swift:65-82'deki yorumlar dev dönemine ait). Backend down/uçak modu → VideoFeedView sets.isEmpty + errorMessage ile boş hata ekranı (VideoFeedView.swift:37); bundle'a gömülü fallback içerik yok. Fly tek makine olduğu için (bkz. deployment bulgusu) her backend kesintisi uygulamayı tamamen işlevsiz bırakır. Ayrıca öğrenilen kelimeler/ilerleme yalnızca UserDefaults'ta (AppState.swift:40) — cihaz değişiminde/silmede kayıp; backend'de kullanıcı kavramı yok.

**Kanıt:** CacheService.swift:65-82: `// No caching — POC list changes during dev...` üç ana feed fonksiyonu doğrudan APIClient'a gidiyor. VideoFeedView.swift:37 `else if let err = vm.errorMessage, vm.sets.isEmpty` → sadece hata metni.

**Dosyalar:** `ios-native/EnglishLearning/Services/CacheService.swift:65`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:37`, `ios-native/EnglishLearning/State/AppState.swift:40`

**Öneri:** En azından 'stale-while-revalidate' deseni: videoSets/pocVideos yanıtını TTL'siz de olsa diske yazıp ağ hatasında son başarılı yanıtı gösterin (CacheService zaten mevcut; forceRefresh baypası korunur). Kritik POC içeriği için app bundle'ına bir seed JSON gömmeyi düşünün. İlerleme için iCloud key-value store (NSUbiquitousKeyValueStore) düşük maliyetli ilk adım olur.

### 🟡 MEDIUM · APIClient URL bug'ı: fetchLessonClips(all: true) '?' karakterini path'e gömüyor → %3F ile 404

APIClient.swift:105 `"/api/v1/lessons/\(lessonId)/clips" + (all ? "?all=true" : "")` string'ini appendingPathComponent'e veriyor; '?' yüzde-kodlanıp path'in parçası oluyor. Swift ile doğrulandı: üretilen URL `.../clips%3Fall=true` → Next route eşleşmez, 404 döner. Şu an hiçbir view CurriculumRepository.allClips'i çağırmadığı için (grep ile doğrulandı) sessiz/latent bir bug, ama repository API'sinin parçası ve ilk kullanan ekranda 'çalışmıyor' olarak geri dönecek.

**Kanıt:** Swift REPL testi: appendingPathComponent + URLComponents sonucu 'https://english-learning-admin.fly.dev/api/v1/lessons/abc/clips%3Fall=true'. Callers grep'i: yalnızca CacheService.swift:152 fetchLessonClips(all:true) kullanıyor; allClips'i çağıran view yok.

**Dosyalar:** `ios-native/EnglishLearning/Services/APIClient.swift:105`, `ios-native/EnglishLearning/Services/CacheService.swift:147`

**Öneri:** Query'yi diğer fonksiyonlardaki gibi URLQueryItem ile geçirin: `try await get("/api/v1/lessons/\(lessonId)/clips", query: all ? [URLQueryItem(name: "all", value: "true")] : [])`. Kullanılmıyorsa allClips/fetchLessonClips(all:) yolunu tamamen silin.

### 🟡 MEDIUM · Onarımı imkânsız yıkıcı DELETE zincirleri: onay/soft-delete/audit yok

Birden çok endpoint tek istekle kalıcı veri siliyor: /api/curriculum/[lessonId]/clips DELETE, klibin başka lesson bağı kalmadıysa subtitle_lines + word_timestamps dahil klibi komple siliyor (route.ts:69-76); /api/videos/[id]/auto-subtitle DELETE videonun TÜM kliplerini ve verisini temizliyor; /api/videos DELETE cascade ile her şeyi götürüyor. Soft-delete, çöp kutusu, audit log veya 'emin misiniz' dışında server-side güvence yok; production DB'sinin tek kopyası volume'da (backup'lar manuel). El emeği yüksek içerik (WhisperX hizalama, elle tagging, çeviri) tek yanlış tıkla veya tek kötü niyetli istekle gidiyor.

**Kanıt:** curriculum/[lessonId]/clips/route.ts:69-76: remaining===0 ise targeted_lines, word_timestamps, subtitle_lines, clips sırayla DELETE. auto-subtitle route DELETE handler'ı (satır 75-92) videonun tüm kliplerini döngüyle siliyor.

**Dosyalar:** `admin/app/api/curriculum/[lessonId]/clips/route.ts:69`, `admin/app/api/videos/[id]/auto-subtitle/route.ts:75`, `admin/lib/db.ts:755`

**Öneri:** clips.status'a 'deleted' değeri ekleyip DELETE'leri status update'e çevirin (mevcut sorgular zaten status='approved' filtreli, davranış değişmez); gerçek silmeyi periyodik bir vacuum script'ine bırakın. Fly volume snapshot'larının açık olduğunu doğrulayıp cron ile off-site (S3/Tigris) günlük DB yedeği alın.

### 🟡 MEDIUM · fly.toml'da health check yok; tek region/tek makine; deploy sırasında kesinti riski

fly.toml'da [http_service.checks] veya [checks] tanımı yok — Next süreci kilitlense/500 dönmeye başlasa da Fly trafiği yollamaya devam eder ve rolling deploy 'sağlıklı' sinyali olmadan ilerler. Volume mount'u makineyi tek host'a sabitler; min_machines_running=1 + tek makine = tek nokta arızası (iOS uygulamasının tek veri kaynağı). auto_stop_machines=off sürekli maliyet demek; bilinçli bir tercihse sorun değil ama checks olmadan 'her zaman açık ama sağlıksız' durumu görünmez kalır.

**Kanıt:** fly.toml (20 satır) yalnızca app/region/env/http_service/mounts içeriyor; hiçbir checks bloğu yok. Dockerfile CMD warmup.sh && npm run start — sağlık sinyali üretmiyor.

**Dosyalar:** `admin/fly.toml:10`, `admin/Dockerfile:22`

**Öneri:** Basit bir /api/health route'u ekleyip (DB'ye SELECT 1) fly.toml'a `[[http_service.checks]] interval="15s" timeout="5s" method="GET" path="/api/health"` tanımlayın. SQLite tek-yazar kısıtı nedeniyle çoklu makine zor; en azından snapshot/restore runbook'u yazın.

### ⚪ LOW · Ortama gömülü macOS varsayımları: hardcoded HOME/Library/Python yolları, /tmp PID dosyaları

auto-subtitle, pipeline ve process route'ları yt-dlp'yi HOME/Library/Python/3.x/bin gibi macOS'a özgü yollarda arıyor, WhisperX'i repo kökü .venv/bin/python3 ile çalıştırıyor, PROJECT_ROOT'u process.cwd()/.. varsayıyor. Bu route'lar production image'ına da giriyor ama orada hiçbir bağımlılık yok — çağrıldıklarında 500 (veya pipeline'da crash) üretiyorlar. Pipeline durumu /tmp'deki PID/JSON dosyalarıyla takip ediliyor; süreç yeniden başlatmalarında yarış/yalan durum riski var (status route'u ölü PID görünce 'terminated unexpectedly' yazıyor, kısmen ele alınmış).

**Kanıt:** auto-subtitle/route.ts:17-33 findYtDlp() macOS Python bin yolları listesi; route.ts:8-10 PROJECT_ROOT=path.join(process.cwd(),'..'), VENV_PYTHON=PROJECT_ROOT/.venv/bin/python3; pipeline/route.ts:7-8 PID_FILE='/tmp/pipeline-pid.txt'.

**Dosyalar:** `admin/app/api/videos/[id]/auto-subtitle/route.ts:17`, `admin/app/api/pipeline/route.ts:7`, `admin/app/api/process/route.ts:7`

**Öneri:** Bu 'local-only' route'ları tek bir guard'la işaretleyin (örn. if (process.env.FLY_APP_NAME) return 501) ve yt-dlp/python yollarını env değişkenine taşıyın (YT_DLP_PATH, WHISPERX_PYTHON). PID takibi için /tmp yerine DB'de tek satırlık bir job tablosu daha sağlam olur.

### ⚪ LOW · Canlı SQLite DB'nin git LFS'te tutulması + elle backup kopyaları + 0-byte admin/data.db artığı

Repo kökündeki data.db (220MB) git LFS ile takip ediliyor (check-attr: filter lfs) ama -wal/-shm dosyaları gitignore'da; WAL checkpoint edilmeden yapılan bir commit, son yazmaları içermeyen (hatta hot-journal'lı tutarsız) bir snapshot üretebilir. Tarihli backup kopyaları (data.db.backup-*) çalışma dizininde duruyor. admin/data.db ise 0 byte'lık bir artık — findRepoRoot() app.json'lı kökü bulduğu için kullanılmıyor ama 'hangi DB gerçek?' karışıklığı yaratıyor (nitekim admin/scripts/*.ts DATABASE_PATH ?? __dirname/../../data.db ile köke gidiyor).

**Kanıt:** `git ls-files | grep .db` → data.db; `git check-attr filter -- data.db` → lfs; kökte data.db-wal/-shm gitignore'lu; ls -la admin/ → 'data.db 0 bytes (Apr 12)'. db.ts:5-13 findRepoRoot app.json arıyor.

**Dosyalar:** `data.db`, `admin/data.db`, `admin/lib/db.ts:5`, `.gitignore`

**Öneri:** Commit öncesi `sqlite3 data.db 'PRAGMA wal_checkpoint(TRUNCATE)'` çalıştıran bir pre-commit hook ekleyin veya DB'yi git yerine versiyonlanmış artefakt olarak (tarihli export + sha) saklayın. admin/data.db'yi silin; backup dosyalarını repo dışına taşıyın.

### ⚪ LOW · Input validation eksik; updateCurriculumLesson'da kolon adları string interpolation ile SQL'e giriyor

Route'lar request.json() çıktısını doğrulamadan DB helper'lara geçiriyor (tip/aralık kontrolü yok; ör. review route'unda clipId/lineId tip kontrolü yok, subtitles PUT'unda words dizisi elemanları doğrulanmıyor). lib/db.ts:857-869 updateCurriculumLesson, Object.entries(updates) key'lerini doğrudan `${key} = ?` olarak SQL'e gömüyor — şu an hiçbir route çağırmıyor (grep ile doğrulandı, sadece script'ler) ama bir gün bir PATCH route'una bağlanırsa kolon-adı üzerinden SQL injection olur. /api/v1/starter-words'te ids listesi sınırsız — binlerce id, SQLite parametre limitine çarpıp 500 üretir.

**Kanıt:** db.ts:861-864: `for (const [key, value] of Object.entries(updates)) { ... sets.push(\`${key} = ?\`) }`. starter-words/route.ts:24-30 ids.split(',') sınırsız; placeholders = ids.map(()=>'?') (route.ts:36).

**Dosyalar:** `admin/lib/db.ts:857`, `admin/app/api/v1/starter-words/route.ts:24`, `admin/app/api/review/route.ts:5`

**Öneri:** updateCurriculumLesson'a updateSubtitleLine'daki (db.ts:553-563) gibi alan whitelist'i ekleyin. v1 endpoint'lerinde ids sayısını sınırlayın (örn. ilk 200). Route girişleri için zod gibi hafif bir şema doğrulayıcı standartlaştırın.

---

## Veri & İçerik Pipeline'ı

**Genel durum:** İçerik/veri katmanı POC hızında büyümüş ve çalışıyor, ancak temel mimari kararlar borç üretmiş durumda. En kritik iki sorun: iOS'un canlı veri kaynağı olan Fly'daki admin API'nin tamamen kimlik doğrulamasız olması ve veritabanında 94 binden fazla öksüz satırın bulunması (pipeline'ın FK'siz sqlite3 CLI yazımlarının sonucu). 220MB'lık data.db'nin git LFS'te versiyonlanması .git dizinini 12GB'a şişirmiş; şema üç yerde tanımlı ve drift yüzünden boş bir volume'a fresh deploy runtime'da patlar. Lokal data.db ile Fly'daki admin.db arasında repoda hiçbir senkron mekanizması yok, admin/scripts'teki 8+ script yanlışlıkla 0 byte'lık admin/data.db'ye bağlanıyor. İçerik kalite güvencesi (çeviri eksikleri, oEmbed kontrolü) sistematik değil, sorun görüldükçe yazılan 60+ one-off script'le yürüyor; asıl pipeline ise LLM agent'ına ham SQL erişimi veren, tekrar üretilemez ve belgelenmemiş bir süreç. Buna karşılık şema tasarımı, index'leme ve .gitignore hijyeni gibi temeller büyük oranda doğru kurulmuş.

**Korunması gereken güçlü yanlar:**
- Şema temelde iyi normalize edilmiş: junction tablolar (clip_vocab, clip_structures, video_set_items) kompozit PK'lı, FK'ler ON DELETE CASCADE/SET NULL ile tanımlı, anlamlı index'ler var (idx_clips_status_video, partial index idx_videos_poc WHERE poc=1, idx_word_timestamps_starter_word_id WHERE NOT NULL).
- admin/lib/db.ts uygulama tarafında doğru pragma'ları kuruyor (journal_mode=WAL, foreign_keys=ON) ve prepared statement kullanımı tutarlı — SQL injection'a açık string interpolation'lar yalnızca sabit listelerden geliyor.
- Video kullanılamazlık kontrolü iyi ayrıştırılmış: check-pattern-video-availability.ts salt okunur detector + disable-unavailable-pattern-clips.ts ayrı uygulayıcı; --dry-run/--json/--concurrency bayrakları düşünülmüş; clip'ler silinmek yerine 'video_unavailable' status'üne çekiliyor (12 clip) — geri alınabilir.
- rule-based-tagger.ts için test dosyası var (rule-based-tagger.test.ts) ve tagger büyük yeniden yazım öncesi DB yedeği alınmış (data.db.backup-pre-tagger-rewrite-*) — riskli operasyon öncesi yedek disiplini doğru.
- .gitignore kapsamı büyük oranda doğru: .cache, .venv, .expo, node_modules, data.db-shm/-wal, data.db.backup-*, ios-native/build hiçbiri git'te değil (git ls-files doğrulandı).
- Fly deploy'da pratik dokunuşlar: warmup.sh ile cold-cache priming, volume mount ile kalıcı SQLite, INSERT OR IGNORE ile operatör düzenlemelerini ezmeyen phrase seed'i.

### 🔴 CRITICAL · Production admin API tamamen kimlik doğrulamasız — iOS'un canlı veri kaynağı herkese açık yazılabilir — ✅ bağımsız doğrulandı

iOS uygulaması tüm veriyi https://english-learning-admin.fly.dev üzerinden çekiyor (APIClient.swift:37). Aynı Next.js uygulaması, hiçbir auth middleware'i olmadan (admin/ altında middleware.ts yok, route'larda Authorization/API_KEY kontrolü grep ile 0 sonuç) mutasyon endpoint'leri sunuyor: POST/DELETE /api/videos (admin/app/api/videos/route.ts:10 ve :35 deleteVideo), clip status güncelleme, subtitle düzenleme vb. Fly'daki /data/admin.db yani TestFlight kullanıcılarının gördüğü canlı içerik, URL'i bilen herhangi biri tarafından silinebilir veya zehirlenebilir. Ayrıca /api/v1 route'ları 'Access-Control-Allow-Origin: *' ile açık.

**Kanıt:** admin/app/api/videos/route.ts:35 `export async function DELETE(request)` → doğrudan deleteVideo(id); admin/ dizininde middleware.ts yok; grep -il 'authorization|API_KEY' admin/app/api → boş.

**Dosyalar:** `admin/app/api/videos/route.ts:35`, `ios-native/EnglishLearning/Services/APIClient.swift:37`, `admin/fly.toml`

**Öneri:** En azından bir statik bearer token (Fly secret olarak ENV'den) isteyen bir middleware.ts ekleyin; /api/v1/* GET'leri açık kalsın, tüm mutasyon route'ları (POST/PUT/DELETE) token'sız 401 dönsün. Orta vadede admin panelini ayrı bir app'e taşıyıp iOS'a salt okunur bir API bırakın.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğrulandı, hatta olduğundan daha eksik gösterilmiş. Kanıtlar: (1) ios-native/EnglishLearning/Services/APIClient.swift:37 defaultBase = "https://english-learning-admin.fly.dev", tüm get() çağrıları buraya gidiyor, yorumda "both simulator and physical-device DEBUG hit production now" yazıyor. (2) admin/app/api/videos/route.ts:35 DELETE fonksiyonu sadece {id} okuyup doğrudan deleteVideo(id) çağırıyor, hiçbir auth kontrolü yok; aynı dosyada POST (:9) da korumasız. (3) admin/ altında middleware.ts YOK (find 0). admin/app/api içinde auth/authorization/api_key/token/session/cookie grep'inin tek hiti patterns/[patternId]/scenes/route.ts:54, o da 'checking membership' diyen bir yorum (kelime üyeliği, auth değil). (4) Canlı test: GET https://english-learning-admin.fly.dev/api/videos -> 200 auth'suz; /api/v1/poc-videos yanıtı access-control-allow-origin: * içeriyor. (5) admin/fly.toml: app english-learning-admin, DATABASE_PATH=/data/admin.db, mount /data. Ek: iddia sadece videos DELETE'ini saymış ama korumasız mutasyon yüzeyi çok daha geniş — clips DELETE, videos/[id]/subtitles PUT/POST/DELETE, auto-subtitle POST/DELETE, lessons/[id] POST/PUT/DELETE, curriculum/[lessonId]/clips POST/DELETE, tags, pipeline POST hepsi auth'suz. Canlı DELETE'i yıkıcı olacağı için tetiklemedim ama route mantığı + auth'suz 200 GET iddiayı kanıtlıyor.

</details>

### 🔴 CRITICAL · Veritabanında büyük ölçekli referans bütünlüğü ihlali: 94.638 öksüz subtitle_lines + 360 öksüz word_timestamps — ✅ bağımsız doğrulandı

PRAGMA foreign_key_check çıktısı: 94.638 subtitle_lines satırı var olmayan clip'lere (2.332 silinmiş clip), 360 word_timestamps satırı var olmayan satırlara işaret ediyor — toplam satırların ~%17'si ölü veri. Sebep: pipeline (admin/app/api/pipeline/route.ts) LLM agent'ına ham `sqlite3` CLI komutları çalıştırtıyor ('DELETE FROM videos WHERE id=...'); sqlite3 CLI varsayılan olarak foreign_keys=OFF çalıştığı için ON DELETE CASCADE hiç tetiklenmiyor. Ayrıca targeted_lines tablosu hiç FK tanımlamamış (schema: 'CREATE TABLE targeted_lines (clip_id INTEGER NOT NULL, ...)' — REFERENCES yok) ve 24 öksüz clip + 20 öksüz line referansı içeriyor. Bu hem 220MB'lık DB'yi şişiriyor hem istatistikleri (line_count, coverage) yanıltıyor.

**Kanıt:** sqlite3 data.db 'PRAGMA foreign_key_check' → 94638 subtitle_lines->clips, 360 word_timestamps->subtitle_lines; targeted_lines orphan sorguları: 24 ve 20; pipeline PROMPT'unda 'sqlite3 ${DB_PATH} "DELETE FROM videos WHERE id=..."' talimatı.

**Dosyalar:** `data.db`, `admin/app/api/pipeline/route.ts`, `admin/lib/db.ts:161`

**Öneri:** Tek seferlik temizlik: öksüz satırları silen bir script + VACUUM (DB muhtemelen 180MB altına iner). Kalıcı çözüm: sqlite3 CLI ile yazan her akışa '.dbconfig' yerine 'PRAGMA foreign_keys=ON;' öneki zorunlu kılın veya tüm yazma işlemlerini better-sqlite3 üzerinden geçirin; targeted_lines'a FK'lar ekleyin; foreign_key_check'i CI/pre-commit kontrolü yapın.

<details><summary>Doğrulayıcı notu</summary>

Bulgu birebir doğrulandı. PRAGMA foreign_key_check tam olarak 94638 subtitle_lines->clips ve 360 word_timestamps->subtitle_lines ihlali döndürüyor; öksüz subtitle_lines 2332 farklı silinmiş clip_id'ye işaret ediyor (94638/566730 = %16,7 ≈ %17). targeted_lines tablosu hem canlı DB şemasında hem admin/lib/db.ts:161-166'da REFERENCES içermiyor ve 24 öksüz clip + 20 öksüz line referansı barındırıyor. admin/app/api/pipeline/route.ts:111'de LLM agent'a verilen 'sqlite3 ${DB_PATH} "DELETE FROM videos WHERE id=...'"' talimatı mevcut (aynı talimat admin/app/api/process/route.ts:80'de de tekrar ediyor — bulguda anılmayan ikinci kopya); DB_PATH repo kökündeki data.db (route.ts:9). better-sqlite3 bağlantısı db.ts:224'te foreign_keys=ON yaparken sqlite3 CLI varsayılan OFF çalıştığından ON DELETE CASCADE bu yolda tetiklenmiyor — mekanizma iddiası doğru. Ek kanıt: bulgu ölü veriyi eksik saymış — öksüz subtitle_lines'a bağlı 233.686 word_timestamps satırı (toplamın %10,6'sı) transitif olarak ölü ama FK check'te görünmüyor; gerçek ölü satır sayısı ~328k. Küçük nüans: foreign_key_check'te clips->videos ihlali olmadığından 2332 clip'in tamamının satır 111'deki DELETE ile silindiği tek başına kanıtlanamıyor (clips'i doğrudan silen admin API uçları da var, örn. admin/app/api/curriculum/[lessonId]/clips/route.ts:69), ancak bu kök neden atamasına dair bir detay olup bulgunun özünü değiştirmiyor.

</details>

### 🟠 HIGH · 220MB SQLite dosyası git LFS'te versiyonlanıyor → .git dizini 12GB (58 LFS objesi) — ✅ bağımsız doğrulandı

.gitattributes 'data.db filter=lfs' diyor ve data.db 14 commit'te değişmiş; .git/lfs altında 58 obje, toplam 12.07GB birikmiş (du -sh .git = 12G). Her içerik düzeltmesi (97 çeviri doldurmak gibi) 200MB'lık yeni bir LFS versiyonu üretiyor. GitHub LFS kotası ve clone/push süreleri açısından sürdürülemez; üstelik binary DB'nin diff'i yok, PR review imkânsız. Ayrıca WAL modundaki bir DB'nin -wal/-shm dosyaları ignore'da: checkpoint edilmemiş yazımlar commit'e girmeyebilir (şu an wal 0 byte olduğu için veri kaybı yok ama model kırılgan).

**Kanıt:** git ls-files → data.db tracked; find .git/lfs/objects -type f | wc -l → 58, toplam 12.0736 GB; du -sh .git → 12G; git log -- data.db → 14 commit.

**Dosyalar:** `.gitattributes:1`, `data.db`, `.gitignore`

**Öneri:** data.db'yi git'ten tamamen çıkarın (git lfs untrack + gitignore); içerik versiyonlaması için ya (a) deterministic export (tablo başına JSON/CSV dump) commit'leyin ya da (b) Litestream/Tigris ile Fly volume'undan sürekli yedekleme kurun. Lokal LFS önbelleğini 'git lfs prune' ile temizleyin.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. .gitattributes:1 'data.db filter=lfs diff=lfs merge=lfs -text'; git ls-files ve git lfs ls-files data.db'yi tracked gösteriyor. .git/lfs/objects altında 58 obje; byte toplamı ~11.24GB (du .git/lfs = 11G), du -sh .git = 12G (11G LFS + 352M normal objects) — bulgudaki '12.07GB LFS' hafif abartı, gerçek LFS ~11.2GB, 12G rakamı .git toplamı. git log -- data.db = 14 commit; obje dağılımı 37×211.4MB + ~15×190-197MB + 1×389MB, yani her içerik commit'i ~200MB tam kopya üretiyor (LFS delta yok, binary diff/PR review imkânsız iddiası doğru). WAL iddiası da doğru: PRAGMA journal_mode=wal, .gitignore:48-49 data.db-shm/-wal'ı ignore ediyor; şu an -wal 0 byte ama -shm bugün değişmiş (DB aktif), checkpoint edilmemiş yazımların commit dışı kalma riski gerçek. Bulgu özünde doğru, high şiddeti yerinde; tek düzeltme LFS boyutunun 12.07GB değil ~11.24GB olması.

</details>

### 🟠 HIGH · Şema üç yerde tanımlı ve ciddi drift var — boş volume'a fresh deploy runtime'da patlar — ✅ bağımsız doğrulandı

Canlı data.db şeması, admin/lib/db.ts içindeki SCHEMA sabiti ve admin/lib/schema.sql birbirinden farklı. db.ts SCHEMA'sında word_translations, video_sets, video_set_items, video_transcripts tabloları ve videos.poc, clips.wpm/a2_ratio/avg_sentence_len, subtitle_lines.translation_tr/structure, word_timestamps.starter_word_id kolonları YOK. Migration mekanizması tek bir try/catch ALTER TABLE (db.ts:229, sadece 'sections' kolonu). Fly'da boş bir volume ile açılışta getDb() eksik şemayı kurar; ardından getPocVideos() 'WHERE v.poc = 1' (db.ts:320) ve patterns route'unun word_translations join'i (scenes/route.ts:362) 'no such column/table' hatası verir. schema.sql (148 satır) ise tamamen bayat, hiçbir kod okumuyor gibi.

**Kanıt:** Canlı .schema'da 'CREATE TABLE word_translations...', 'poc INTEGER', 'wpm REAL', 'structure TEXT' mevcut; db.ts SCHEMA string'inde (satır 18-182) bunların hiçbiri yok; tek migration db.ts:229'daki sections ALTER'ı.

**Dosyalar:** `admin/lib/db.ts:18`, `admin/lib/db.ts:229`, `admin/lib/schema.sql`, `admin/app/api/v1/patterns/[patternId]/scenes/route.ts:362`

**Öneri:** Tek şema kaynağı belirleyin: numaralı migration dosyaları + PRAGMA user_version ile açılışta sırayla uygulanan bir migration runner yazın. schema.sql'i silin veya generate edin (sqlite3 data.db .schema > schema.sql'i CI'da diff'leyin).

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğrulandı. (1) admin/lib/db.ts SCHEMA'sında (satır 18-182) word_translations/video_sets/video_set_items/video_transcripts tabloları ve videos.poc, clips.wpm/a2_ratio/avg_sentence_len, subtitle_lines.translation_tr/structure, word_timestamps.starter_word_id kolonları gerçekten yok; canlı data.db'de hepsi mevcut (sqlite3 .schema ile teyit edildi). (2) Tek runtime migration db.ts:228-232'deki sections ALTER'ı; asıl kolonları ekleyen admin/scripts/migrate-feynman-poc.ts manuel script. (3) Fresh deploy senaryosu gerçek: admin/fly.toml volume'u /data'ya mount ediyor (DATABASE_PATH=/data/admin.db), Dockerfile hiçbir DB kopyalamıyor, warmup.sh DB yoksa exit 0 ile atlıyor; boş volume'da getDb() eksik şemayı kurar, db.ts:320 'WHERE v.poc = 1' ve scenes/route.ts:362 word_translations join'i no such column/table hatası verir. Ek kanıt (bulguyu güçlendiriyor): word_translations, video_sets, video_set_items için repo'nun HİÇBİR yerinde CREATE TABLE yok — bu tablolar canlı DB'ye ad hoc eklenmiş, kod şemayı yeniden üretemez; getVideoSets() (db.ts:366/394) de aynı şekilde patlar. Tek küçük düzeltme: schema.sql'i 'hiçbir kod okumuyor' ifadesi tam doğru değil — admin/scripts/seed-flash.ts:9 ve seed-videos.ts:15 okuyup exec ediyor; ama bunlar manuel seed scriptleri, üstelik yanlış DB'ye (0 byte'lık admin/data.db) yazıyorlar ve schema.sql'in tamamen bayat olduğu doğru. Bu nüans bulgunun özünü ve high severity'sini değiştirmiyor.

</details>

### 🟠 HIGH · Script'lerde DB path kaosu: 8+ script yanlışlıkla 0 byte'lık admin/data.db'ye bağlanıyor — ✅ bağımsız doğrulandı

admin/scripts altında iki farklı konvansiyon var: path.join(__dirname,'..','..','data.db') (repo kökü — doğru) ve path.join(__dirname,'..','data.db') (admin/data.db — yanlış). Yanlış path kullananlar: batch-whisperx.ts:14, batch-word-timestamps.ts:14, validate-videos.ts:14, seed-videos.ts:9, add-a2-videos.ts:7, seed-flash.ts:5, seed-a1-wave4/5/5b/5c/6. better-sqlite3 dosya yoksa oluşturduğu için repoda 0 byte'lık bir admin/data.db hayaleti duruyor (12 Nis'ten beri). En kritiği: validate-videos.ts (video kullanılabilirlik/kalite temizliği) boş DB'ye karşı çalışıp 'her şey temiz' der; batch-whisperx.ts de üretim pipeline'ının parçası. f1efc99 'Always use repo root data.db' commit'i sorunu kısmen düzeltmiş ama bu script'ler atlanmış.

**Kanıt:** grep DB_PATH admin/scripts/*.ts çıktısı iki farklı derinlik gösteriyor; ls -la admin/data.db → 0 byte (Apr 12 13:15); validate-videos.ts:13-14 ROOT=admin, DB_PATH=admin/data.db.

**Dosyalar:** `admin/scripts/validate-videos.ts:14`, `admin/scripts/batch-whisperx.ts:14`, `admin/scripts/seed-videos.ts:9`, `admin/data.db`

**Öneri:** check-pattern-video-availability.ts'teki deseni standartlaştırın: tüm script'ler 'process.env.DATABASE_PATH ?? repo-kökü/data.db' okuyan tek bir paylaşılan helper'dan (örn. admin/scripts/lib/db-path.ts) geçsin; 0 byte admin/data.db dosyasını silin.

<details><summary>Doğrulayıcı notu</summary>

Çekirdek iddia doğru, hatta eksik sayılmış: 14 script admin/data.db'ye çözünen path kullanıyor (iddia edilen 11'e ek: seed-a1-pipeline.ts:20, seed-a1-wave2.ts:13, seed-a1-wave3.ts:10; batch-whisperx/batch-word-timestamps/validate-videos'ta ROOT=path.join(__dirname,'..')=admin). admin/data.db 0 byte ve Apr 12 13:15 tarihli — f1efc99 (2026-04-10, sadece admin/lib/db.ts + services/api.ts'i düzelten commit) SONRASI oluşmuş, yani yanlış path'li bir script gerçekten çalışmış. Dosya admin/.gitignore:37 (*.db) ile ignore'lu. Tek düzeltme: 'validate-videos boş DB'ye karşı her şey temiz der' alt-iddiası yanlış — better-sqlite3 boş DB'de prepare aşamasında 'no such table: videos' fırlatır (deneysel doğrulandı), yani sessiz false-clean değil gürültülü crash; pratik etki bu 14 script'in şu an çalışamaz olması. Ayrıca kronoloji notu: script'ler yazıldığında (bd819f3, 2026-03-20) DB gerçekten admin/ altındaydı; root data.db 09a78c1 ile aynı gün (2026-04-10) geldi ve script'ler güncellenmeden öksüz kaldı.

</details>

### 🟠 HIGH · Source of truth belirsiz: iki yazılabilir DB kopyası (lokal data.db ↔ Fly /data/admin.db) ve repoda hiçbir senkron mekanizması yok — ✅ bağımsız doğrulandı

Veri akışı: lokal root data.db (git LFS'te, tüm içerik script'leri buna yazıyor) → ??? → Fly volume /data/admin.db (fly.toml env DATABASE_PATH=/data/admin.db; iOS buradan besleniyor). Admin paneli Fly'da da yazma yeteneğine sahip (updateSubtitleLine, updateClipStatus, phrase_translations seed'i her boot'ta INSERT OR IGNORE). Repoda hiçbir upload/sync script'i yok (grep 'sftp|scp|rsync|litestream' → 0 sonuç); aktarım belli ki elle 'fly sftp' benzeri bir yolla yapılıyor ve belgelenmemiş. İki taraf da yazılabilir olduğu için sessiz divergence garantili: Fly'da yapılan bir düzeltme, sonraki elle yüklemede lokal kopyayla ezilir. Buna ek olarak repo kökünde 2 adet ~200MB backup kopyası (data.db.backup-2026-04-29, data.db.backup-pre-tagger-rewrite-...) working tree'de duruyor.

**Kanıt:** fly.toml: DATABASE_PATH=/data/admin.db + [mounts]; admin/lib/db.ts:14 lokalde repo kökü data.db; repo genelinde senkron script'i grep'le bulunamadı; ls → 193M + 211M backup dosyaları.

**Dosyalar:** `admin/fly.toml`, `admin/lib/db.ts:14`, `data.db.backup-2026-04-29`

**Öneri:** Tek yön belirleyin: (a) lokal data.db tek yazma noktası, Fly'a deploy script'iyle atomik upload (upload → warmup → sağlık kontrolü) ve Fly'daki admin route'larını read-only yapın; veya (b) Fly'daki DB canonical olsun, lokal script'ler API üzerinden yazsın. Senkron adımını repoya script olarak ekleyip README'de belgeleyin. Backup'ları working tree'den çıkarıp tarihli olarak repo dışında/bulutta tutun.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğrulandı. (1) admin/fly.toml:7 DATABASE_PATH=/data/admin.db + [mounts] volume; iOS bu deploy'dan besleniyor (ios-native/.../APIClient.swift:37 → english-learning-admin.fly.dev). (2) admin/lib/db.ts:14 lokalde repo kökü data.db'ye düşüyor; data.db git LFS'te tracked ve data.db-shm bugün (Jul 2) değişmiş — lokal aktif kullanımda. (3) Fly'daki admin yazabiliyor: admin/app/api altında 12 write route (örn. videos/[id]/subtitles/route.ts:26 → updateSubtitleLine); db.ts:234-242 her boot'ta phrase_translations seed'i, yorumu bile 'operator-edited ones survive a redeploy' diyor. (4) Senkron mekanizması yok: sftp/scp/rsync/litestream/flyctl grep eşleşmelerinin tamamı fs.mkdirSync'teki 'rSync' alt dizisinden kaynaklanan false positive; package.json'larda deploy/sync script'i yok; Dockerfile DB'yi image'a koymuyor; README yok. (5) 193M+211M backup dosyaları diskte mevcut. Küçük düzeltmeler: backup'lar .gitignore:50 ile ignore'lu (git'e girmiyor, sadece disk dağınıklığı); updateClipStatus yalnızca lib/seed.ts'ten çağrılıyor, API route'a bağlı değil — ama diğer 12 write route ana iddiayı fazlasıyla kanıtlıyor.

</details>

### 🟠 HIGH · İçerik pipeline'ı non-deterministik: LLM agent'ına ham SQL erişimiyle çalışan, /tmp dosyalarına ve tek makineye bağımlı süreç — ✅ bağımsız doğrulandı

Ana içerik üretim akışı admin/app/api/pipeline/route.ts'te `claude` CLI'a (CLAUDE_BIN=~/.local/bin/claude) verilen dev bir PROMPT: agent yt-dlp ile video arıyor, sqlite3 CLI ile INSERT/DELETE atıyor, 'kalite kontrolü'nü LLM kanaatiyle yapıp videoları siliyor, clip'leri approve ediyor. Bu (1) tekrar üretilemez — aynı girdiyle iki koşu farklı sonuç verir; (2) idempotent değil — Stage 1 clip'leri end_time=9999 placeholder'ıyla açıyor; (3) transaction yok, FK'sız sqlite3 CLI yazımları 2 numaralı bulgudaki orphan'ların kaynağı; (4) taşınabilir değil — PID/progress /tmp'de, localhost:3000 ve macOS Homebrew path'leri hardcoded. Bir videoyu uçtan uca işlemenin adımları hiçbir yerde belgelenmemiş (repo kökünde README yok; admin/README.md create-next-app boilerplate'i).

**Kanıt:** route.ts:6-8 PID_FILE/PROGRESS_FILE=/tmp/...; :11 CLAUDE_BIN; PROMPT içinde 'sqlite3 ${DB_PATH} "DELETE FROM videos..."', 'INSERT INTO clips (..., 0, 9999, draft)'; admin/README.md ilk satırı 'This is a Next.js project bootstrapped with create-next-app'.

**Dosyalar:** `admin/app/api/pipeline/route.ts:6`, `admin/app/api/pipeline/route.ts:11`, `admin/README.md`

**Öneri:** Pipeline'ı deterministik adımlara ayırın (fetch → transcribe → align → tag → translate → approve), her adımı ayrı, idempotent (INSERT OR IGNORE / durum kolonu ile yeniden koşulabilir) CLI script'i yapın; LLM'i yalnızca kalite skoru öneren, DB'ye doğrudan yazmayan bir alt adım olarak kullanın. Akışı bir PIPELINE.md ile belgeleyin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu kodda birebir doğrulanıyor. admin/app/api/pipeline/route.ts: satır 6-7 PID_FILE=/tmp/pipeline-pid.txt ve PROGRESS_FILE=/tmp/pipeline-progress.json (ayrıca satır 190'da /tmp/pipeline-claude.log); satır 10 CLAUDE_BIN=~/.local/bin/claude (bulgu :11 demiş, gerçekte :10 — önemsiz off-by-one); satır 191 claude CLI '--dangerously-skip-permissions' ile spawn ediliyor. PROMPT içinde: satır 76 ve 140 "INSERT INTO clips (..., 0, 9999, 'draft'/'approved')" placeholder'ları; satır 111 "DELETE FROM videos WHERE id=..."; satır 102-113 kalite kontrolü tamamen LLM kanaatiyle (sil/onayla). Taşınabilirlik: satır 43 ve 87-90 http://localhost:3000 hardcoded, satır 24-29 macOS'a özgü ~/Library/Python/3.x ve /opt/homebrew/bin yt-dlp yolları, satır 197 PATH'e /opt/homebrew/bin ekleniyor. PROMPT'ta hiçbir BEGIN/COMMIT veya PRAGMA foreign_keys=ON yok. EK KANIT (orphan iddiasını güçlendiriyor): şemada clips.video_id ve subtitle_lines.clip_id ON DELETE CASCADE tanımlı, ama sqlite3 CLI varsayılanı foreign_keys=OFF olduğundan cascade hiç çalışmıyor — data.db'de fiilen 94.638 orphan subtitle_lines ve 24 orphan targeted_lines satırı var (clips orphan'ı 0). Yani "FK'sız sqlite3 yazımları orphan kaynağı" iddiası ampirik olarak kanıtlı. admin/README.md ilk satırı gerçekten create-next-app boilerplate'i, repo kökünde README.md yok. Tek küçük nüans: şu an DB'de end_time=9999 kalmış clip yok (0 adet) — prompt'un Stage 4/6. adımı bunları trim/silme talimatı içeriyor; ama placeholder deseni kodda mevcut ve süreç yarıda kesilirse 9999 kalır, idempotensi eleştirisi geçerli.

</details>

### 🟡 MEDIUM · İçerik kalite güvencesi tek seferlik script yığınıyla yürüyor; 60+ one-off script, sistematik/tekrarlanan kontrol ve CI yok

admin/scripts'te 66 dosya var; çoğu adı üstünde one-off: seed-a1-wave2..wave6, fix-be-aux, fix-be-rest, fix-have-aux, fix-have-aux2, extend-poc-15-more, split-poc-contractions... Çeviri eksikleri ('Fill 97 missing Turkish translations' commit'i) ve video kullanılamazlığı ('Drop unavailable pattern videos via YouTube oEmbed check') hep sorun görüldükten SONRA yazılan script'lerle kapatılmış. check-pattern-video-availability.ts iyi tasarlanmış ama yalnızca 4 BE+adjective pattern'ini tarıyor ve PREFIXES listesini route'taki PATTERN_FILTERS ile 'keep this list in sync' yorumuyla ELLE senkron tutuyor (route.ts:44-47'deki filtre değişirse detector sessizce yanlış kümeyi tarar). Tek CI workflow'u (.github/workflows/deploy.yml) legacy Expo web'ini GitHub Pages'e atıyor; veri doğrulaması hiçbir yerde otomatik koşmuyor.

**Kanıt:** ls admin/scripts → 66 girdi, 6 adet seed-a1-wave*, 5 adet fix-*aux*; check-pattern-video-availability.ts:26-28 'Mirrors the SQL prefix list... always tracks the live filter set' (elle senkron); deploy.yml sadece 'npx expo export --platform web'.

**Dosyalar:** `admin/scripts/check-pattern-video-availability.ts:43`, `.github/workflows/deploy.yml`, `admin/scripts/`

**Öneri:** Bir 'content-health' script'i yazın (çeviri coverage, structure coverage, oEmbed availability, FK check, duplicate check) ve bunu cron/CI ile haftalık koşturup rapor ürettirin. check-pattern-video-availability'nin PREFIXES'ini route dosyasından import ederek tek kaynağa indirin. Artık işi bitmiş wave/fix script'lerini scripts/archive/ altına taşıyın.

### 🟡 MEDIUM · Çeviri kapsaması hâlâ eksik: 4.670 approved POC satırında Türkçe çeviri yok, 59 servis edilen kelime word_translations'ta karşılıksız

Approved + poc=1 satırların 4.670/73.785'inde (%6,3) translation_tr NULL/boş. Patterns ve vocab feed'leri 'sl.translation_tr IS NOT NULL' filtresiyle bu satırları sessizce düşürdüğü için kullanıcı hata görmüyor ama içerik havuzu görünmez şekilde daralıyor ve eksikler ancak elle fark ediliyor (97'lik doldurma commit'i gibi). Kelime düzeyinde: servis edilebilir satırlardaki 3.859 farklı kelimeden 59'unun word_translations karşılığı yok (karaoke kartında kelimeye dokununca çeviri çıkmaz). phrase_translations yalnızca 28 satır ve seed listesi admin/lib/db.ts:189'da hardcoded — iki kelimelik phrasal verb'lerle sınırlı. Ayrıca normalizasyon tutarsız: scenes route'unda SQL lookup TRIM(wt.word, '.,?!;:"') apostrofu soymuyor, buildBeAdjPredicate ise char(39) ile soyuyor, JS cleanWord üçüncü bir regex kullanıyor — aynı kelime üç yerde farklı normalize olup lookup kaçırabiliyor.

**Kanıt:** SQL: approved+poc satırlarda translation_tr boş → 4670/73785; served-word coverage sorgusu → 3859 kelimeden 59 eksik; word_translations COUNT=4096, phrase_translations COUNT=28.

**Dosyalar:** `admin/app/api/v1/patterns/[patternId]/scenes/route.ts:294`, `admin/app/api/v1/patterns/[patternId]/scenes/route.ts:363`, `admin/lib/db.ts:189`

**Öneri:** Coverage'ı metrikleştirin: content-health raporuna 'çevirisiz approved satır' ve 'karşılıksız kelime' sayaçları ekleyin, eşik aşılınca translate-local.ts benzeri batch'i otomatik tetikleyin. Kelime normalizasyonunu tek bir SQL fonksiyonu/utility'de toplayın.

### 🟡 MEDIUM · videos tablosunda UNIQUE(youtube_video_id) yok: 8 YouTube ID'si mükerrer kayıtlı; duration_seconds %95 NULL; tags/clip_tags ölü tablolar

Aynı YouTube videosu birden fazla videos satırı olarak girilmiş: 8 youtube_video_id mükerrer (örn. cgmgZmTMxms → coco-remember-me, coco-my-family, coco-family-reunion; fKhT2J2gnZs 3 kayıt). Şemada UNIQUE kısıtı olmadığı için pipeline'ın 'zaten var mı' kontrolü tek koruma ve delinmiş. Bu, aynı sahnenin feed'lerde iki kez üretilmesine ve oEmbed availability check'inin video başına tekrarlanmasına yol açar (scenes route text-dedupe'u kısmen maskeliyor). Ayrıca duration_seconds 1457/1532 satırda NULL (süre bazlı kalite filtresi imkânsız), tags ve clip_tags 0 satır (şema + db.ts'te CRUD kodu duruyor ama hiç kullanılmamış), video_transcripts sadece 13 satır.

**Kanıt:** SQL: GROUP BY youtube_video_id HAVING COUNT(*)>1 → 8 satır; duration_seconds IS NULL → 1457/1532; tags=0, clip_tags=0, video_transcripts=13.

**Dosyalar:** `admin/lib/db.ts:19`, `admin/scripts/copy-tokens-from-duplicates.ts`, `data.db`

**Öneri:** Duplicate'leri birleştirin (copy-tokens-from-duplicates.ts zaten var, tamamlayın), sonra 'CREATE UNIQUE INDEX idx_videos_youtube_id ON videos(youtube_video_id)' ekleyin. duration_seconds'ı yt-dlp metadata'sından backfill edin. Ölü tags/clip_tags tablolarını ve ilgili route/CRUD kodunu kaldırın.

### 🟡 MEDIUM · batch-extract-subtitles.sh taşınabilir değil ve belgelenmemiş /tmp girdisine bağımlı

Script /tmp/missing_subs.txt'ten video ID listesi okuyor ama bu dosyanın nasıl üretileceği hiçbir yerde yazmıyor (INPUT hardcoded, satır 6). Daha kötüsü satır 21'deki `head -n -1` GNU coreutils sözdizimi — macOS'un BSD head'inde 'illegal line count' hatası verir, yani script bu repoda geliştirme yapılan makinede (Darwin) response body'yi hiç parse edemez; ayrıca JSON'u grep/cut ile ayrıştırıyor. Aynı şekilde yt-dlp konumu üç ayrı dosyada (scripts/fetch-youtube-transcripts.ts:49, admin/app/api/pipeline/route.ts:23, admin/scripts/batch-whisperx.ts:24) kopyala-yapıştır 'Python/3.14, 3.13, 3.12...' path listeleriyle aranıyor.

**Kanıt:** Satır 6: INPUT="/tmp/missing_subs.txt"; satır 21: BODY=$(echo "$RESPONSE" | head -n -1) — BSD head negatif sayı desteklemez; env Darwin 25.4.0.

**Dosyalar:** `scripts/batch-extract-subtitles.sh:6`, `scripts/batch-extract-subtitles.sh:21`

**Öneri:** Script'i tsx'e taşıyıp eksik videoları doğrudan DB'den sorgulatın (batch-whisperx.ts zaten bunu yapıyor — tekilleştirin) veya en azından `sed '$d'` gibi POSIX uyumlu bir yöntem + jq kullanın. yt-dlp discovery'yi tek bir paylaşılan modüle alın.

### 🟡 MEDIUM · WhisperX ortamı pin'siz: requirements.txt sürümsüz, model/parametre kaydı yok → transkripsiyon tekrar üretilemez

scripts/requirements.txt yalnızca 'whisperx, torch, torchaudio' — hiçbir sürüm pin'i yok; whisperx/torch major sürüm değişimlerinde hizalama çıktıları (kelime timestamp'leri) değişir ve mevcut 2,2M word_timestamps satırıyla tutarsız yeni veri üretilir. whisperx_transcribe.py hata mesajında '--break-system-packages' ile global pip kurulumu öneriyor (satır 34) ama gerçek akış .venv kullanıyor (batch-whisperx.ts:17 VENV_PYTHON) — iki talimat çelişiyor. Hangi model (base.en varsayılan) ve hangi whisperx sürümüyle hangi videonun işlendiği DB'ye kaydedilmiyor; 7.1GB'lık .cache/whisperx tek kopya ve yedeklenmiyor.

**Kanıt:** requirements.txt içeriği: 'whisperx\ntorch\ntorchaudio' (26 byte, pin yok); whisperx_transcribe.py:34 'pip3 install --user --break-system-packages ...'; du .cache/whisperx → 7.1G.

**Dosyalar:** `scripts/requirements.txt`, `scripts/whisperx_transcribe.py:34`, `admin/scripts/batch-whisperx.ts:17`

**Öneri:** requirements.txt'i tam pin'leyin (whisperx==x.y.z, torch==x.y.z) veya uv/pip-tools lock dosyası ekleyin; işlenen her video için model adı + script sürümünü video_transcripts benzeri bir meta tabloya yazın; py script'indeki kurulum talimatını .venv'e işaret edecek şekilde düzeltin.

### ⚪ LOW · Legacy Expo veri katmanı ve ölü dosyalar aktif ürünle iç içe: kullanılmayan youtube-clips.json, data/scenes JSON'ları, kök scripts/ pipeline'ı

scripts/youtube-clips.json (34KB, 205 elle küratörlenmiş kayıt: Devil Wears Prada, Mean Girls...) hiçbir kod tarafından okunmuyor (repo genelinde grep → 0 tüketici) — tamamen ölü, elle bakım varsayımı da geçersiz. Kök scripts/ dizinindeki fetch-youtube-transcripts.ts / whisperx-align.ts / align-subtitles.ts / apply-alignment.ts zinciri DB'ye değil legacy data/scenes/*.json dosyalarına yazıyor; aktif pipeline admin/scripts altında yaşıyor. İki paralel 'içerik pipeline'ı yeni gelen için hangisinin gerçek olduğunu belirsizleştiriyor (bu denetimin görev tanımı bile kök scripts/'i aktif sanıyordu).

**Kanıt:** grep -rln 'youtube-clips' (node_modules hariç) → 0 sonuç; whisperx-align.ts header'ı 'updates index.ts + word-timing.json' (data/scenes hedefli); aktif akış admin/scripts/batch-whisperx.ts DB'ye yazıyor.

**Dosyalar:** `scripts/youtube-clips.json`, `scripts/whisperx-align.ts:1`, `data/scenes/youtube-transcripts.json`

**Öneri:** Legacy Expo katmanını (app/, components/, data/, kök scripts/, services/) ya ayrı bir 'legacy' branch/dizinine arşivleyin ya da silin; kalanlar için kök README'ye 'aktif: ios-native + admin' haritası yazın. youtube-clips.json'ı silin.

### ⚪ LOW · Çalışma dizini hijyeni: ~9GB+ üretilmiş/geçici dosya working tree'de birikmiş, temizlik politikası yok

Hepsi .gitignore kapsamında olsa da (bu doğru yapılmış) makinede birikim ciddi: .cache/whisperx 7.1GB (tek kopya, yedeksiz), .venv 1.2GB, node_modules 482MB + admin/node_modules 393MB, ios-native/build 146MB, iki DB backup'ı ~404MB, data.db-shm/-wal artıkları (shm bugün bile güncellenmiş — bir süreç DB'yi açık tutuyor). .expo ve .vscode gibi kalıntılar da duruyor. Disk dolması bir yana, .cache'in kaybı tüm WhisperX çıktılarının (saatlerce GPU/CPU işi) yeniden üretilmesini gerektirir ve pin'siz ortam yüzünden birebir aynı çıktı garanti değildir.

**Kanıt:** du: .cache 7.1G, .venv 1.2G, node_modules 482M+393M, ios-native/build 146M; ls -la → data.db-shm mtime Jul 2 09:52 (açık bağlantı); backup'lar Apr 29 + May 2 tarihli.

**Dosyalar:** `.cache/`, `.venv/`, `data.db.backup-pre-tagger-rewrite-20260502-210404`

**Öneri:** Backup'ları ve .cache/whisperx'i repo dışına (harici disk/S3) taşıyın; işlenmiş ham WhisperX JSON'larını asıl kalıcı veri olarak saklamayı düşünün (audio wav'lar yeniden indirilebilir, JSON'lar değerli). Aylık 'du -sh' kontrolü ve temizlik adımını PIPELINE.md'ye ekleyin.

### ⚪ LOW · Patterns scenes endpoint'i sınırsız tarama yapıyor: SQL'de LIMIT yok, 2,2M satırlık word_timestamps üzerinde iç içe EXISTS'ler her istekte koşuyor

GET /api/v1/patterns/[id]/scenes önce TÜM eşleşen satırları çekiyor (sorguda LIMIT yok, limit ancak JS'te shuffle sonrası slice ile uygulanıyor — route.ts:351), her satır için ~200 elemanlı IN listeleriyle 3 seviye iç içe EXISTS subquery çalıştırıyor. word_timestamps'te (line_id, word_index) bileşik index'i yok (yalnızca line_id index'i var). Corpus büyüdükçe (yorumda 'dropped the v.poc=1 restriction once the akış started starving' — filtre zaten genişletilmiş) bu sorgu Fly'ın küçük makinesinde belirgin gecikme üretir; Dockerfile'a warmup.sh eklenmesi cold-start acısının zaten yaşandığını gösteriyor.

**Kanıt:** route.ts:268-297 sorgusunda LIMIT yok; :351 'shuffle(usable).slice(0, limit)'; canlı şemada yalnız idx_word_timestamps_line_id var; Dockerfile CMD 'scripts/warmup.sh && npm run start'.

**Dosyalar:** `admin/app/api/v1/patterns/[patternId]/scenes/route.ts:268`, `admin/app/api/v1/patterns/[patternId]/scenes/route.ts:351`, `admin/Dockerfile`

**Öneri:** Sonucu pattern başına cache'leyin (feed 'rastgele örneklem' olduğu için 5-10 dk'lık in-memory cache yeterli) veya eşleşen line_id'leri önceden hesaplayıp bir pattern_lines tablosunda tutun; word_timestamps(line_id, word_index) bileşik index'i ekleyin.

---

## Repo Sağlığı & Legacy Katman

**Genel durum:** Repo, aktif ürün olan SwiftUI uygulaması (ios-native, TestFlight 1.0.1 b2), emekli edilmiş ama silinmemiş bir Expo/RN uygulaması (kök) ve Fly.io'da koşan bir Next.js admin backend'ini tek çatı altında, monorepo disiplini olmadan barındırıyor. En kritik sorunlar: 220MB canlı SQLite'ın git/LFS'te versiyonlanması sonucu 12GB'a şişen .git; iş mantığının iki yerde (TS + Swift) birbirinden farklı davranan kopyaları (SM-2 aralıkları ve günlük plan üretimi uyumsuz, testler ise sadece ölü TS tarafını doğruluyor); ve CI'ın fiilen yokluğu (tek workflow, 24 commit geride kalmış main'den legacy web'i deploy ediyor — iOS build/test/lint hiç koşmuyor). Jest suite'i 6/10 başarısız ve kök `tsc --noEmit` 96 hata veriyor; bu, CLAUDE.md'deki 'önce reprodüksiyon testi yaz' iş akışını uygulanamaz kılıyor. Sürümleme elle ve tuzaklı: pbxproj 1.0.1/b2 derken project.yml 1.0.0/b1, git tag ve changelog yok. Legacy katmanın arşivlenip silinmesi, data.db'nin git'ten çıkarılması ve minimal bir iOS CI kurulması repo sağlığını en hızlı düzeltecek üç adım.

**Korunması gereken güçlü yanlar:**
- ios-native katman yapısı temiz ve tutarlı: App/Models/Services/State/Features ayrımı, actor tabanlı APIClient (retry + exponential backoff + env/Info.plist ile base URL override), TTL'li disk cache — ios-native/README.md bu mimariyi doğru anlatıyor.
- xcodegen (project.yml) ile declarative Xcode proje tanımı — pbxproj merge cehennemini azaltan iyi bir tercih (sürüm alanı senkron tutulmak şartıyla).
- TS servisleri test edilebilir yazılmış: spacedRepetition.computeNextReview ve generateDailyPlan pure function; __tests__/spaced-repetition.test.ts ve daily-task-generator.test.ts hâlâ yeşil — bu senaryolar Swift'e port için hazır spec niteliğinde.
- admin/ alt projesi kendi içinde iyi dokümante: README.md + CLAUDE.md + AGENTS.md + Dockerfile + fly.toml; prod DB'nin Fly volume'de (DATABASE_PATH=/data/admin.db) tutulması doğru ayrım.
- gitignore disiplini katman bazında yerinde: admin/*.db ignore, ios-native/build ignore, kökte .cache/.venv/ios ignore — dev artıkları en azından git'e sızmıyor.
- Privacy policy'nin GitHub Pages üzerinden App Store Connect'e servis edilmesi fikri doğru (sadece legacy Expo build'e zincirlenmesi sorunlu).
- data.db için en azından git LFS kullanılmış (düz blob yerine) ve şema migration'ları admin/lib/db.ts içinde merkezileştirilmiş.

### 🔴 CRITICAL · Canlı 220MB SQLite (data.db) git/LFS'te versiyonlanıyor — .git dizini 12GB'a şişmiş — ✅ bağımsız doğrulandı

Repo kökündeki data.db (221MB, admin backend'in canlı içerik DB'si) .gitattributes ile git LFS'e alınmış ve içerik pipeline'ının her çalışmasında yeniden commit ediliyor (git log'da 14+ data.db commit'i var). Sonuç: lokal .git dizini 12GB (bunun 11GB'ı .git/lfs). GitHub LFS ücretsiz kotası (1GB depolama/1GB bant genişliği) bu boyutta çoktan aşılmış olmalı; her clone/pull ağır. Ayrıca canlı bir SQLite dosyasını (WAL/SHM ile birlikte yazılan) versiyonlamak, çalışma ağacını sürekli kirli bırakır ve merge edilemez. Diskte ayrıca ~400MB untracked yedek (data.db.backup-*) duruyor.

**Kanıt:** .gitattributes: 'data.db filter=lfs diff=lfs merge=lfs -text'; `du -sh .git .git/lfs` → 12G / 11G; `git log --oneline --all -- data.db` → 14+ commit (3d0561b, eb9d8be, 88b8bb7, c09597c...); kökte data.db.backup-2026-04-29 (193M) + data.db.backup-pre-tagger-rewrite-20260502 (211M). Prod zaten ayrı: admin/fly.toml DATABASE_PATH=/data/admin.db (Fly volume).

**Dosyalar:** `.gitattributes:1`, `admin/fly.toml:8`, `admin/lib/db.ts:14`

**Öneri:** data.db'yi git'ten tamamen çıkarın (.gitignore'a ekleyin); kanonik veri zaten Fly.io volume'ünde. Yerel geliştirme için `flyctl ssh sftp get` ya da bir seed script'i ile DB indirme akışı yazın; şema için SQL migration dosyalarını versiyonlayın (veriyi değil). Tarihçeyi küçültmek için git-filter-repo ile LFS objelerini temizleyip force-push planlayın. Yedekleri repo dışına (ör. ~/Backups) taşıyın.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru. Kanıtlar: (1) .gitattributes:1 birebir 'data.db filter=lfs diff=lfs merge=lfs -text' içeriyor ve data.db HEAD'de LFS pointer olarak track ediliyor (git cat-file → oid sha256..., size 221642752 ≈ 221MB). (2) du ölçümü: .git = 12G, .git/lfs = 11G; .git/lfs/objects altında 58 LFS objesi var (çoğu ~200MB'lık data.db sürümleri). (3) git log --all -- data.db = tam 15 commit (iddia '14+', tutuyor; 3d0561b, eb9d8be, 88b8bb7, c09597c dahil). (4) Remote GitHub (github.com/ismetaba/english-learning-app), yani ücretsiz LFS kotası (1GB depolama/1GB bant genişliği) endişesi geçerli — 11GB lokal LFS objesiyle aşım çıkarımı makul (sunucu tarafı kota durumu lokalden doğrulanamaz, bulgudaki tek çıkarımsal kısım bu). (5) Yedekler: data.db.backup-2026-04-29 (193M) + data.db.backup-pre-tagger-rewrite-20260502-210404 (211M) ≈ 404MB, .gitignore:50 'data.db.backup-*' ile ignore edilmiş (track edilmiyor). (6) Prod ayrımı doğru: admin/fly.toml [env] DATABASE_PATH="/data/admin.db" (satır 7, iddiada 8 denmiş — önemsiz sapma) + Fly volume mount; admin/lib/db.ts:14 fallback olarak repo kökündeki data.db'yi kullanıyor. Ek kanıt: data.db-shm dosyası bugün (2 Tem 10:02) değişmiş — DB hâlâ aktif yazılıyor, canlı SQLite'ın versiyonlanması riski güncel. Küçük nüans: şu an git status temiz, yani 'sürekli kirli çalışma ağacı' anlık değil potansiyel bir sorun; bu, bulgunun özünü (12GB .git şişmesi + LFS'te canlı DB versiyonlama) değiştirmiyor.

</details>

### 🟠 HIGH · Jest test suite kırık: 10 suite'ten 6'sı FAIL, jest yanlışlıkla admin script'lerini de topluyor — ✅ bağımsız doğrulandı

Kök dizinde `npx jest` koşulduğunda 6/10 suite başarısız (11 failed / 158 passed). İki ayrı sorun var: (1) Legacy veri/testler çürümüş — __tests__/scenes-dialogue.test.ts (Forrest Gump/Finding Nemo replik doğrulamaları), __tests__/scenes-youtube-sync.test.ts ve __tests__/youtube-error-handling.test.ts (component kaynak kodunu regex'le okuyan kırılgan testler) artık geçmiyor. (2) jest.config.js hiçbir testPathIgnorePatterns içermediği için admin/scripts/rule-based-tagger.test.ts (jest testi değil, process.exit(0) çağıran standalone script) jest worker'ını çökertiyor ('A jest worker process crashed'). CLAUDE.md'deki tek talimat 'bug'ı önce testle reprodüksiyon yap' iken test altyapısının kırık olması bu iş akışını fiilen geçersiz kılıyor.

**Kanıt:** jest çıktısı: 'Test Suites: 6 failed, 4 passed' — FAIL: admin/scripts/rule-based-tagger.test.ts (process.exit called with "0", jest.config.js'te ignore yok), admin/scripts/lib/inflections.test.ts, __tests__/scenes-dialogue.test.ts:67-111, __tests__/scenes-youtube-sync.test.ts:136, __tests__/youtube-error-handling.test.ts:151, __tests__/subtitle-sync.test.ts. jest.config.js sadece 4 satır: preset+moduleNameMapper, ignore pattern yok.

**Dosyalar:** `jest.config.js:1`, `__tests__/scenes-dialogue.test.ts:67`, `__tests__/youtube-error-handling.test.ts:151`, `admin/scripts/rule-based-tagger.test.ts:126`

**Öneri:** jest.config.js'e `testPathIgnorePatterns: ['/node_modules/', '/admin/']` ve `roots: ['<rootDir>/__tests__']` ekleyin. Çürümüş legacy scene testlerini ya güncel veriyle düzeltin ya da legacy katmanla birlikte silin. admin script testleri jest'e taşınacaksa process.exit yerine expect kullanılmalı; kalacaksa `admin` kendi test runner'ıyla (tsx) ayrı koşulmalı. Sonrasında CI'da `npm test`i zorunlu hale getirin.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı: kökte `npx jest` → 'Test Suites: 6 failed, 4 passed, 10 total; Tests: 11 failed, 158 passed, 169 total'. FAIL listesi iddiadaki 6 suite ile birebir aynı. jest.config.js'te testPathIgnorePatterns yok (yalnızca preset/testEnvironment/moduleNameMapper; not: 4 değil 7 satır — önemsiz fark). admin/scripts/rule-based-tagger.test.ts:126 process.exit(0) çağırıyor ve jest çıktısında 'A jest worker process (pid=23317) crashed' görüldü. Ek kanıt: admin/scripts/lib/inflections.test.ts:57 de process.exit(1) çağıran standalone script; __tests__/youtube-error-handling.test.ts:140-143 ScenePlayer.tsx/ClipPlayer.tsx kaynak kodunu readFileSync ile okuyan kırılgan testler; subtitle-sync.test.ts'te 'Fish are friends' yerine 'Whoa!' dönüyor (çürümüş sahne verisi). CLAUDE.md'deki tek talimat test-first bug reproduction olduğundan bulgunun 'iş akışını fiilen geçersiz kılıyor' değerlendirmesi de yerinde.

</details>

### 🟠 HIGH · İki ayrı Spaced Repetition implementasyonu ve davranışları uyumsuz; Swift tarafı testsiz — ✅ bağımsız doğrulandı

SM-2 algoritması hem services/spacedRepetition.ts hem ios-native SpacedRepetition.swift içinde ayrı ayrı yazılmış ve davranışlar farklı: TS'te yeni kelime interval=1 ile başlar ve ilk doğru cevapta interval = round(1×2.5) = 3 gün olur (spacedRepetition.ts:39,60). Swift'te interval=0 başlar; ilk doğru 1 gün, ikinci doğru 3 gün, sonra EF çarpanı (SpacedRepetition.swift:24,40-42). Yani ilk tekrar tarihleri iki implementasyonda farklı. Swift dosyasının başındaki '/// ...matching the RN service behavior' yorumu (satır 3) yanlış/yanıltıcı. Üstüne: TS tarafında kapsamlı test var (__tests__/spaced-repetition.test.ts PASS) ama artık ürün olmayan kodu test ediyor; üründeki Swift SR'ın hiç unit testi yok. Ayrıca Swift isoDay() DateFormatter'ı locale set etmeden dateFormat kullanıyor (SpacedRepetition.swift:13-16) — kullanıcının cihazı Gregoryen dışı takvimdeyse (ör. Buddhist) yanlış yıl üretebilir; nextReviewDate hesabı da GMT formatter + lokal gün bileşenleri karışımı (satır 53-56, TS ise saf UTC).

**Kanıt:** services/spacedRepetition.ts:39 `interval: 1` + :60 `Math.max(1, Math.round(entry.interval * entry.easeFactor))` → ilk doğru = 3 gün. ios-native/EnglishLearning/Services/SpacedRepetition.swift:24 `interval: 0`, :40-42 `if e.interval == 0 { 1 } else if e.interval == 1 { 3 } else {...}` → ilk doğru = 1 gün. Swift:3 'matching the RN service behavior'. ios-native/EnglishLearningTests/ altında SR testi yok (sadece YouTubePlayer + TurkishPhonetics).

**Dosyalar:** `services/spacedRepetition.ts:60`, `ios-native/EnglishLearning/Services/SpacedRepetition.swift:3`, `ios-native/EnglishLearning/Services/SpacedRepetition.swift:40`, `__tests__/spaced-repetition.test.ts`

**Öneri:** Tek doğru davranışı seçin (Swift'teki 1→3→EF merdiveni SM-2'ye daha yakın), yanıltıcı yorumu düzeltin ve TS testlerinin Swift'e portunu EnglishLearningTests altına yazın (computeNextReview pure olduğu için kolay). isoDay'de `Locale(identifier: "en_US_POSIX")` + sabit takvim kullanın; gün hesabını tek bir timezone üzerinden yapın. Legacy TS SR dosyası legacy ile birlikte silinmeli.

<details><summary>Doğrulayıcı notu</summary>

Bulgu tamamen doğrulandı. (1) services/spacedRepetition.ts:39 interval=1 başlar, :60 gereği ilk doğru cevap round(1×2.5)=3 gün verir; ios-native/EnglishLearning/Services/SpacedRepetition.swift:24 interval=0 başlar, :40-42 gereği ilk doğru 1 gün, ikinci 3 gün — ilk tekrar tarihleri gerçekten uyumsuz. Ek uyumsuzluk: yanlış cevap sonrası TS round(1×EF)≈2 gün verirken Swift 'interval==1' dalıyla her zaman 3 gün verir. (2) Swift:3'teki 'matching the RN service behavior' yorumu aynen mevcut ve yanlış. (3) Test asimetrisi doğru: npx jest __tests__/spaced-repetition.test.ts bizzat çalıştırıldı, 31/31 PASS (legacy kod); ios-native/EnglishLearningTests/ altında sadece TurkishPhonetics + 2 YouTubePlayer test dosyası var, SR testi yok — oysa SpacedRepetition üründe aktif kullanılıyor (AppState.swift, DailyTasksView.swift, VocabReviewView.swift). (4) Tarih iddiaları da kodda mevcut: isoDay (Swift:12-17) locale/calendar set etmeden dateFormat kullanıyor (Apple QA1480 tuzağı); :53-56 lokal timeZone'lu Calendar bileşenleri + GMT formatter karışımı — hedef kitle UTC+3 (Türkiye) için lokal gece yarısı GMT'de önceki güne düştüğünden interval fiilen 1 gün kısalabiliyor (off-by-one), TS ise saf UTC. High severity yerinde.

</details>

### 🟠 HIGH · dailyTaskGenerator.ts'in Swift 'karşılığı' tamamen farklı davranıyor; test edilen kod ürün değil — ✅ bağımsız doğrulandı

services/dailyTaskGenerator.ts kişiselleştirilmiş plan üretir: dailyGoalMinutes bütçesi, %40 grammar / %40 vocab / %20 yeni içerik dağılımı, recency+errorCount ağırlıklı ders seçimi, bütçe yeniden dağıtımı (312 satır). ios-native'deki karşılığı DailyTasksView.buildPlan() ise kendi yorumuyla 'simple local version of dailyTaskGenerator.ts' — her gün sabit 4 görev (180sn vocab, 240sn grammar, 180sn new-content, 120sn listening) üretir; dailyGoalMinutes'i, vocab due kuyruğunu, ağırlıklandırmayı tamamen yok sayar. UserProgress.dailyGoalMinutes alanı Swift'te tanımlı ama plan üretiminde kullanılmıyor. __tests__/daily-task-generator.test.ts PASS oluyor ama üründe koşmayan TS kodunu doğruluyor — yanlış güven veriyor.

**Kanıt:** ios-native/EnglishLearning/Features/DailyTasks/DailyTasksView.swift:110 '// MARK: - Plan builder (simple local version of dailyTaskGenerator.ts)' ve :120-155 sabit 4 item; services/dailyTaskGenerator.ts:218-229 (bütçe %40/40/20) ve :79-117 (ağırlıklı seçim); ios-native/EnglishLearning/Models/Progress.swift:150 `dailyGoalMinutes: Int = 10` plan builder'da hiç okunmuyor.

**Dosyalar:** `ios-native/EnglishLearning/Features/DailyTasks/DailyTasksView.swift:110`, `services/dailyTaskGenerator.ts:218`, `ios-native/EnglishLearning/Models/Progress.swift:150`

**Öneri:** Ürün kararını netleştirin: basit plan yeterliyse TS generator + testini silin ve Swift'teki basitleştirmeyi dokümante edin; kişiselleştirilmiş plan isteniyorsa dailyTaskGenerator mantığını Swift'e (pure struct/enum olarak) port edip TS testlerini XCTest'e taşıyın. Her iki durumda da 'iki kaynak, tek doğruluk yok' durumunu bitirin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğrulandı. (1) DailyTasksView.swift:108'de 'simple local version of dailyTaskGenerator.ts' yorumu birebir mevcut (bulguda :110 denmiş, gerçekte :108 — önemsiz); :121-156'da sabit süreli görevler (vocab 180sn, grammar 240sn, new-content 180sn, listening 120sn) üretiliyor; dailyGoalMinutes bütçesi, vocabWordsDue kuyruğu ve ağırlıklandırma yok. Küçük nüans: grammar+new-content görevleri curriculum yüklenip mastered olmayan ders varsa ekleniyor, yani 'sabit 4' değil 'en fazla 4' — bu, basitlik iddiasını zayıflatmaz. (2) services/dailyTaskGenerator.ts:218-229 dailyGoalMinutes*60 bütçesi ve %40/40/20 dağılımı, :79-117 recency+errorCount ağırlıklı seçim, :247-295 bütçe yeniden dağıtımı — iddia edildiği gibi. (3) Ek kanıt: dailyGoalMinutes ios-native genelinde yalnızca 2 yerde geçiyor: tanım (Progress.swift:150, default 10) ve tek yazma noktası AppState.swift:163 (completeOnboarding) — hiçbir yerde OKUNMUYOR; onboarding'de kullanıcıdan alınan değer plan üretimini etkilemiyor. (4) npx jest __tests__/daily-task-generator.test.ts → 19/19 PASS; generateDailyPlan yalnızca legacy Expo dosyalarından (app/daily-tasks.tsx, components/DailyTaskCard) import ediliyor, aktif ürün ios-native'de koşmuyor. Test yeşili aktif ürün davranışı hakkında yanlış güven veriyor.

</details>

### 🟠 HIGH · CI/CD fiilen yok: tek workflow legacy Expo web'i GitHub Pages'e deploy ediyor; iOS build/test/lint hiçbir yerde koşmuyor — ✅ bağımsız doğrulandı

.github/workflows altında tek dosya var: deploy.yml — sadece main branch push'unda legacy Expo uygulamasının web export'unu GitHub Pages'e atıyor. Aktif ürün olan ios-native için hiçbir otomasyon yok: xcodebuild test koşulmuyor (EnglishLearningTests hiç CI görmemiş), jest koşulmuyor, SwiftLint/SwiftFormat konfigürasyonu yok (ios-native'de arama sonuç vermiyor), ESLint kökte yok. Üstelik geliştirme native-ios-swift branch'inde yapılıyor ve main 24 commit geride (son commit 2026-05-16) — yani mevcut tek CI tetikleyicisi olan main'e push da fiilen olmuyor. TestFlight release'leri tamamen elle (Xcode) alınıyor.

**Kanıt:** `ls .github/workflows` → sadece deploy.yml; deploy.yml:4-5 `on: push: branches: [main]`, :37 `npx expo export --platform web`. `git branch -vv` → main 95068e2 (2026-05-16), `git log --oneline main..HEAD | wc -l` → 24. ios-native içinde swiftlint/swiftformat/fastlane grep'i boş. Kök package.json'da lint script'i yok.

**Dosyalar:** `.github/workflows/deploy.yml:4`, `ios-native/EnglishLearningTests/`

**Öneri:** native-ios-swift'i main'e merge edip tek ana branch'e dönün. Minimum CI: (1) PR'da `xcodebuild test -project ios-native/EnglishLearning.xcodeproj -scheme EnglishLearning -destination 'generic/platform=iOS Simulator'` (macos runner), (2) `npm test` (jest düzeltildikten sonra), (3) SwiftLint. Release için fastlane veya Xcode Cloud ile TestFlight upload'ı otomatikleştirin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu tamamen doğru. .github/workflows altında tek dosya deploy.yml; satır 3-5 sadece main push'unda tetikleniyor (satır 6'da ek workflow_dispatch var ama manuel), satır 37 'npx expo export --platform web' ile legacy Expo web'i GitHub Pages'e deploy ediyor — xcodebuild/jest/lint adımı yok. main 95068e2'de (2026-05-16) ve native-ios-swift ondan 24 commit ileride, yani tek CI tetikleyicisi fiilen çalışmıyor. Ek kanıt: ios-native/EnglishLearningTests/ 3 gerçek test dosyası içeriyor (TurkishPhoneticsTests, YouTubePlayerEmbedIntegrationTests, YouTubePlayerViewTests) ve project.yml'de bundle.unit-test olarak tanımlı ama hiçbir otomasyon koşturmuyor; repo genelinde swiftlint/swiftformat/fastlane/ci_scripts(Xcode Cloud)/.circleci/Jenkinsfile/bitrise/codemagic hiçbiri yok; kök package.json'da lint script'i ve eslint bağımlılığı yok, 'test: jest' var ama CI'da çağrılmıyor.

</details>

### 🟠 HIGH · Sürüm çelişkisi: project.yml 1.0.0/build 1, pbxproj 1.0.1/build 2 — xcodegen regen sürümü sessizce geri alır — ✅ bağımsız doğrulandı

ios-native README 'Xcode projesi yoksa `xcodegen generate` ile project.yml'den yeniden üret' diyor. Ama TestFlight sürüm bump'ı (commit 765fc38) yalnızca commit'lenmiş project.pbxproj'a işlenmiş: pbxproj MARKETING_VERSION=1.0.1 / CURRENT_PROJECT_VERSION=2 iken project.yml hâlâ 1.0.0 / 1. Bir sonraki `xcodegen generate` sürümü ve build numarasını sessizce 1.0.0/1'e döndürür ve App Store Connect'e yükleme 'build already exists' ya da sürüm geriye gitti hatasıyla patlar. Ayrıca repo'da hiç git tag yok, CHANGELOG yok; hangi commit'in TestFlight 1.0.1(2)'ye karşılık geldiği sadece commit mesajından biliniyor.

**Kanıt:** ios-native/project.yml:12-13 `MARKETING_VERSION: "1.0.0"` / `CURRENT_PROJECT_VERSION: "1"`; ios-native/EnglishLearning.xcodeproj/project.pbxproj:599,621 `CURRENT_PROJECT_VERSION = 2` / `MARKETING_VERSION = 1.0.1`; ios-native/README.md 'xcodegen generate' talimatı; `git tag -l` boş.

**Dosyalar:** `ios-native/project.yml:12`, `ios-native/EnglishLearning.xcodeproj/project.pbxproj:621`, `ios-native/README.md`

**Öneri:** Sürümün tek kaynağını project.yml yapın (1.0.1/2'ye güncelleyin) ve bump'ları hep orada yapıp `xcodegen generate` sonrası pbxproj'u commit'leyin — ya da pbxproj'u kaynak kabul edip README'deki regen talimatına uyarı ekleyin. Her TestFlight yüklemesinde `ios-v1.0.1-b2` formatında git tag atın; basit bir CHANGELOG.md tutun.

<details><summary>Doğrulayıcı notu</summary>

Bulgu birebir doğrulandı: (1) ios-native/project.yml:12-13 hâlâ MARKETING_VERSION: "1.0.0" / CURRENT_PROJECT_VERSION: "1". (2) ios-native/EnglishLearning.xcodeproj/project.pbxproj:599,621 (ve Release config'de 669,685) CURRENT_PROJECT_VERSION = 2 / MARKETING_VERSION = 1.0.1. (3) ios-native/README.md:12 'xcodegen generate' talimatını içeriyor. (4) `git tag -l` boş, repoda CHANGELOG dosyası yok. (5) `git show --stat 765fc38` bump commit'inin yalnızca project.pbxproj + Info.plist'i değiştirdiğini, project.yml'a dokunmadığını kanıtlıyor. EK KANIT — bulgu daha da ciddi: Info.plist (ios-native/EnglishLearning/Resources/Info.plist:21-24) 1.0.1/2 değerlerini hardcode ediyor ve bu bir güvenlik ağı gibi görünebilir; ama project.yml:31-32'deki `info: path: EnglishLearning/Resources/Info.plist` bloğu yüzünden xcodegen generate bu Info.plist dosyasını da properties'ten YENİDEN ÜRETİR (xcodegen `info` anahtarı dosyayı overwrite eder) ve project.yml'ın info.properties'inde sürüm anahtarları olmadığından CFBundleShortVersionString/CFBundleVersion varsayılanlara (1.0/1) döner. Yani regen hem pbxproj'u hem Info.plist'i sessizce geri alır; sonraki App Store Connect yüklemesi 1.0.0(1) ile sürüm-geri-gitti/duplicate build hatası üretir. Küçük nüans: README regen'i 'proje dosyası yoksa' senaryosu için öneriyor, yani hata ancak biri xcodegen çalıştırırsa tetiklenir — ama drift gerçek ve tespit edilmesi zor olduğundan [high] derecesi makul.

</details>

### 🟡 MEDIUM · Legacy Expo katmanı ölü kod ama silinmemiş; üstelik App Store privacy policy URL'i legacy web build'ine zincirlenmiş

app/, components/, services/, hooks/, contexts/, i18n/, data/, utils/, constants/ (legacy RN) son olarak 2026-04-30'da (d38a508) dokunulmuş; ios-native (son commit 2026-05-16 + aktif geliştirme) bu koda hiç referans vermiyor — README'si 'runs independently of the React Native codebase' diyor. Yani ~binlerce satır ölü kod repo'da duruyor ve (SR, daily task, i18n örneklerinde görüldüğü gibi) 'hangisi doğru davranış?' karışıklığı üretiyor. Tek canlı bağımlılık dolaylı: main'deki deploy.yml, App Store Connect'e verilen privacy policy sayfasını (docs/privacy.html) legacy Expo web export'unun İÇİNE kopyalayarak GitHub Pages'te yayınlıyor. Yani statik bir HTML sayfasını yayında tutmak, React 19 + Expo 55'lik legacy build'in sonsuza dek derlenebilir kalmasına bağlı — kırılgan bir zincir.

**Kanıt:** `git log -1 -- app/` → 2026-04-30 d38a508; ios-native/README.md: 'no Expo, no CocoaPods, no bridges'; main:.github/workflows/deploy.yml 'Copy standalone static pages (privacy policy)' adımı `cp -R docs/. dist/` ile expo export çıktısına kopyalıyor; `git show main:docs` → privacy.html. i18n/index.ts (600 satır) vs ios-native Localization.swift (300 satır, en/tr/es/ar/zh/pt) iki ayrı çeviri tablosu.

**Dosyalar:** `app/`, `services/`, `ios-native/README.md`, `.github/workflows/deploy.yml:37`

**Öneri:** Legacy katmanı ayrı bir arşiv branch'ine (ör. legacy-expo) alıp main/native-ios-swift'ten silin. Privacy policy'yi expo export'tan bağımsızlaştırın: deploy.yml'i sadece docs/ klasörünü Pages'e yükleyecek şekilde sadeleştirin (actions/upload-pages-artifact ile docs/ yeterli). Silme öncesi davranış referansı gereken dosyaları (dailyTaskGenerator.ts gibi) ios-native/docs altına 'spec' olarak not edin.

### 🟡 MEDIUM · Kök tsconfig tüm repoyu kapsıyor; `tsc --noEmit` 96 hata veriyor (admin path çakışması + legacy'de gerçek tip hataları)

Monorepo yapısı (workspaces) olmadığı hâlde kök tsconfig.json `include: ["**/*.ts", "**/*.tsx"]` ile admin/ ve scripts/ dahil her şeyi kapsıyor. Kökten `npx tsc --noEmit` 96 hata üretiyor: (1) admin route'ları kökün `@/* → ./*` path mapping'iyle çözülmediği için tüm `@/lib/db` importları TS2307 patlıyor (admin'in kendi tsconfig'i var ama kök derleme onu görmüyor); (2) legacy kodda gerçek hatalar birikmiş: app/learn/[lessonId].tsx:293-294 TS1117 (aynı isimli property iki kez), components/LessonClipPlayer/LessonClipPlayer.tsx:242+ var olmayan stil property'leri (TS2339/TS2551). Yani hiçbir katman için güvenilir bir typecheck komutu yok.

**Kanıt:** `npx tsc --noEmit 2>&1 | wc -l` → 96; örnekler: admin/app/api/clips/route.ts(2) TS2307 '@/lib/db'; app/learn/[lessonId].tsx(293) TS1117; components/LessonClipPlayer/LessonClipPlayer.tsx(242) TS2551 'targetCard'. tsconfig.json:11-16 include kapsamı; admin/tsconfig.json ayrı ama kök derlemede etkisiz.

**Dosyalar:** `tsconfig.json:11`, `app/learn/[lessonId].tsx:293`, `components/LessonClipPlayer/LessonClipPlayer.tsx:242`, `admin/tsconfig.json`

**Öneri:** Kök tsconfig'e `exclude: ["admin", "ios-native", "node_modules"]` ekleyin (admin kendi tsconfig'iyle `cd admin && npx tsc --noEmit` ile kontrol edilir). Legacy silinince kök TS yüzeyi zaten scripts/ + __tests__/'e iner. CI'da her paketin kendi typecheck'ini ayrı adım olarak koşturun. Alternatif: npm workspaces'a geçip katmanları resmi paketlere ayırın.

### 🟡 MEDIUM · iOS uygulamasında ATS tamamen kapalı: NSAllowsArbitraryLoads=true

project.yml, Info.plist'e `NSAppTransportSecurity: NSAllowsArbitraryLoads: true` yazıyor — yani App Transport Security TÜM bağlantılar için devre dışı. Backend zaten HTTPS (https://english-learning-admin.fly.dev, APIClient.swift:37) ve YouTube embed'leri de HTTPS; bu istisnaya görünür bir ihtiyaç yok. TestFlight/App Store review'da ATS istisnası gerekçe ister; ayrıca uygulamanın herhangi bir yerinden yapılacak http:// isteği sessizce mümkün hale gelir (MITM yüzeyi).

**Kanıt:** ios-native/project.yml:43-44 `NSAppTransportSecurity: NSAllowsArbitraryLoads: true`; ios-native/EnglishLearning/Services/APIClient.swift:37 default base https. Lokal geliştirme override'ı zaten env/Info.plist ADMIN_API_BASE_URL ile yapılıyor (APIClient.swift:34-38).

**Dosyalar:** `ios-native/project.yml:43`, `ios-native/EnglishLearning/Services/APIClient.swift:37`

**Öneri:** NSAllowsArbitraryLoads'u kaldırın. Lokal HTTP backend'e ihtiyaç varsa yalnızca DEBUG konfigürasyonunda `NSAllowsLocalNetworking: true` veya localhost'a özel `NSExceptionDomains` tanımlayın; release Info.plist'te hiçbir ATS istisnası olmasın.

### 🟡 MEDIUM · Aktif üründe (ios-native) test kapsamı çok zayıf: ~46 kaynak dosyaya karşı 3 test dosyası / 9 test

ios-native/EnglishLearningTests altında yalnızca TurkishPhoneticsTests (4 test), YouTubePlayerViewTests (4) ve YouTubePlayerEmbedIntegrationTests (1) var. Uygulamanın çekirdek iş mantığı — SpacedRepetition, AppState (progress/streak/XP persistence), APIClient decode/retry, CacheService TTL, DailyTasks plan builder — tamamen testsiz. Buna karşılık repo'daki asıl test yatırımı (__tests__/, 169 test) artık ürün olmayan TS koduna yapılmış durumda. CLAUDE.md'nin 'önce reprodüksiyon testi yaz' talimatı, üründe test altyapısı bu kadar inceyken uygulanamaz.

**Kanıt:** `grep -c "func test" ios-native/EnglishLearningTests/*.swift` → 4+4+1=9; `find ios-native -name '*.swift' | wc -l` → 49 (3'ü test). SpacedRepetition.swift, AppState.swift, APIClient.swift, CacheService.swift için hiçbir test dosyası yok. project.yml'de EnglishLearningTests target'ı tanımlı (satır 58-70) ama CI'da hiç koşmuyor.

**Dosyalar:** `ios-native/EnglishLearningTests/`, `ios-native/EnglishLearning/Services/SpacedRepetition.swift`, `ios-native/EnglishLearning/State/AppState.swift`, `ios-native/project.yml:58`

**Öneri:** Önce pure logic'e test yazın (hızlı kazanım): SpacedRepetition.computeNextReview/dueEntries, Levels.levelFromXP, DailyTask plan builder (View'dan ayrı bir type'a çıkarıp). TS'teki spaced-repetition ve daily-task-generator test senaryolarını XCTest'e port edin. Sonra bu testleri PR CI'ına bağlayın.

### 🟡 MEDIUM · Onboarding dokümantasyonu eksik: kök README yok, CLAUDE.md 186 byte, aktif ürünün hangisi olduğu hiçbir kök dokümanda yazmıyor

Repo kökünde README.md yok. CLAUDE.md tek paragraf (sadece bug-fix iş akışı talimatı); repo'nun üç katmanı (ios-native = aktif ürün, kök = legacy Expo, admin = backend), branch stratejisi (geliştirme native-ios-swift'te), data.db'nin ne olduğu, içerik pipeline'ının (scripts/) nasıl koşulduğu hiçbir yerde anlatılmıyor. Yeni bir geliştirici `package.json`a bakıp Expo uygulamasını ürün sanır. Alt dizinlerde iyi README'ler var (ios-native/README.md, admin/README.md + admin/CLAUDE.md + admin/AGENTS.md) ama kökten onlara işaret eden hiçbir şey yok.

**Kanıt:** `ls` kökte README.md yok; CLAUDE.md 186 byte (yalnızca 'When I report a bug...' paragrafı); ios-native/README.md ve admin/README.md mevcut ve içerikli; kök package.json name='english', main='expo-router/entry' (legacy'e işaret ediyor).

**Dosyalar:** `CLAUDE.md:1`, `ios-native/README.md`, `admin/README.md`

**Öneri:** Kök README.md yazın: katman haritası (ios-native=ürün, admin=backend/Fly.io, scripts=içerik pipeline, kök RN=legacy/arşiv), aktif branch, kurulum komutları, deploy akışları. CLAUDE.md'ye de aynı katman haritasını + 'aktif ürün ios-native'dir, legacy koda dokunma' kuralını ekleyin.

### ⚪ LOW · patches/ ölü: patch 2.4.1 için yazılmış, kurulu paket 2.3.0 ve patch-package hiç kurulu değil

patches/react-native-youtube-iframe+2.4.1.patch dosyası duruyor ama üç yönden işlevsiz: (1) package.json'da react-native-youtube-iframe '^2.3.0' ve node_modules'ta kurulu sürüm 2.3.0 — patch 2.4.1'i hedefliyor; (2) package.json'da patch-package bağımlılığı ve postinstall script'i yok, yani patch hiçbir `npm install`da uygulanmıyor; (3) paket zaten legacy uygulamaya ait. Bu, 'YouTube iframe davranışını patch'ledik' yanılsaması yaratan ölü bir artefakt.

**Kanıt:** patches/react-native-youtube-iframe+2.4.1.patch mevcut; `node_modules/react-native-youtube-iframe/package.json` → "version": "2.3.0"; kök package.json'da 'postinstall' ve 'patch-package' geçmiyor; `ls node_modules/.bin | grep patch` boş.

**Dosyalar:** `patches/react-native-youtube-iframe+2.4.1.patch`, `package.json:20`

**Öneri:** patches/ dizinini silin (legacy temizliğiyle birlikte). Patch'in içeriği ios-native YouTubePlayerView için hâlâ anlamlı bir davranış düzeltmesi içeriyorsa, ilgili düzeltmenin Swift tarafında karşılığı olup olmadığını kontrol edip not düşün.

### ⚪ LOW · Stale Expo/EAS konfigürasyonu: eas.json, app.json (mükerrer Android izinleri) ve .vscode önerileri legacy'e göre

eas.json EAS build profilleri tanımlıyor ama ürün artık native Xcode ile TestFlight'a gidiyor; EAS pipeline'ı kullanılmıyor (commit geçmişinde eas build izi yok, sürüm bump'ı pbxproj'da elle). app.json'daki android.permissions dizisinde 4 izin ikişer kez tekrarlanmış (RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK) — kopyala-yapıştır artığı. .vscode/extensions.json tek öneri olarak expo-vscode-tools veriyor; aktif ürün Swift olduğu için yeni geliştiriciyi yanlış yönlendiriyor. Bunlar tek başına zararsız ama 'hangi konfig canlı?' gürültüsünü büyütüyor.

**Kanıt:** eas.json (287 byte, preview/development/production profilleri); app.json android.permissions: aynı 4 izin 8 satırda; .vscode/extensions.json `{ "recommendations": ["expo.vscode-expo-tools"] }`; sürüm yönetimi ise ios-native/pbxproj'da (commit 765fc38).

**Dosyalar:** `eas.json:1`, `app.json:28`, `.vscode/extensions.json:1`

**Öneri:** Legacy temizliğinde eas.json ve app.json'u legacy arşiv branch'ine taşıyın. Legacy bir süre kalacaksa en azından app.json'daki mükerrer izinleri temizleyin ve .vscode/extensions.json'a Swift/SweetPad gibi aktif ürüne uygun önerileri ekleyin.

### ⚪ LOW · Çalışma dizini 20GB+: .cache 7.1GB, .venv 1.2GB, üretilmiş ios/ 989MB, DB yedekleri ~400MB

Hepsi gitignore'da olsa da diskteki repo klasörü devasa: .git 12GB (ayrı bulgu), .cache 7.1GB (WhisperX ses/çıktı önbelleği), .venv 1.2GB (Python), ios/ 989MB (Expo prebuild artığı — .gitignore'da '/ios' olarak zaten 'generated' kabul edilmiş), node_modules 482MB + admin/node_modules 393MB, ios-native/build 146MB, data.db yedekleri ~404MB. Bu, Time Machine/Spotlight yükü ve 'hangi klasör gerçek?' karışıklığı yaratıyor; özellikle ios/ dizini legacy Expo native projesi olduğu için ios-native/ ile isim karışıklığına açık.

**Kanıt:** `du -sh` çıktıları: .cache 7.1G, .venv 1.2G, ios 989M, node_modules 482M, admin/node_modules 393M, ios-native/build 146M, data.db.backup-* toplam ~404M. .gitignore:41 '/ios' (generated native folders).

**Dosyalar:** `.gitignore:41`, `ios/`, `.cache/`

**Öneri:** ios/ dizinini silin (gerekirse `npx expo prebuild` yeniden üretir; legacy zaten emekli olacak). .cache içeriğini repo dışına (ör. ~/Library/Caches) taşıyın ya da pipeline'a temizleme komutu ekleyin. DB yedeklerini repo dışına arşivleyin. İsim karışıklığını bitirmek için legacy silindiğinde ios-native'i köke/ios adına taşımayı değerlendirin.

### ⚪ LOW · Ürün felsefesiyle kod çelişkisi: 'gamification yok' denirken ios-native XP/level/streak/achievement sistemi içeriyor

Ürün bağlamı ve pivot notu 'no gamification' derken, aktif Swift uygulamasının veri modeli ve UI'ı tam bir gamification katmanı taşıyor: UserProgress'te xp, level, streak, achievements alanları; Levels enum'unda XP eşikleri ve seviye adları; AppState.addXP ve XPReward sabitleri; DailyTasksView görev tamamlamada XP basıyor; Home ekranında 'XP hero' (ios-native/README.md'de de geçiyor). Bu teknik bir bug değil ama kod ile ürün yönü arasındaki bu sapma, hangi özelliğin bilinçli tutulduğunun belirsiz olduğunu gösteriyor ve ileride 'ölü feature' temizliğini zorlaştırıyor.

**Kanıt:** ios-native/EnglishLearning/Models/Progress.swift:143-157 (xp, level, streak, achievements) ve :162-174 (Levels.thresholds/names); ios-native/EnglishLearning/State/AppState.swift:110 addXP; DailyTasksView.swift:~102 `appState.addXP(XPReward.perVocab ...)`; ios-native/README.md 'Home — Dashboard with XP hero'.

**Dosyalar:** `ios-native/EnglishLearning/Models/Progress.swift:143`, `ios-native/EnglishLearning/State/AppState.swift:110`, `ios-native/EnglishLearning/Features/DailyTasks/DailyTasksView.swift`

**Öneri:** Ürün kararını netleştirip dokümante edin: gamification kalacaksa felsefe notunu güncelleyin; kalmayacaksa XP/level/achievement kodunu ve ilgili UI'ı planlı şekilde söküp UserProgress şemasında migration düşünün (UserDefaults'taki eski alanlar Codable decode'u kırmasın).

---

## Ürün / UX & App Store Hazırlığı

**Genel durum:** ios-native SwiftUI uygulaması görsel olarak özenli ve çekirdek "set izle → kelimeye dokun → akışta tekrar gör" döngüsünün ilk yarısı çalışır durumda; ancak öğrenme döngüsünün ikinci yarısı (spaced repetition review ekranı) hiçbir yerden erişilemeyen ölü kod. İlerleme tamamen UserDefaults'ta cihaza hapsolmuş (hesap/iCloud yok), izlenen video/set ilerlemesi hiç kaydedilmediği için ertesi gün açan kullanıcı "kaldığın yerden devam" göremiyor ve Profil'deki XP/istatistiklerin çoğu sadece ölü legacy ekranlardan beslendiği için kalıcı olarak sıfır görünüyor. App Store tarafında ciddi riskler var: YouTube player'ın üzerine tıklamayı bloke eden shield ve controls:0 ile YouTube API ToS ihlali, NSAllowsArbitraryLoads=true, PrivacyInfo.xcprivacy yokluğu, uygulama içinde gizlilik politikası linki yokluğu ve film klipleri için yaş derecelendirmesi/telif belirsizliği. Crash reporting/analytics tamamen yok (TestFlight'ta uçuş körlüğü), YouTube embed hatası hiçbir call site'ta ele alınmadığı için silinen video sonsuz siyah ekran demek. Monetizasyon altyapısı sıfır; lokalizasyon TR/EN karışık ve 6 dillik dil seçici gerçekte sadece kabuk.

**Korunması gereken güçlü yanlar:**
- Tab mimarisi 4 sekmeye (Kalıplar/Video/Kelimeler/Profil) indirilmiş ve Feynman pivotuyla uyumlu — bilgi mimarisi kullanıcı yüzünde sade (MainTabView.swift:46).
- Set akışındaki 'next episode' deneyimi (NextUpOverlay geri sayım halkası, SetCompleteOverlay kutlaması, cinema/portrait geçişinde pozisyon paylaşımı) üst düzey işçilik — SetDetailView.swift:278-812.
- 3 renk cümle yapısı paleti (özne mavi / fiil adaçayı yeşili / tamamlayıcı lavanta) player ve Kalıplar arasında tutarlı, renk seçim gerekçeleri kodda belgelenmiş (ClipPlayerView.swift:707, Pattern.swift:12).
- Starter-word auto-pause tasarımı düşünceli: satır sonunda duruyor, satır başına tek banner, idempotent 'Ekle' (ClipPlayerView.swift:1309-1352).
- Boş durumlar Türkçe ve yönlendirici yazılmış ('Bir set izle, altı çizili amber kelimelere dokun, Ekle'ye bas' — VocabView.swift:251, VocabFeedView.swift:107).
- APIClient temiz: actor, retry + 4xx'te retry'sız kısa devre, env/plist ile base URL override (APIClient.swift:156-192).
- YouTube embed ve Turkish phonetics için gerçek unit/integration testleri mevcut (EnglishLearningTests/).
- SetPlayerView'daki videoId-eşleşme guard'ı gibi yarış durumları kodda açıklamalı çözülmüş — mühendislik disiplini iyi (SetDetailView.swift:410-421).

### 🔴 CRITICAL · YouTube embed kullanımı ToS/telif açısından App Store reddi riski taşıyor — ✅ bağımsız doğrulandı

Player HTML'i YouTube kontrollerini tamamen gizliyor (controls:0, modestbranding, disablekb, fs:0), üzerine 'pointer-events:auto' bir shield div koyup kullanıcının player ile HER etkileşimini bloke ediyor ve youtube-nocookie host'u ile logoyu/branding'i minimize ediyor. YouTube API ToS player'ı örtmeyi, etkileşimi engellemeyi ve branding'i gizlemeyi açıkça yasaklıyor. Üstüne içerik tamamen üçüncü taraf film sahneleri — App Review Guideline 5.2.3 (hak sahibi olunmayan üçüncü taraf içerik) kapsamında ret veya yayından kaldırma riski yüksek. Uygulamanın %100 içeriği bu embed'e dayandığı için bu, ürünün varoluşsal riski.

**Kanıt:** ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:77 — '.shield{position:absolute;inset:0;...pointer-events:auto;}' ve :87 — 'playerVars:{autoplay:...,controls:0,modestbranding:1,rel:0,...,disablekb:1,fs:0,...}', :49 — youtube-nocookie.com baseURL

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:77`, `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:87`

**Öneri:** App Store'a çıkmadan önce hukuki pozisyonu netleştirin: (a) shield'i kaldırıp YouTube kontrollerini/başlık linkini görünür bırakın (ToS uyumlu embed), (b) içerik stratejisini lisanslı/kendi ürettiğiniz videolara veya Creative Commons içeriğe kaydırın, veya (c) en azından App Review notlarında embed'in resmi IFrame API ile yapıldığını belgeleyin. Mevcut haliyle 1.0 incelemesinde 5.2.3 sorusu gelirse cevap yok.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. YouTubePlayerView.swift:77-78'de player'ın üzerine tam ekran, pointer-events:auto bir '.shield' div'i konuyor (tüm dokunuşları bloke ediyor); :87'de controls:0/disablekb:1/fs:0/iv_load_policy:3 playerVars ve :49/85/90'da youtube-nocookie host birebir mevcut. Overlay, YouTube API Developer Policies'in (III.F 'Overlays and frames') açık yasağına giriyor. Ek kanıt: YouTubePlayerView uygulamadaki 4 video yüzeyinin (PatternReelsView:297, CinemaPlayerView:171, ClipPlayerView:215, VocabFeedView:251) TAMAMINDA kullanılıyor ve ios-native'de hiç AVKit/AVPlayer yok — video oynatmanın tek yolu bu embed. İçeriğin üçüncü taraf film sahnesi olduğu Models/PocVideo.swift:20 ve Models/VocabContext.swift:37'deki movieTitle alanlarıyla sabit; 'Drop unavailable pattern videos via YouTube oEmbed check' commit'i videoların YouTube tarafında şimdiden kaybolduğunu gösteriyor. Nüans: controls:0/disablekb/fs:0 belgeli API parametreleri olup tek başına ihlal değil, modestbranding 2023'ten beri no-op, nocookie host'u branding değil cookie odaklı — yani playerVars kısmı hafif abartılı; ama asıl ihlal (shield overlay + etkileşim bloke) ve varoluşsal bağımlılık kod kanıtıyla doğru.

</details>

### 🔴 CRITICAL · Kullanıcı ilerlemesi cihaza hapsolmuş — hesap, iCloud sync ve yedekleme yok — ✅ bağımsız doğrulandı

Tüm ilerleme (learnedWords, vocabPool, completedPatterns, streak, onboarding) yalnızca UserDefaults'ta. Kodda CloudKit, NSUbiquitousKeyValueStore, Sign in with Apple veya herhangi bir hesap/sunucu senkronu yok (grep sıfır sonuç). Kullanıcı telefon değiştirdiğinde ya da uygulamayı silip yüklediğinde aylarca biriktirdiği kelime havuzu ve kalıp ilerlemesi sıfırlanır. Öğrenme uygulamasında bu, en sadık kullanıcıyı kaybettiren senaryodur.

**Kanıt:** ios-native/EnglishLearning/State/AppState.swift:33-42 — 'private enum Keys { static let progress = "user_progress_v2" ... }' + 'private let defaults = UserDefaults.standard'; repo genelinde CloudKit/AuthenticationServices araması boş

**Dosyalar:** `ios-native/EnglishLearning/State/AppState.swift:33`

**Öneri:** POC aşaması için en ucuz çözüm NSUbiquitousKeyValueStore (iCloud KVS) — UserDefaults API'sine çok benzer, hesap gerektirmez ve 1MB limiti bu veri için fazlasıyla yeter. Orta vadede Sign in with Apple + backend'de progress endpoint'i (admin backend zaten var) planlanmalı.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. AppState.swift:33-42 alıntısı birebir mevcut ve ios-native'de UserDefaults kullanan tek dosya bu; UserProgress (Models/Progress.swift:138-157) learnedWords/streak/onboardingCompleted/xp dahil tüm ilerlemeyi tutuyor ve yalnızca UserDefaults.standard'a yazılıyor. CloudKit/NSUbiquitousKeyValueStore/AuthenticationServices/CKContainer araması (*.swift, *.plist, *.pbxproj dahil) sıfır sonuç; projede .entitlements dosyası hiç yok (iCloud capability tanımsız). APIClient.swift fly.dev backend'ine bağlansa da tüm metotlar fetch* ve tek httpMethod 'GET' (satır 152) — ilerleme sunucuya hiç gönderilmiyor. Tek nüans: UserDefaults iOS cihaz yedeğine dahil olduğundan tam cihaz göçünde veri taşınabilir; ama sil+yeniden yükle senaryosunda kayıp kesin ve hesap tabanlı kurtarma yolu yok, critical seviyesi yerinde.

</details>

### 🔴 CRITICAL · YouTube player hataları hiçbir yerde ele alınmıyor — silinen video = sonsuz siyah ekran — ✅ bağımsız doğrulandı

YouTubePlayerView bir onError callback'i tanımlıyor ve JS tarafı error'ı köprüden gönderiyor, ama dört call site'ın (ClipPlayerView, CinemaPlayerView, VocabFeedView, PatternReelsView) HİÇBİRİ onError parametresi geçmiyor. Video silinir/gizlenir/embed kapatılırsa (YouTube error 100/101/150) kullanıcı sadece siyah ekran görür; ilerleme currentTime tick'lerine bağlı olduğu için auto-advance de asla tetiklenmez — set akışı ölür. Commit eb9d8be'deki oEmbed temizliği tek seferlik bir script; runtime koruması değil. 100 videoluk POC'ta tek bir videonun ölmesi bile seti kullanılamaz hale getirir.

**Kanıt:** ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:15 'var onError: ((Int) -> Void)? = nil' tanımlı; ClipPlayerView.swift:215-231, CinemaPlayerView.swift:171-187, VocabFeedView.swift:251-267, PatternReelsView.swift:297-313 call site'larının hiçbirinde onError yok; ClipPlayerView.swift'te 'error' kelimesi hiç geçmiyor (grep boş)

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:15`, `ios-native/EnglishLearning/Features/ClipPlayer/ClipPlayerView.swift:215`, `ios-native/EnglishLearning/Features/ClipPlayer/CinemaPlayerView.swift:171`, `ios-native/EnglishLearning/Features/Vocab/VocabFeedView.swift:251`, `ios-native/EnglishLearning/Features/Patterns/PatternReelsView.swift:297`

**Öneri:** Tüm call site'lara onError bağlayın: set akışında Türkçe bir 'Bu video şu an oynatılamıyor' kartı + otomatik sonraki videoya geçiş; reels akışlarında kartı feed'den düşürme. Ek olarak backend'de periyodik oEmbed sağlık kontrolünü cron'a bağlayıp ölü videoları feed'lerden otomatik eleyin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru. Kanıt: (1) ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:15 'var onError: ((Int) -> Void)? = nil' tanımlı; JS tarafı satır 94'te onError'ı köprüye gönderiyor ve Coordinator satır 156-161'de parent.onError?'a iletiyor — yani altyapı hazır ama nil kalıyor. (2) Repo genelinde 'onError' grep'i sadece YouTubePlayerView.swift ve test dosyalarını buluyor; dört call site'ın hiçbiri onError geçmiyor: ClipPlayerView.swift:215-262 (parametreler: videoId, startTime, endTime, autoplay, isPlaying, currentTime, onReady, onEnded, command), CinemaPlayerView.swift:171-189, VocabFeedView.swift:251-278, PatternReelsView.swift:297-316. (3) ClipPlayerView.swift ve CinemaPlayerView.swift'te 'error' kelimesi hiç geçmiyor (Vocab/Patterns'taki errorMessage hit'leri sadece feed yükleme hatası, player hatası değil). (4) Akışın ölmesi iddiası da doğrulandı: time ticker'ı yalnızca onReady içinde başlıyor (YouTubePlayerView.swift:92), ClipPlayerView'da next() sadece currentTime tick'i (satır 235-240) veya onEnded (satır 260) ile tetikleniyor; manuel 'sonraki' butonu yok (previous() tanımlı ama hiç çağrılmıyor, tek DragGesture satır 1185-1191'deki seek scrubber). Hatalı videoda tek çıkış geri butonu. (5) Ek kanıt: EnglishLearningTests/YouTubePlayerViewTests.swift:14 'Swift side must expose an onError hook so callers can show a fallback' diye niyeti belgeliyor — hook yazılmış, test edilmiş ama hiçbir caller'a bağlanmamış. (6) Küçük düzeltme: oEmbed temizliği eb9d8be değil 88b8bb7 commit'inde (admin/scripts/check-pattern-video-availability.ts + disable-unavailable-pattern-clips.ts); yine de tek seferlik script olduğu, runtime koruması olmadığı iddiası aynen geçerli. Nüans: Vocab/Pattern feed'lerinde kullanıcı ölü kartı kaydırarak geçebilir (orada 'sonsuz' takılma yok, sadece sessiz siyah kart); asıl akış-öldüren senaryo ClipPlayerView/CinemaPlayerView'daki set akışı — critical severity orası için yerinde.

</details>

### 🟠 HIGH · Spaced repetition ekranı (VocabReviewView) hiçbir yerden erişilemiyor — öğrenme döngüsünün 'tekrar' bacağı kopuk — ✅ bağımsız doğrulandı

SpacedRepetition servisi, vocabPool, dueForReview ve processReview altyapısı mevcut ama bunları kullanan iki ekran (VocabReviewView ve VocabSetView) hiçbir view'dan instantiate edilmiyor — MainTabView'dan ulaşılabilir hiçbir path yok (grep: yalnızca kendi dosyalarında geçiyorlar). Kullanıcının 'Ekle' dediği kelimeler yalnızca rastgele karıştırılan VocabFeed'de tekrar karşısına çıkıyor; zamanlanmış tekrar (due) mekanizması fiilen çalışmıyor. Görev tanımındaki 'video izleme → vocab review (spaced repetition)' döngüsü kodda kapanmıyor.

**Kanıt:** grep 'VocabReviewView' → yalnızca Features/VocabReview/VocabReviewView.swift içinde; 'processReview' çağrıları yalnızca VocabReviewView.swift:253 ve VocabSetView.swift:74-75'te (ikisi de unreachable); AppState.swift:234 'dueForReview' hiçbir view'dan okunmuyor

**Dosyalar:** `ios-native/EnglishLearning/Features/VocabReview/VocabReviewView.swift:253`, `ios-native/EnglishLearning/Features/Vocab/VocabSetView.swift:74`, `ios-native/EnglishLearning/State/AppState.swift:234`, `ios-native/EnglishLearning/Services/SpacedRepetition.swift`

**Öneri:** Ya VocabView'a 'Bugün tekrar: N kelime' girişi ekleyip VocabReviewView'ı bağlayın, ya da felsefe gereği review'ı bilinçli olarak feed'e gömdüyseniz VocabFeed sıralamasını dueForReview ağırlıklı yapın ve ölü review kodunu silin. Mevcut ara durum: altyapı var, kullanıcıya değeri yok.

<details><summary>Doğrulayıcı notu</summary>

Doğrulandı. Navigasyon zinciri tam olarak izlendi: EnglishLearningApp.swift:31-46 (RootView → MainTabView) → MainTabView.swift:46,58-67 (tablar: patterns/home/vocab/profile; .vocab → VocabView) → VocabView.swift:86-110 (yalnızca VocabFeedView veya liste → VocabWordDetailView). Tüm ios-native grep'inde VocabReviewView yalnızca kendi dosyasında (Features/VocabReview/VocabReviewView.swift:4), VocabSetView yalnızca kendi dosyasında (Features/Vocab/VocabSetView.swift:21) geçiyor; ikisi de pbxproj target'ında derlenen ölü kod. processReview çağrıları sadece VocabReviewView.swift:253 ve VocabSetView.swift:74-75'te (ikisi de unreachable); dueForReview (AppState.swift:234) hiçbir view'dan okunmuyor. EK KANIT — bulgu aslında eksik bile: vocabPool'a yazan tek yer processReview (AppState.swift:228); feed'deki 'Ekle' (VocabFeedView.swift:97-100 handleAdd) markVocabLearned ile progress.learnedWords'e yazıyor, pool'a değil. Yani SRS havuzu erişilebilir hiçbir akıştan doldurulmuyor — ekran erişilebilir olsaydı bile havuz boş kalırdı. Feed sıralaması da SRS-due değil, server-side 'smart shuffle' (VocabFeedView.swift:34-35 yorumu, APIClient.swift:82 /api/v1/vocab-feed). Ayrıca vocabReview görev tipini referanslayan DailyTasksView da hiçbir yerden instantiate edilmiyor. Tek küçük nüans: feed 'rastgele' değil server-side akıllı karıştırma, ama due-tabanlı olmadığı için bulgunun özünü değiştirmiyor.

</details>

### 🟠 HIGH · Ertesi gün açan kullanıcı için devam ettirme (retention) mekanizması yok — izleme ilerlemesi hiç kaydedilmiyor — ✅ bağımsız doğrulandı

Aktif akışta (VideoFeedView → SetDetailView → SetPlayerView) hangi videonun/setin izlendiği hiçbir yere yazılmıyor: SetPlayerView markSceneWatched/markClipWatched/logSession çağırmıyor; 'Sete Başla' her zaman index 0'dan başlıyor; SetDetailView satırlarında 'izlendi' işareti yok; ana feed'de 'kaldığın yerden devam' kartı yok. markClipWatched/logSession çağrıları yalnızca erişilemeyen legacy ekranlarda (LessonClipsView, VocabReviewView). Ertesi gün açan kullanıcı dün ne yaptığını göremez, aynı statik set listesiyle karşılaşır. Hatırlatma da yok: UNUserNotificationCenter hiç kullanılmamış, onboarding'de seçilen günlük hedef dakikası hiçbir yerde okunmuyor.

**Kanıt:** SetDetailView.swift:88-91 'startIndex = 0' (Sete Başla); SetPlayerView (SetDetailView.swift:278-528) içinde appState progress yazımı yok; grep markClipWatched → yalnızca LessonClipsView.swift:79,247 (unreachable); grep dailyGoalMinutes → yalnızca AppState.swift:163 (yazılıyor, hiç okunmuyor); grep UNUserNotificationCenter → boş

**Dosyalar:** `ios-native/EnglishLearning/Features/Home/SetDetailView.swift:88`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:53`, `ios-native/EnglishLearning/State/AppState.swift:163`

**Öneri:** Minimum: SetPlayerView'da video bitince set+index'i UserProgress'e yazın; SetDetailView satırlarına izlendi işareti ve feed'in en üstüne 'Devam et: Set 02, Video 3/8' kartı ekleyin. Günlük hedefe bağlı yerel bildirim (akşam 'bugün 10 dakikan duruyor') gamification sayılmadan retention sağlar.

<details><summary>Doğrulayıcı notu</summary>

Tüm kanıt iddiaları birebir doğrulandı: SetDetailView.swift:88-91 'startIndex = 0' (yorumda "starts the set from video 1"); SetPlayerView (SetDetailView.swift:278-529) appState'e yalnızca isVideoPlayerActive yazıyor (369-370), hiçbir progress çağrısı yok; markClipWatched sadece LessonClipsView.swift:79,247'de ve LessonClipsView'u çağıran ScenesLandingView/CoursesView hiçbir yerden instantiate edilmiyor (MainTabView.swift:46 displayed=[patterns,home,vocab,profile], legacy case'ler bile VideoFeedView render ediyor); dailyGoalMinutes yalnızca AppState.swift:163'te yazılıyor (Progress.swift:150 tanım), hiç okunmuyor; UNUserNotificationCenter ios-native'de sıfır eşleşme; VideoFeedView/SetVideoRow'da izlendi işareti veya devam kartı yok. Ek kanıt: markSceneWatched (AppState.swift:132) hiçbir yerden çağrılmıyor; logSession tek çağrısı erişilemeyen VocabReviewView.swift:267'de; ProfileView.swift:210 sessionHistory'den günlük dakika gösteriyor ama aktif akış hiç yazmadığı için istatistik hep boş kalır. Tek nüans: MainTabView.swift:86'da updateStreak() app açılışında çalışıyor (zayıf streak sinyali var) ama izleme ilerlemesi kaydetmiyor — bulgunun özünü değiştirmez.

</details>

### 🟠 HIGH · Privacy manifest (PrivacyInfo.xcprivacy) yok — ✅ bağımsız doğrulandı

Xcode projesinde hiçbir .xcprivacy dosyası yok. Uygulama UserDefaults kullanıyor; Apple Mayıs 2024'ten beri 'required reason API' kapsamındaki UserDefaults erişimi için privacy manifest'te CA92.1 gibi bir sebep beyanı zorunlu tutuyor. Ayrıca WKWebView ile YouTube yüklendiği için veri toplama beyanlarının (App Privacy bölümü) 'üçüncü taraf içerik' gerçeğiyle tutarlı olması gerekiyor. Manifest olmadan App Store Connect upload'unda ITMS uyarısı/reddi riski var.

**Kanıt:** find ios-native -name '*.xcprivacy' → sonuç yok; AppState.swift:40 'UserDefaults.standard' kullanımı; project.yml'de manifest referansı yok

**Dosyalar:** `ios-native/project.yml`, `ios-native/EnglishLearning/State/AppState.swift:40`

**Öneri:** EnglishLearning/Resources altına PrivacyInfo.xcprivacy ekleyin: NSPrivacyAccessedAPICategoryUserDefaults → reason CA92.1; tracking yok, veri toplama yok beyanı. project.yml resources listesine dahil edin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru. (1) `find` sonucu: ios-native/ altında hiçbir .xcprivacy yok; repodaki tek uygulama manifesti legacy Expo projesinde (ios/EnglishLearningApp/PrivacyInfo.xcprivacy) ve Pods içinde — aktif SwiftUI ürününe dahil değil. (2) ios-native/EnglishLearning/State/AppState.swift:40 tam olarak `private let defaults = UserDefaults.standard`; ayrıca 51-64 arası defaults.string/data/array okumaları ve persistLanguage/persistProgress yazmaları var — bu, Apple'ın 'required reason API' listesindeki NSPrivacyAccessedAPICategoryUserDefaults kapsamına girer (CA92.1 beyanı gerekir). (3) ios-native/project.yml (71 satır) içinde xcprivacy/PrivacyInfo/NSPrivacy referansı yok; `grep -rn 'xcprivacy|PrivacyInfo|NSPrivacy' ios-native` sıfır sonuç döndü, yani üretilen xcodeproj'a da manifest eklenmemiş. (4) Ek kanıt: bunun aktif TestFlight projesi olduğu kesin — EnglishLearning.xcodeproj/project.pbxproj:599/621'de CURRENT_PROJECT_VERSION=2, MARKETING_VERSION=1.0.1 ('Bump to 1.0.1 build 2 for TestFlight' commit'iyle uyumlu). (5) WKWebView iddiası da doğru: ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift:31-39 WKWebView ile YouTube IFrame API yüklüyor. Küçük nüans: eksik manifest tek başına otomatik red değil; Apple Mayıs 2024'ten beri required-reason API kullanan yeni/güncellenen binary'lerde beyan eksikse ITMS-91053 uyarısı/reddi uyguluyor — bulgunun 'uyarı/red riski' ifadesi bu haliyle isabetli. Çözüm: ios-native/EnglishLearning/Resources/ altına NSPrivacyAccessedAPICategoryUserDefaults + CA92.1 içeren PrivacyInfo.xcprivacy ekleyip project.yml resources'a dahil etmek.

</details>

### 🟠 HIGH · NSAllowsArbitraryLoads=true — ATS tamamen kapalı, gereksiz ve inceleme riski — ✅ bağımsız doğrulandı

Hem Info.plist hem project.yml tüm App Transport Security'yi kapatıyor. Oysa tek backend HTTPS (english-learning-admin.fly.dev) ve YouTube da HTTPS — hiçbir HTTP kaynağa ihtiyaç görünmüyor. Global ATS bypass'ı App Review'da gerekçe sorusu doğurur ve tüm ağ trafiğini MITM'e açar.

**Kanıt:** ios-native/EnglishLearning/Resources/Info.plist:25-29 'NSAppTransportSecurity → NSAllowsArbitraryLoads: true'; project.yml aynı ayarı üretiyor; APIClient.swift:37 default base 'https://english-learning-admin.fly.dev'

**Dosyalar:** `ios-native/EnglishLearning/Resources/Info.plist:25`, `ios-native/project.yml`

**Öneri:** NSAllowsArbitraryLoads'u tamamen kaldırın. Yerel geliştirme için gerekiyorsa yalnızca DEBUG konfigürasyona NSAllowsLocalNetworking ekleyin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu doğru. Info.plist:25-29'da NSAllowsArbitraryLoads=true (NSExceptionDomains yok, global bypass) ve project.yml:44-45 aynı ayarı XcodeGen ile yeniden üretiyor (düzeltme iki yerde gerekli). APIClient.swift:37 default base https://english-learning-admin.fly.dev ve tüm build'ler production HTTPS'e gidiyor. Ek kanıt: ios-native Swift kaynaklarında tek bir http:// (plaintext) URL yok; YouTube player da tamamen HTTPS (YouTubePlayerView.swift:49,85,90,107 — youtube-nocookie.com). Tek nüans: APIClient.swift:32-36'daki ADMIN_API_BASE_URL override'ı lokal dev için http kullanılabilir — muhtemel kök neden bu, ama dev-only ihtiyaç global ATS kapatmayı gerekçelendirmez; NSAllowsLocalNetworking veya debug-only ayar yeterli olur.

</details>

### 🟠 HIGH · Crash reporting / analytics / log altyapısı sıfır — TestFlight'ta uçuş körlüğü — ✅ bağımsız doğrulandı

Kodda Crashlytics/Sentry/TelemetryDeck bir yana, os.Logger bile yok (grep sıfır). POC'un amacı '100 video ile hipotezi doğrulamak' ama hangi set açılıyor, kaç kullanıcı ikinci güne dönüyor, video embed hataları ne sıklıkta — hiçbir sinyal toplanmıyor. MetricKit bile bağlanmamış. Bu, POC'un başarı/başarısızlık kararının veriye değil hisse dayanacağı anlamına gelir; crash'ler yalnızca kullanıcı şikayet ederse duyulur (TestFlight crash raporları semboliksiz ve gecikmeli).

**Kanıt:** grep 'Firebase|Sentry|Crashlytics|TelemetryDeck|Amplitude|Mixpanel|MetricKit|os_log|Logger(' ios-native → boş

**Dosyalar:** `ios-native/EnglishLearning/App/EnglishLearningApp.swift`

**Öneri:** Gizlilik-hafif bir çift ekleyin: MetricKit tabanlı crash toplama (veya Sentry) + TelemetryDeck gibi anonim event sayacı. Minimum event seti: set_started, video_finished, word_added, pattern_completed, yt_error(code). Privacy manifest'e de işleyin.

<details><summary>Doğrulayıcı notu</summary>

Bulgu DOĞRU, hatta iddiadan daha ağır. Kanıtlar: (1) ios-native/ genelinde 'Firebase|Sentry|Crashlytics|TelemetryDeck|Amplitude|Mixpanel|MetricKit|PostHog|Bugsnag|Datadog' grep'i yalnızca 2 false-positive döndürüyor — LearningPathView.swift:23 ve PatternsView.swift:104'teki 'amplitude' bir sinüs animasyonu CGFloat sabiti, analytics değil. (2) 'os_log|OSLog|Logger(|import os' grep'i tamamen boş; dahası 'print(' ve 'NSLog' de 0 sonuç — uygulamada tek satır log bile yok. (3) EnglishLearning.xcodeproj/project.pbxproj'da hiç XCRemoteSwiftPackageReference/repositoryURL yok ve project.yml'de dış bağımlılık tanımlı değil — projede sıfır 3rd-party SDK var, yani crash SDK'sı eklenmiş olamaz. (4) 'NSSetUncaughtExceptionHandler|MXMetricManager' grep'i boş — MetricKit veya manuel crash handler bağlanmamış. (5) Services/APIClient.swift tamamen GET-only (tüm public fonksiyonlar fetch*; satır 144'teki tek private get<T> helper'ı httpMethod=GET set ediyor, hiç POST yok) — yani kullanım/event verisi backend'e de gönderilmiyor; sunucu tarafında en fazla Fly.io erişim log'larından dolaylı sinyal alınabilir, uygulama içi hiçbir metrik yok. (6) App/EnglishLearningApp.swift ve AppDelegate (App/OrientationLock.swift) hiçbir telemetri/log init'i içermiyor. Sonuç: 'hangi set açılıyor, retention, embed hata oranı' sinyallerinin hiçbiri toplanmıyor; 'uçuş körlüğü' nitelemesi ve [high] önceliği yerinde.

</details>

### 🟠 HIGH · Fly.dev'deki admin paneli ve içerik API'si tamamen auth'suz — üretim içeriği herkes tarafından değiştirilebilir

Uygulamanın tek içerik kaynağı https://english-learning-admin.fly.dev; admin Next.js projesinde middleware.ts yok, API route'ları auth kontrolü içermiyor ve CORS '*' açık. Admin UI sayfaları (curriculum, lessons, pipeline, review, tags) da korumasız — URL'i bulan herkes uygulamadaki tüm kullanıcıların gördüğü içeriği düzenleyebilir/bozabilir. Bu hem güvenlik hem ürün güvenilirliği riski (store'daki uygulamaya kötü niyetli içerik enjekte edilebilir).

**Kanıt:** admin/ dizininde middleware.ts yok (ls hata veriyor); admin/app/api/v1/poc-videos/route.ts — GET handler'da hiçbir auth yok, 'Access-Control-Allow-Origin: *'; iOS tarafı APIClient.swift:37 bu host'u default base alıyor

**Dosyalar:** `admin/app/api/v1/poc-videos/route.ts`, `ios-native/EnglishLearning/Services/APIClient.swift:37`

**Öneri:** Okuma API'leri (api/v1/*) açık kalabilir ama admin UI ve tüm yazma endpoint'lerine en azından basic auth / Fly.io üzerinden IP kısıtı / bir ADMIN_TOKEN header'ı ekleyin. Next.js middleware.ts ile /api/v1 dışındaki her path'i korumak yarım günlük iş.

### 🟡 MEDIUM · Profil ekranı 'no gamification' felsefesiyle çelişiyor ve gösterdiği metriklerin çoğu ölü — hep sıfır

ProfileView XP, Level, trophy ikonu ve seviye çemberi gösteriyor; MEMORY'deki 'no gamification' pivotuyla doğrudan çelişki. Daha kötüsü: addXP çağrılarının tamamı erişilemeyen legacy ekranlarda (DailyTasksView, LessonClipsView, LessonDetailView), markClipWatched da öyle — yani aktif akışı kullanan gerçek kullanıcı sonsuza kadar '0 XP, Level 1, 0 Clips' görür. Haftalık aktivite grafiği sessionHistory'den besleniyor ama logSession yalnızca unreachable VocabReviewView'da → grafik daima boş. Kullanıcı bunu 'uygulama bozuk' diye okur.

**Kanıt:** ProfileView.swift:61 'Level \(level.level)', :76-98 XP kartı + trophy, :133 watchedClips.count, :149-199 weeklyChart; grep addXP → yalnızca DailyTasksView.swift:101, LessonClipsView.swift:80,248,252, LessonDetailView.swift:272,372,380 (hepsi unreachable); logSession yalnızca VocabReviewView.swift:267

**Dosyalar:** `ios-native/EnglishLearning/Features/Profile/ProfileView.swift:61`, `ios-native/EnglishLearning/Features/Profile/ProfileView.swift:133`, `ios-native/EnglishLearning/Features/Profile/ProfileView.swift:149`

**Öneri:** Profili felsefeye uygun metriklerle yeniden kurun: izlenen video/set sayısı, eklenen kelime, mastery'ye yaklaşan kelime, tamamlanan kalıp, gün serisi. XP/Level/trophy'yi kaldırın; weekly chart'ı ya set akışından beslenen gerçek veriye bağlayın ya da çıkarın.

### 🟡 MEDIUM · Dil seçici 6 dil vaat ediyor ama ürün UI'ı hardcoded Türkçe + yer yer hardcoded İngilizce

Onboarding 1. adım ve Profil'de Türkçe/İspanyolca/Arapça/Çince/Portekizce/İngilizce seçimi sunuluyor; Localization.swift altı sözlük içeriyor. Ama aktif ekranların metinleri t() sisteminden geçmiyor: VideoFeedView 'SETLER / Bir set seç, başla.', SetDetailView 'Sete Başla', NextUpOverlay 'BİTİRDİN/SIRADAKI/Devam et/Setten çık', SetCompleteOverlay 'SET TAMAMLANDI', VocabView 'KELİME HAZNEM', PatternsView 'CÜMLE KALIPLARI' — hepsi hardcoded TR. Tersine Onboarding'de 'Tell us where to start', 'Just starting out', 'Casual/Regular/Serious/Intense/Hardcore', ProfileView'da 'Last 7 days', 'Daily activity', 'Native language', ErrorState'te 'Something went wrong'/'Try again' hardcoded EN. İspanyolca seçen kullanıcı Türkçe uygulama, Türk kullanıcı da yer yer İngilizce ekran görüyor.

**Kanıt:** VideoFeedView.swift:76-81; SetDetailView.swift:95; SetDetailView.swift:657,673,730,756,863; VocabView.swift:187; PatternsView.swift:45; OnboardingView.swift:176,179,181,183,234,294-299; ProfileView.swift:153-158,223-227; LoadingStates.swift:100,109

**Dosyalar:** `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:76`, `ios-native/EnglishLearning/Features/Onboarding/OnboardingView.swift:176`, `ios-native/EnglishLearning/Features/Profile/ProfileView.swift:153`, `ios-native/EnglishLearning/Components/LoadingStates.swift:100`, `ios-native/EnglishLearning/Services/Localization.swift`

**Öneri:** POC hedefi Türk kullanıcılar olduğuna göre en dürüst çözüm: dil seçiciyi ve 5 dili kaldırıp UI'ı %100 Türkçe'ye sabitlemek (özellikle onboarding ve hata metinleri). Çok dilliliği gerçekten hedefleyecekseniz tüm hardcoded string'leri Localization'a taşıyın; ikisi arası mevcut durum her iki kullanıcıya da yarım deneyim.

### 🟡 MEDIUM · Hata mesajları kullanıcıya İngilizce teknik detay sızdırıyor

ErrorState 'Something went wrong' başlığıyla error.localizedDescription'ı ham gösteriyor; APIError açıklamaları 'HTTP 500 at https://english-learning-admin.fly.dev/api/v1/...' ve 'Decoding failed: keyNotFound(...)' gibi URL+teknik içerik üretiyor. Bu metin VideoFeedView/SetPlayerView/VocabFeedView hata durumlarında Türk kullanıcının karşısına aynen çıkıyor. Offline durumda da sunucu hatasıyla aynı görünüm var; kullanıcı 'internetim mi yok, uygulama mı bozuk' ayrımı yapamıyor.

**Kanıt:** LoadingStates.swift:100-110 ('Something went wrong', message ham gösterim, 'Try again'); APIClient.swift:9-16 errorDescription URL içeriyor; VideoFeedView.swift:37 'ErrorState(message: err)' — err = error.localizedDescription

**Dosyalar:** `ios-native/EnglishLearning/Components/LoadingStates.swift:100`, `ios-native/EnglishLearning/Services/APIClient.swift:9`, `ios-native/EnglishLearning/Features/Home/VideoFeedView.swift:37`

**Öneri:** APIError'ı kullanıcı-yüzlü Türkçe kategorilere eşleyin: transport → 'İnternet bağlantını kontrol et', http 5xx → 'Sunucuda geçici bir sorun var', decoding → 'İçerik yüklenemedi'. Teknik detayı yalnızca os.Logger'a yazın.

### 🟡 MEDIUM · Offline hiç çalışmıyor; içerik listeleri bilinçli olarak cache'siz ve tek backend'e %100 bağımlı

Set listesi, video klipleri, vocab feed ve pattern sahneleri 'No caching' yorumlarıyla her açılışta ağdan çekiliyor; fly.dev'deki tek admin instance'ı düşerse veya uçak modunda uygulama tamamen hata ekranına düşer — daha önce izlenmiş içerik dahi açılamaz. URLSession waitsForConnectivity=true + 20s timeout kombinasyonu offline'da uzun boş bekleme yaratır. Video YouTube stream'i olduğu için tam offline beklenmez ama metin/altyazı/set yapısının bile cache'lenmemesi ilk açılışı ve zayıf bağlantı deneyimini kırılgan yapıyor.

**Kanıt:** CacheService.swift:65-120 — pocVideos/videoSets/pocVideoClips/vocabFeed/patternScenes hepsi 'No caching' yorumlu doğrudan API çağrısı; APIClient.swift:41-44 timeout/waitsForConnectivity

**Dosyalar:** `ios-native/EnglishLearning/Services/CacheService.swift:65`, `ios-native/EnglishLearning/Services/APIClient.swift:41`

**Öneri:** Stale-while-revalidate deseni: son başarılı videoSets/clips yanıtını süresiz cache'leyip önce onu gösterin, arkada tazeleyin. 'Kürasyon canlı değişiyor' gerekçesi POC sonrası geçerliliğini yitirir; en azından release build'de cache açılmalı. Offline'da ayrı bir 'İnternet yok' durumu gösterin.

### 🟡 MEDIUM · Monetizasyon altyapısı sıfır ve mevcut içerik stratejisi paralı modele kapalı

StoreKit/IAP/paywall/subscription izi yok (grep boş). Bu POC için normal olabilir; ancak stratejik sorun şu: ürün YouTube embed içeriği üzerine kurulu ve YouTube API ToS, YouTube içeriğine erişimi ücretlendirmeyi (paywall arkasına koymayı) yasaklıyor. Yani bugünkü mimariyle 'premium set' satışı ToS ihlali olur. Ürün nereye evrilecekse (abonelik, kendi içerik kütüphanesi, B2B), içerik kaynağı kararı monetizasyondan önce verilmek zorunda.

**Kanıt:** grep 'StoreKit|SKProduct|Purchase|paywall|subscription' ios-native → boş; içerik bağımlılığı: YouTubePlayerView.swift + APIClient.swift'in tüm endpoint'leri YouTube videoId döndürüyor

**Dosyalar:** `ios-native/EnglishLearning/Features/ClipPlayer/YouTubePlayerView.swift`, `ios-native/EnglishLearning/Services/APIClient.swift`

**Öneri:** POC doğrulanırsa monetizasyon planını içerik lisanslamasıyla birlikte kurgulayın: ya lisanslı/özgün video (paywall serbest) ya da ücretsiz YouTube katmanı + paralı 'kişisel koçluk/analiz' katmanı. StoreKit 2 entegrasyonunu bu karardan sonra ekleyin.

### 🟡 MEDIUM · ~2.900 satır erişilemeyen legacy ekran binary'ye gömülü — kavram enflasyonu ve bakım yükü

HomeView, LearningPathView, CoursesView, DailyTasksView, ScenesLandingView, LessonDetailView (939 satır), LessonClipsView, VideoWatchView, VocabReviewView, VocabSetView hiçbir navigasyon path'inden erişilemiyor ama derlenip ship ediliyor. Bu ekranlar Lessons/Scenes/Courses/DailyTasks kavramlarını taşıyor; aktif ürün ise Setler/Video/Kelimeler/Kalıplar dilini kullanıyor. Ölü kod, ileride yanlışlıkla yeniden bağlanma ve 'hangi kavram canlı' karmaşası riski yaratıyor (Profil'deki 'Clips' ve 'Yapı' istatistik etiketleri bu sızıntının örneği). Tab yapısının kendisi (Kalıplar/Video/Kelimeler/Profil) ise sade ve doğru.

**Kanıt:** grep instantiation: HomeView/CoursesView/DailyTasksView/ScenesLandingView/VocabReviewView/VideoWatchView/VocabSetView için MainTabView'dan ulaşılabilir hiçbir referans yok; MainTabView.swift:10-11 'case courses, play // legacy — not surfaced'; ProfileView.swift:135 'Clips' etiketi

**Dosyalar:** `ios-native/EnglishLearning/Features/MainTabView.swift:10`, `ios-native/EnglishLearning/Features/Lesson/LessonDetailView.swift`, `ios-native/EnglishLearning/Features/Home/HomeView.swift`, `ios-native/EnglishLearning/Features/DailyTasks/DailyTasksView.swift`

**Öneri:** Legacy Features/ ekranlarını ayrı bir branch'te arşivleyip target'tan çıkarın (project.yml excludes). Kalanlarda terminolojiyi tekleştirin: kullanıcı yüzünde yalnızca Set / Video / Kelime / Kalıp.

### 🟡 MEDIUM · Onboarding topladığı verinin hiçbirini kullanmıyor ve çekirdek mekaniği öğretmiyor

4 adımlı onboarding seviye/hedef/günlük dakika soruyor ama bu üç değer AppState'e yazıldıktan sonra hiçbir yerde okunmuyor (grep: yalnızca yazım satırları) — set listesi seviyeye göre filtrelenmiyor, günlük hedef hiçbir ekranda görünmüyor. Buna karşılık uygulamanın asıl öğrenilmesi gereken mekaniği — videoda amber kelimeye dokun → Ekle → akışta tekrar gör, 3 renk = özne/fiil/tamamlayıcı — onboarding'de hiç anlatılmıyor; kullanıcı bunu ancak boş durum metinlerinden (VocabView) tesadüfen öğreniyor. Yanıltıcı vaat ('We'll tailor your plan') + öğretilmeyen mekanik = ilk oturumda kafa karışıklığı.

**Kanıt:** grep 'dailyGoalMinutes|learningGoal|onboardingLevel' → yalnızca AppState.swift:161-163 (yazım); OnboardingView.swift:234 'We'll tailor your plan' (hiçbir tailoring yok); VocabView.swift:251 mekanik açıklaması boş durumda gizli

**Dosyalar:** `ios-native/EnglishLearning/Features/Onboarding/OnboardingView.swift:229`, `ios-native/EnglishLearning/State/AppState.swift:159`, `ios-native/EnglishLearning/Features/Vocab/VocabView.swift:247`

**Öneri:** Kullanılmayan adımları (hedef, dakika) kaldırın veya gerçekten bağlayın (seviye → set sıralaması). Yerine 2 ekranlık mekanik tanıtımı koyun: 3 renk sistemi + 'kelimeye dokun-ekle' demo'su. Onboarding kısalır ve ilk değer anı (ilk video) öne çekilir.

### 🟡 MEDIUM · App Store metadata eksikleri: gizlilik politikası linki yok, sürüm tutarsız, yaş derecelendirmesi/içerik filtresi belirsiz

Uygulama içinde gizlilik politikası/kullanım koşulları linki yok (grep 'privacy|gizlilik|terms' boş) — App Store Connect gizlilik politikası URL'i zorunlu ve Profil'de link bulunması beklenir. project.yml MARKETING_VERSION 1.0.0 derken Info.plist 1.0.1/2 diyor (xcodegen yeniden üretirse sürüm geriler). Profil 'v1.0' hardcoded gösteriyor. İçerik gerçek film sahneleri: küfür/şiddet/yetişkin tema filtrelendiğine dair kodda hiçbir mekanizma yok — 4+ derecelendirme savunulamaz, 12+/17+ kararı ve kürasyon politikası gerekiyor. DEVELOPMENT_TEAM project.yml'de boş.

**Kanıt:** grep privacy/terms ios-native → boş; project.yml 'MARKETING_VERSION: 1.0.0' vs Info.plist:21-24 '1.0.1'/'2'; ProfileView.swift:265 'English Learning · v1.0' hardcoded; içerik filtresi: admin/review sayfası manuel kürasyon, otomatik uygunluk kontrolü yok

**Dosyalar:** `ios-native/project.yml`, `ios-native/EnglishLearning/Resources/Info.plist:21`, `ios-native/EnglishLearning/Features/Profile/ProfileView.swift:265`

**Öneri:** Profil'e gizlilik politikası + iletişim linki ekleyin (statik bir sayfa yeter); sürümü tek kaynaktan yönetin (project.yml'i güncelleyip Info.plist'i xcodegen'e bırakın, aboutCard'ı Bundle'dan okutun); yaş derecelendirmesini içerik kürasyon kuralıyla birlikte belirleyin (ör. 12+ ve admin review'da küfür/şiddet işaretleme alanı).

### ⚪ LOW · Streak güncellemesi yalnızca MainTabView.onAppear'da tetikleniyor ve kullanıcıya hiçbir yerde anlamlandırılmıyor

updateStreak yalnızca MainTabView ilk göründüğünde çağrılıyor; uygulama arka planda günlerce yaşarsa (iOS uygulamayı öldürmezse) gün değişiminde streak güncellenmez, scenePhase dinlenmiyor. Ayrıca streak kullanıcıya yalnızca Profil'in bir köşesinde gösteriliyor; kaybolacağına dair uyarı, kazanıldığına dair geri bildirim yok — retention aracı olarak fiilen işlevsiz. AppState.swift:147-153'teki else dalı da kafa karıştırıcı: max(streak,1) ataması hemen ardından koşulsuz 1 ile eziliyor (her iki branch de streak=1).

**Kanıt:** MainTabView.swift:86 '.onAppear { appState.updateStreak() }' tek çağrı noktası (AppState.swift:164 onboarding hariç); AppState.swift:149-152 'progress.streak = max(progress.streak, 1); if ... streak = 1 else streak = 1'; scenePhase grep → yok

**Dosyalar:** `ios-native/EnglishLearning/Features/MainTabView.swift:86`, `ios-native/EnglishLearning/State/AppState.swift:137`

**Öneri:** scenePhase .active geçişinde updateStreak çağırın; else dalını 'streak = 1' olarak sadeleştirin. Felsefeye uygun, baskısız bir sunum: ana feed başlığında 'Üst üste 3. gün' gibi tek satırlık nötr bir ibare.

### ⚪ LOW · 220MB data.db ve yedekleri git'te izleniyor

Repo kökündeki data.db (220MB) git tarafından izleniyor (git ls-files'ta görünüyor); ayrıca tarihli yedek kopyaları da dizinde duruyor. Her clone/fetch'i şişirir; içerik DB'sinin kaynak gerçeği zaten admin deploy'unda. iOS ürününü doğrudan etkilemese de CI/işbirliği maliyeti ve yanlışlıkla eski DB'ye dönme riski yaratır.

**Kanıt:** git ls-files | grep '^data.db' → data.db; repo kökünde data.db.backup-2026-04-29, data.db.backup-pre-tagger-rewrite-* dosyaları

**Dosyalar:** `data.db`

**Öneri:** data.db'yi git geçmişinden çıkarın (git rm --cached + .gitignore), yedekleri repo dışına taşıyın; gerekiyorsa Git LFS veya fly volumes snapshot kullanın.

---

# Bölüm 2 — Hedef Teknik Mimari

# Hedef Teknik Mimari — English Learning App

**Kapsam:** `/Users/i/Mobile/english-learning-app` (aktif branch: `native-ios-swift`)
**Amaç:** Denetim bulgularını, POC'yi öldürmeden profesyonel ve sürdürülebilir bir mühendislik ürününe dönüştüren, fazlandırılmış bir hedef mimariye çevirmek.

---

## 0. Yönetici Özeti — Kuzey Yıldızı

Hedef durum tek cümleyle: **"Tek aktif ürün (ios-native), tek kanonik veri (Fly'daki SQLite), tek player çekirdeği, tek şema kaynağı (migration'lar), her PR'da koşan bir CI ve production'da gözü açık bir uygulama."**

Bugünkü durumun kök nedenleri dört tane; tüm bulgular bunların semptomu:

1. **Sahipsiz sınırlar:** iOS, legacy Expo, admin ve pipeline aynı ağaçta iç içe; hangi kodun ürün olduğu hiçbir dokümanda yazmıyor (kök `README.md` yok, `CLAUDE.md` 186 byte).
2. **Tek source-of-truth yok:** Şema 3 yerde (`admin/lib/schema.sql` 148 satır — gerçek DB'nin gerisinde, `admin/lib/db.ts` 1195 satır içindeki SCHEMA, canlı `data.db`), veri 2 yerde (lokal `data.db` 220MB ↔ Fly `/data/admin.db`), sürüm 2 yerde (`ios-native/project.yml` 1.0.0/1 ↔ pbxproj 1.0.1/2 — doğruladım, `project.yml:13-14` hâlâ 1.0.0/1).
3. **Güvenlik sıfır varsayımı:** `admin/middleware.ts` mevcut değil (doğruladım) → tüm mutasyon endpoint'leri + `claude --dangerously-skip-permissions` çalıştıran `/api/pipeline` public. iOS'ta `NSAllowsArbitraryLoads: true` (`ios-native/project.yml:44-45`).
4. **Geri bildirim döngüsü yok:** CI yok, crash reporting yok, log yok; `UserProgress` decode hatası sessizce tüm kullanıcı verisini siliyor (`ios-native/EnglishLearning/State/AppState.swift`).

Fazlar bu kök nedenlere göre sıralandı: **Faz 1** veri kaybını ve açık kapıları kapatır (kanamayı durdur), **Faz 2** tek-doğruluk-kaynağı disiplinini kurar (sağlamlaştır), **Faz 3** ölçek ve ürünleşme yatırımlarını yapar.

---

## 1. iOS Hedef Mimarisi (`ios-native/`)

### 1.1 Katman şeması (hedef)

```
ios-native/EnglishLearning/
├── App/            → giriş, Router (NavigationPath), OrientationLock (push/pop)
├── Core/
│   ├── Networking/ → APIClient (env-aware baseURL, retry whitelist), AppError
│   ├── Persistence/→ ProgressStore (versiyonlu Codable), CacheService (SWR)
│   ├── Logging/    → Log.swift (os.Logger kategorileri: .network .persistence .player)
│   └── DI/         → protokoller: CurriculumRepositoryProtocol, ProgressStoring...
├── Domain/         → SpacedRepetition, Streak, SentenceStructure, DailyPlan
│                     (hepsi PURE: Date/TimeZone parametreli, %100 unit-test'li)
├── PlayerKit/      → TEK player çekirdeği (aşağıda)
├── DesignSystem/   → Theme + eksik semantik token'lar + LoadableStateView
└── Features/       → ekran başına: View + ViewModel (yalnız orchestration)
```

**Neden bu katmanlama:** Bulguların çoğu (timezone hataları, streak ölü mantığı, SM-2 şişmesi, test edilemezlik) iş mantığının View/AppState içine gömülmesinden geliyor. `Domain/` katmanı pure function'lardan oluşunca test maliyeti sıfıra iner ve `SpacedRepetition.swift` (89 satır) gibi kritik kodlar 1 günde %100 kapsanır.

### 1.2 Persistence: versiyonlu, kayıpsız UserProgress *(Faz 1 — en kritik iş)*

**Neden:** Şu anki `Codable` modeli, herhangi bir alan eklendiğinde eski blob'un decode'unu kırıyor ve `AppState.loadInitial` sessizce sıfır progress ile devam ediyor = **kalıcı veri kaybı**. TestFlight'ta kullanıcı varken bu, tek başına release-blocker.

**Nasıl:**
1. `ProgressEnvelope { schemaVersion: Int, payload: Data }` yapısı; `UserProgress`'e custom `init(from:)` — her alan `decodeIfPresent ?? default`.
2. `ProgressMigrator.migrate(from: oldVersion)` zinciri (v1→v2→…), `switch` tabanlı, her adımı testli.
3. Decode başarısız olursa: ham blob'u `user_progress_backup_<version>_<epoch>` anahtarına kopyala → `Logger(category: .persistence).fault(...)` → SONRA fallback. Asla üzerine yazma.
4. Golden-file testi: `EnglishLearningTests/`'e "1.0.1'in ürettiği gerçek JSON blob'u" fixture olarak koy; her model değişikliğinde bu blob'un decode olduğunu doğrula. (CLAUDE.md kuralına da uygun: önce reproduce eden test.)
5. Faz 2'de: her mutasyonda main-thread senkron re-encode yerine 500ms debounce'lu tek save noktası + background encode; Faz 3'te `NSUbiquitousKeyValueStore` aynası (1MB limiti bu veri için bol).

### 1.3 State: AppState'in bölünmesi *(Faz 2)*

**Neden:** `AppState.swift` (268 satır) hem progress persistence, hem vocab pool, hem `isVideoPlayerActive` UI koordinasyonu taşıyor; 7 view'ın onAppear/onDisappear yarışı için watchdog hack'i yazılmış.

**Nasıl:**
- `ProgressStore`, `VocabPoolStore`, `SettingsStore` (alan bazlı `ObservableObject`/`@Observable`).
- `isVideoPlayerActive: Bool` → `PlayerPresence` küçük nesnesi: `activeScreens: Set<UUID>` + `.trackVideoPlayerActive()` view modifier'ı; `isActive = !set.isEmpty`. Boolean yarışları ve watchdog silinir. (Alternatif: `.toolbar(.hidden, for: .tabBar)` + gerçek `TabView(selection:)` — MainTabView switch'inin tab state'ini yok etme sorununu da çözer.)
- `MainTabView` → `TabView(selection:)` + custom bar overlay; `Router` (NavigationPath) + `.onOpenURL` ile `app://set/{id}` deep link'leri.

### 1.4 DI stratejisi: "default parametreli protokol" — framework'süz *(Faz 1'de protokol, Faz 2'de yaygınlaştırma)*

**Neden:** Singleton'lara doğrudan bağımlılık test yazmayı imkânsızlaştırıyor; ama POC ölçeğinde DI framework'ü (Factory, swift-dependencies) overkill.

**Nasıl:** `protocol CurriculumRepositoryProtocol` tanımla; ViewModel'ler `init(repo: CurriculumRepositoryProtocol = CurriculumRepository.shared)` alsın. Çağrı yerleri değişmez, testte mock geçilir. Aynı desen `APIClientProtocol` ve `ProgressStoring` için. Singleton `init`'leri `private` yap.

### 1.5 Tek player çekirdeği: `PlayerKit` *(Faz 1'de hata yönetimi, Faz 2'de konsolidasyon)*

**Neden:** Player, ürünün kalbi ve en kırık bölgesi: `YouTubePlayerView.swift` (167 satır) `updateUIView`'ı yok sayıyor, tek slotlu command Binding komut kaybediyor, `onError` hiçbir view'da bağlı değil (silinen video = sonsuz siyah ekran — **critical UX**), `PatternReelCard`/`VocabReelCard` ~450'şer satır kopya, her reel kartı kendi WKWebView'ını mount edip 220ms JS ticker'ını hiç temizlemiyor.

**Hedef tasarım:**
```
PlayerKit/
├── YouTubePlayerController   (ObservableObject; komut KUYRUĞU: send(.load(videoId,start,end)),
│                              .seekAndPlay(t), .setRate(r); state: .idle/.buffering/.playing/.error(code))
├── YouTubePlayerHostView     (UIViewRepresentable; updateUIView diff'ler: lastVideoId != videoId
│                              → evaluateJavaScript loadVideoById; dismantleUIView: handler removal
│                              + loadHTMLString(""); ticker yalnız PLAYING'de)
├── PlayerErrorCard           ("Bu sahne oynatılamıyor" + Atla/Tekrar dene; reels'te otomatik skip)
├── ReelCard<Config> + VerticalReelFeed<Item>  (Pattern/Vocab tek generic bileşen)
└── SentenceStructure/        (Bucket enum + renk, ContractionLexicon, KaraokeTextBuilder
                               — bugün 5 yerde kopyalanan mantık tek dosyada)
```
**Sıra önemli:** Önce `onError` bağlanır ve kırık `videoId`'ler backend'e `POST /api/v1/telemetry/yt-error` ile raporlanır (Faz 1, kullanıcıyı siyah ekrandan kurtarır) — sonra controller/kuyruk refactor'ü (Faz 2) — en son TikTok-tarzı paylaşılan tek player instance'ı (Faz 3, updateUIView düzeltmesine bağımlı).

### 1.6 Hata/Loading standardı *(Faz 2)*

**Neden:** 8 ViewModel aynı `isLoading/errorMessage` kopyası; kullanıcı ham `error.localizedDescription` (İngilizce teknik detay) görüyor.

**Nasıl:**
1. `enum LoadableState<T> { case idle, loading, loaded(T), failed(AppError) }`
2. `enum AppError: LocalizedError { case offline, server, content, unknown }` — eşleme tek yerde: `URLError.notConnectedToInternet → .offline("İnternet bağlantını kontrol et")`, 5xx → `.server`, `DecodingError` → `.content`. Teknik detay yalnız `os.Logger`'a.
3. `LoadableStateView<T, Content>` DesignSystem bileşeni: loading/empty/error görünümlerini standartlaştırır (EmptyState'in `variant: .dark` parametresiyle reels'i de kapsar).
4. Retry politikası `APIClient.swift` içinde whitelist'e döner: yalnız transport + 5xx retry; `try await Task.sleep` (cancellation'ı yutma); jitter'lı backoff.

### 1.7 Güvenlik/uyumluluk taban çizgisi *(Faz 1 — yarım gün)*
- `project.yml:44-45`'ten `NSAllowsArbitraryLoads` kaldır; Debug xcconfig'e `NSAllowsLocalNetworking`.
- `PrivacyInfo.xcprivacy` ekle (UserDefaults → CA92.1), `project.yml` resources'a dahil et.
- Debug launcher'ı `#if DEBUG` içine al; xcconfig tabanlı environment (Debug→staging URL, Release→prod) — base URL build setting'den, force-unwrap yerine guard+log.
- Locale/timezone standardı: `Domain/DayBoundary.swift` — tek `Calendar` (TimeZone.current), `en_US_POSIX` sabit formatter'lar `static let`; `SpacedRepetition` ve `Streak` bu tek kaynaktan gün hesaplar. TR kullanıcının interval'inin 1 gün kısalması burada biter.

---

## 2. Backend Hedefi (`admin/`)

### 2.1 İki yüzeyli tek uygulama → sonra fiziksel ayrım

**Hedef son durum (Faz 3):** `api.<domain>` (public, read-only, cache'li) + `admin.<domain>` (auth'lu, private). **Ara durum (Faz 1):** tek Next.js app içinde mantıksal ayrım.

**Faz 1 — kapıyı kilitle (1 gün, en yüksek getirili iş):**
1. `admin/middleware.ts` oluştur (şu an YOK):
   - `/api/v1/*` + `GET` → serbest.
   - Diğer her path/method → `Authorization: Bearer ${ADMIN_TOKEN}` yoksa 401. Token: `fly secrets set ADMIN_TOKEN=...`.
2. `admin/app/api/pipeline` ve `admin/app/api/process` (auth'suz `claude --dangerously-skip-permissions` spawn ediyor — **critical**): route başına `if (process.env.FLY_APP_NAME) return NextResponse.json({error:'local-only'},{status:501})` guard'ı; production'da fiilen kapalı. Spawn edilen child'a `child.on('error')` handler.
3. `/api/health` route'u (`SELECT 1`) + `admin/fly.toml`'a `[[http_service.checks]]` (doğruladım, şu an hiç check yok) — deploy kesintisi ve ölü makine körlüğü biter.
4. Basit in-memory token-bucket rate limiter (tek makine olduğu için in-memory yeterli) + `vocab-feed`'in N+1 sorgusunu tek JOIN'e indir veya 5 dk memoize et.

**Neden bu sıra:** iOS'un canlı veri kaynağı şu anda herkes tarafından yazılabilir ve içinde RCE-benzeri bir endpoint var; bu, mimari tartışmasından bağımsız, takvimden önce kapatılır.

### 2.2 API kontratı *(Faz 2)*

**Neden:** Kontrat yok; casing tutarsız; sunucudan gelen NULL bir alan non-optional Swift alanını, dolayısıyla tüm feed'i kırabiliyor. `fetchLessonClips(all:true)`'daki `%3F` bug'ı da kontratsızlığın semptomu.

**Nasıl:**
1. `admin/lib/api-types.ts`: tüm v1 response tipleri tek dosyada, **camelCase** standardı; route'lar bu tiplerle derleniyor.
2. Nullable politikası: DB'de NULL olabilen her alan ya endpoint'te `COALESCE` ile doldurulur ya da kontratta `| null` olur; iOS tarafında karşılığı `String?` + UI fallback. "Feed'i tek kelime kırabilir" sınıfı kapanır.
3. Golden-file kontrat testleri: her v1 endpoint için örnek JSON fixture; hem admin'de (vitest) hem iOS'ta (aynı fixture'ı decode eden XCTest) koşar. **Aynı fixture iki tarafta da yeşilse kontrat kırılmamıştır** — OpenAPI'ye geçmeden önce en ucuz kontrat güvencesi.
4. iOS `APIClient.swift`: `fetchLessonClips` query'yi `URLQueryItem` ile geçirsin (mevcut `get()` zaten destekliyor); kullanılmıyorsa `allClips()` silinsin.
5. Legacy unversioned endpoint'lere (`/api/clips`, `/api/videos`...) deprecation başlığı + kaldırma tarihi.

### 2.3 Veri senkronu: tek yön, tek kanonik kopya *(Faz 2)*

**Karar önerisi:** **Lokal `data.db` = kürasyon/authoring kopyası; Fly `/data/admin.db` = SERVE kopyası; akış tek yönlü: lokal → Fly.** Gerekçe: tüm içerik üretim pipeline'ı (WhisperX, yt-dlp, tagger) zaten lokal makinede; kullanıcı verisi DB'de tutulmuyor (progress cihazda) → çakışma riski yok, "publish" modeli doğal.

**Nasıl:**
1. `admin/scripts/publish-db.ts` (Makefile hedefi `make publish`): `PRAGMA wal_checkpoint(TRUNCATE)` → bütünlük kontrolleri (aşağıdaki content-health) → sha256 → Fly'a upload (`fly ssh sftp` veya staging path + atomik `mv`) → `/api/health` doğrulaması → başarısızsa eski dosya geri.
2. Fly üzerindeki admin mutasyon route'ları Faz 2 sonunda read-only'ye çekilir (yazma yalnız lokalde) — "iki yazma noktası" sınıfı kapanır.
3. `fly volumes snapshots` politikası doğrulanır + cron ile günlük off-site yedek (Tigris/S3). Litestream, Faz 3'te sürekli replikasyon istenirse eklenir.
4. Yıkıcı DELETE'ler: `clips.status='deleted'` soft-delete'e çevrilir (mevcut sorgular zaten `status='approved'` filtreli → davranış değişmez); gerçek silme periyodik vacuum script'ine.

### 2.4 Şema: tek kaynak = migration'lar *(Faz 2)*

**Neden:** Şema 3 yerde tanımlı ve drift'li; boş volume'a fresh deploy v1 API'yi 500'e düşürüyor.

**Nasıl:** `admin/migrations/0001_baseline.sql` = `sqlite3 data.db .schema` dump'ı; sonrası numaralı dosyalar. `admin/lib/migrate.ts`: boot'ta `PRAGMA user_version` okuyup sıralı uygular; DB dosyası hiç yoksa **fail-fast** (sessiz boş DB yaratma biter). `schema.sql` silinir ya da CI'da `sqlite3 data.db .schema` diff'iyle üretilip doğrulanır. CI job'u: boş DB + migration'lar → tüm v1 endpoint'lere smoke istek.

---

## 3. Veri Pipeline Hedefi (`admin/scripts/`, kök `scripts/`)

### 3.1 Deterministik, idempotent aşamalar *(Faz 2)*

**Neden:** Bugün pipeline = LLM agent'ına ham SQL erişimi + `/tmp` dosyaları + 64 one-off script (saydım: `admin/scripts/` altında 64 dosya, `fix-*`, `seed-a1-wave2..4` gibi tek kullanımlıklar dahil). Tekrar üretilemez, denetlenemez.

**Hedef akış (her adım ayrı CLI, yeniden koşulabilir):**
```
discover → fetch(yt-dlp) → transcribe(WhisperX) → align → tag(rule-based) → translate → qa → approve → publish
```
**Nasıl:**
1. Her adım `INSERT OR IGNORE` / durum kolonu (`pipeline_status`) ile idempotent; girdi-çıktısı DB'de, `/tmp`'de değil. PID dosyaları yerine tek satırlık `jobs` tablosu.
2. **Tek DB path helper'ı:** `admin/scripts/lib/db-path.ts` → `process.env.DATABASE_PATH ?? <repo-kökü>/data.db`; 64 script'in tamamı bundan import eder. 0 byte'lık `admin/data.db` silinir (8+ script'in sessizce boş DB'ye bağlanması burada biter).
3. LLM (tagger/çeviri önerisi) yalnız **öneri üreten** alt adım: çıktısı `*_suggested` kolonlarına yazılır, `approve` adımı (insan ya da kural) olmadan servis edilen tablolara geçmez. `--dangerously-skip-permissions`'lı doğrudan-SQL agent akışı emekli edilir.
4. WhisperX ortamı pin'lenir: `requirements.txt` tam sürümlü (veya `uv lock`); her transkripsiyona `model_name + script_version` meta kaydı → tekrar üretilebilirlik.
5. Akış `PIPELINE.md`'de belgelenir; işi biten wave/fix script'leri `admin/scripts/archive/`'a taşınır (hedef: aktif script sayısı 64 → ~12).

### 3.2 QA gate'leri: `content-health` *(Faz 1'de tek seferlik temizlik, Faz 2'de sürekli)*

**Neden:** 94.638 öksüz `subtitle_lines`, 8 mükerrer `youtube_video_id`, 4.670 çevirisiz approved satır, 59 karşılıksız kelime — bunlar tek tek bulunmuş ama tekrarını önleyen mekanizma yok.

**Nasıl:**
1. **Faz 1 tek seferlik:** öksüz satır temizliği + `VACUUM` (DB ~180MB altına iner) → duplicate video birleştirme (`copy-tokens-from-duplicates.ts` tamamlanır) → `CREATE UNIQUE INDEX idx_videos_youtube_id ON videos(youtube_video_id)`.
2. `admin/scripts/content-health.ts` — tek komutta rapor: `PRAGMA foreign_key_check`, çeviri coverage, structure-tag coverage, oEmbed availability örneklemi, duplicate check, çevirisiz-approved sayacı. Eşik aşımında exit code ≠ 0.
3. Bu script (a) `publish-db.ts`'in ön koşulu = **publish gate**, (b) haftalık cron/CI raporu. iOS'tan gelen `yt_error` telemetrisi oEmbed kontrolünü besler → ölü videolar feed'den otomatik düşer.
4. Yazma disiplini: sqlite3 CLI ile yazan akışlara `PRAGMA foreign_keys=ON;` zorunlu; ideali tüm yazmaların better-sqlite3 üzerinden geçmesi.

---

## 4. Repo Düzeni + Legacy Temizliği

### 4.1 Hedef ağaç *(Faz 2 sonunda)*
```
english-learning-app/
├── README.md          ← katman haritası: ios=ÜRÜN, admin=backend, PIPELINE.md
├── CLAUDE.md          ← + "aktif ürün ios-native'dir, legacy koda dokunma"
├── ios-native/        (Faz 3'te ios/ adına taşınabilir)
├── admin/             (app + lib + migrations + scripts{aktif ~12} + scripts/archive)
├── docs/              ← privacy policy statik sayfası (Pages buradan yayınlanır)
└── .github/workflows/ (ci-ios.yml, ci-admin.yml, pages.yml)
SİLİNENLER (legacy-expo arşiv branch'ine): app/ components/ services/ hooks/
contexts/ i18n/ data/ utils/ constants/ kök scripts/ ios/ patches/ eas.json app.json
```

### 4.2 `data.db`'yi git'ten çıkarma *(Faz 1 — .git şu an 12GB)*

**Neden:** 220MB canlı DB + WAL/SHM + tarihli backup'lar working tree'de ve LFS'te (58 obje). Clone/CI süresi, disk ve "hangisi güncel" belirsizliği.

**Nasıl (sıralı):** (1) `.gitignore`'a `data.db*`; `git rm --cached`; backup'ları `~/Backups`'a taşı. (2) Lokal geliştirme için `make db-pull` (Fly'dan sftp) veya seed script'i. (3) Faz 2'de `git-filter-repo` ile LFS objelerini tarihçeden temizle + force-push (tek geliştirici olduğundan güvenli pencere kolay) + `git lfs prune`. Şema migration dosyalarıyla versiyonlanır — veri değil.

### 4.3 Legacy Expo emekliliği *(Faz 2)*

**Neden:** Legacy katman ölü ama maliyeti canlı: jest 6/10 suite FAIL (admin script'lerini de topluyor), kök `tsc --noEmit` 96 hata, iki uyumsuz SpacedRepetition implementasyonu, App Store privacy policy URL'i legacy web build'ine zincirli.

**Nasıl (bağımlılık sırasıyla):**
1. **Önce zinciri kır:** privacy policy'yi `docs/` statik klasörüne taşı; `deploy.yml` sadece `docs/`'u Pages'e yüklesin.
2. **Spec'leri kurtar:** `dailyTaskGenerator.ts` + spaced-repetition TS testlerindeki senaryoları `ios-native/docs/specs/` altına not et; SR davranış kararı = Swift'teki 1→3→EF merdiveni (SM-2'ye daha yakın), TS testleri XCTest'e port edilir.
3. `git branch legacy-expo` → legacy dizinleri sil. Kök `tsconfig` yüzeyi kendiliğinden küçülür; jest ya tamamen silinir ya `roots: ['__tests__']` ile daraltılır.
4. iOS binary'sindeki erişilemeyen ~2.500 satır legacy ekran (`Features/Courses`, `DailyTasks`, `Lesson`...) `project.yml` `excludes`'a alınır/silinir; `MainTabView`'daki ölü case'ler kaldırılır. Periyodik `periphery scan`.
5. Gamification kararı dokümante edilir (felsefe "no gamification" diyor, kod XP/level/achievement içeriyor): önerim POC için XP/Level/trophy UI'ını söküp `UserProgress`'te alanları migration ile optional bırakmak (eski blob'lar decode olmaya devam eder — §1.2 altyapısı bunu bedavaya getirir).

---

## 5. CI/CD + Test Stratejisi

### 5.1 Test öncelik sırası ("önce hangi testler")

| Sıra | Test | Neden önce |
|---|---|---|
| 1 | `UserProgress` golden-blob decode + migration testleri | Veri kaybı = geri dönüşsüz; Faz 1 fix'inin kanıtı |
| 2 | `SpacedRepetition.computeNextReview` / `dueEntries` (timezone sınırları: 23:30 TR, gün dönümü, DST) | Pure function, 1 günde %100 kapsanır; TR kullanıcı bug'ı burada kilitlenir |
| 3 | `Streak.next(lastActive:now:)` (dün/bugün/gap) | Ölü mantık temizliğinin regresyon kilidi |
| 4 | API kontrat golden-file'ları (admin fixture ↔ Swift decode) | "NULL alan feed'i kırar" sınıfını kapatır |
| 5 | Admin: boş DB + migration → v1 smoke | Fresh-deploy-patlar bulgusunun kilidi |
| 6 | `content-health` eşikleri (publish gate) | İçerik regresyonu kullanıcıya ulaşmadan yakalanır |
| 7 | `ClipPlaybackController` birim testleri (auto-advance, loop, komut kuyruğu) | Faz 2 player refactor'ünün güvencesi |

Canlı YouTube'a giden `YouTubePlayerEmbedIntegrationTests.swift` ayrı test plan'e alınır, default suite'ten çıkar (CI flake kaynağı).

### 5.2 Pipeline *(Faz 1'de minimum, Faz 2'de tam)*

**Önce:** `native-ios-swift` → `main` merge; tek ana branch. Sürümün tek kaynağı `project.yml` (1.0.1/2'ye güncellenir — aksi halde ilk `xcodegen generate` TestFlight sürümünü sessizce geri alır); her TestFlight yüklemesine `ios-v1.0.1-b2` tag'i + CHANGELOG.md.

```
ci-ios.yml   (PR, macos-runner): xcodegen generate → xcodebuild test (unit plan) → SwiftLint
             (custom rule'lar: no_raw_color_hex Features altında, no_force_try)
ci-admin.yml (PR, ubuntu):       cd admin && tsc --noEmit → vitest (kontrat+db testleri)
                                  → boş-DB migration smoke
pages.yml    (main):             docs/ → GitHub Pages (privacy policy)
release:     (tag ios-v*):       Faz 2'de fastlane/Xcode Cloud ile TestFlight upload
publish-db:  (manuel make hedefi): content-health gate → Fly upload → health check
```

---

## 6. Observability

**Neden:** TestFlight'ta kullanıcı var, sıfır crash raporu / log / event — uçuş körlüğü. En kritik kör nokta: progress decode hataları ve player error 101/150/152'ler.

**Nasıl (gizlilik-hafif ikili):**
1. **Faz 1 — `Core/Logging/Log.swift`:** `os.Logger` sarmalayıcısı, kategoriler `network`, `persistence`, `player`, `sr`. İlk bağlanacak üç nokta: `AppState.loadInitial` decode hatası (`.fault`), `APIClient` transport/5xx (`.error`), `YouTubePlayerController.onError(code:videoId:)`. Cihazdan `sysdiagnose`/Console ile okunabilir — sıfır bağımlılık.
2. **Faz 2 — crash + analytics:** Sentry (sembolikasyonlu crash + breadcrumb olarak Logger kategorileri) veya minimum ayak izi isteniyorsa MetricKit (`MXCrashDiagnostic`) + TelemetryDeck. Minimum event seti: `set_started`, `video_finished`, `word_added`, `pattern_completed`, `review_completed`, `yt_error(code, videoId)`. Hepsi anonim; `PrivacyInfo.xcprivacy`'ye işlenir.
3. **Backend:** `/api/health` + Fly checks (Faz 1); yapısal JSON log (route, süre, durum) + `fly logs` üzerinde basit uyarı; `POST /api/v1/telemetry/yt-error` içerik sağlığına geri besleme (Faz 2). Faz 3'te Grafana Cloud/Axiom gibi bir log sink'i, ancak trafik gerektirirse.

---

## 7. Faz Planı

### FAZ 1 — Kanamayı Durdur (1–2 hafta)
*Çıkış kriteri: veri kaybı imkânsız, açık kapılar kilitli, siyah ekran yok, repo klonlanabilir, minimum CI yeşil.*

| # | İş | Bulgu ref | Efor |
|---|---|---|---|
| 1 | `UserProgress` versiyonlu decode + backup-before-overwrite + golden-blob testi (§1.2) | critical/ios | 2 gün |
| 2 | `admin/middleware.ts` ADMIN_TOKEN + `/api/pipeline`,`/api/process` prod guard + `/api/health` + fly checks + rate limiter (§2.1) | 2×critical/backend | 1,5 gün |
| 3 | Player `onError` → hata kartı + reels auto-skip + `yt_error` raporu (§1.5) | critical/ux | 1,5 gün |
| 4 | ATS temizliği + `PrivacyInfo.xcprivacy` + `#if DEBUG` launcher + xcconfig env ayrımı (§1.7) | high×4 | 1 gün |
| 5 | `DayBoundary` + timezone/locale düzeltmesi + SR & streak unit testleri (§1.7, §5.1/2-3) | high/ios | 1,5 gün |
| 6 | `data.db*` git'ten çıkar, backup'ları dışarı taşı, `make db-pull` (§4.2 adım 1-2) | high/pipeline | 0,5 gün |
| 7 | Tek seferlik DB temizliği: öksüz satırlar + VACUUM + UNIQUE index (§3.2/1) | critical/pipeline | 0,5 gün |
| 8 | `project.yml` 1.0.1/2 senkronu + main'e merge + minimum `ci-ios.yml`/`ci-admin.yml` (§5.2) | high/legacy | 1 gün |
| 9 | Hızlı bug'lar: `fetchLessonClips` URLQueryItem, `try!` kaldırma, retry whitelist, streak ölü dalı | medium×4 | 0,5 gün |

### FAZ 2 — Sağlamlaştır (1 ay)
*Çıkış kriteri: tek şema kaynağı, tek publish akışı, tek player çekirdeği, legacy yok, kontrat testli API, crash görünürlüğü.*

1. **Hafta 1:** Migration runner + baseline + fresh-deploy smoke CI (§2.4); `db-path.ts` helper + 0-byte `admin/data.db` silme (§3.1/2).
2. **Hafta 1-2:** `publish-db.ts` + content-health gate + soft-delete + off-site yedek (§2.3, §3.2); pipeline adımlarının idempotent CLI'lara ayrılması + `PIPELINE.md` + script arşivi (§3.1).
3. **Hafta 2-3:** PlayerKit konsolidasyonu: `YouTubePlayerController` kuyruk + `updateUIView` diff + `dismantleUIView` + `ReelCard` generic + `SentenceStructure` tek dosya (§1.5); `ClipPlayerView`'dan `ClipPlaybackController` çıkarma + testleri (§5.1/7).
4. **Hafta 3:** `LoadableState/AppError` + Türkçe hata metinleri + SWR cache (release'te açık, offline'da son başarılı yanıt) (§1.6, medium/backend offline bulgusu); API kontrat tipleri + golden fixture'lar + COALESCE/optional geçişi (§2.2).
5. **Hafta 4:** Legacy emekliliği: privacy policy `docs/`, spec kurtarma, `legacy-expo` branch, silme, jest/tsconfig sadeleşmesi, iOS legacy ekran ayıklama (§4.3); AppState bölünmesi + `PlayerPresence` + `TabView` geçişi (§1.3); Sentry/TelemetryDeck + event seti (§6.2); fastlane TestFlight lane. Retention minimumu: video bitişinde set+index persist + "Devam et" kartı (high/ux).

### FAZ 3 — Ölçekle (2-3+ ay, ürün kararlarına bağlı)

1. **İçerik/hukuk kararı (release-blocker):** YouTube embed ToS pozisyonu — shield kaldırıp ToS-uyumlu embed, ya da lisanslı/CC içerik stratejisi; monetizasyon modeli bu karardan sonra (StoreKit 2).
2. **Sync:** iCloud KVS aynası → Sign in with Apple + backend progress endpoint'i (admin altyapısı hazır).
3. **Backend ayrımı:** public read-only `api` app'i (CDN/s-maxage cache) + private `admin` app'i; Litestream sürekli replikasyon; patterns/scenes sorgusuna `pattern_lines` ön-hesap tablosu + bileşik index.
4. **Player:** reels'te paylaşılan tek WKWebView instance'ı (TikTok mimarisi); Dynamic Type + accessibility tam geçişi; String Catalog **veya** TR-only sadeleşme (ürün kararı: POC için TR-only öneririm — dil seçici ve 5 sözlük silinir).
5. **Repo:** `git-filter-repo` tarihçe küçültme; `ios-native` → `ios` yeniden adlandırma; npm workspaces değerlendirmesi; UI snapshot testleri + haftalık `periphery scan`.

---

## 8. Riskler / Bağımlılıklar

- **Faz 1/1 (progress migration) her şeyden önce gelir:** başka herhangi bir model değişikliği (gamification sökümü dahil) bu altyapı olmadan yeni veri kaybı üretir.
- **`xcodegen generate` tuzağı:** `project.yml` senkronu (Faz 1/8) yapılmadan yapılacak ilk regen, TestFlight sürümünü 1.0.0/1'e geri düşürür — Faz 1'de tek satırlık ama sıralaması kritik.
- **Force-push (Faz 3 tarihçe temizliği)** tek geliştirici olduğundan düşük riskli, ama Faz 1'deki `git rm --cached` sonrası yapılmalı ve `legacy-expo` branch'i push'lanmış olmalı.
- **YouTube ToS kararı** Faz 3'te listelendi ama App Store 1.0 incelemesine gitmeden netleşmeli; teknik değil ürün/hukuk işi olduğu için mühendislik fazlarına paralel yürütülebilir.

**Doğrulama notu:** Bu öneri, denetim bulgularına ek olarak şu doğrudan tespitlere dayanır: `admin/middleware.ts` mevcut değil; `admin/fly.toml`'da hiçbir `[[http_service.checks]]` yok; `ios-native/project.yml:13-14` `MARKETING_VERSION: 1.0.0` / `CURRENT_PROJECT_VERSION: 1` ve `:44-45` `NSAllowsArbitraryLoads: true`; `admin/scripts/` altında 64 script; `ClipPlayerView.swift` 1371, `AppState.swift` 268, `db.ts` 1195, `schema.sql` 148 satır; working tree'de `data.db` + WAL/SHM + 2 tarihli backup seti duruyor.

---

# Bölüm 3 — Ürün / UX Hedef Tasarımı

# English Learning — Ürün/UX Hedef Tasarımı ("Mükemmel Hali")

> Kaynak: `ios-native/` kod incelemesi (MainTabView.swift, VideoFeedView.swift, SetDetailView.swift, ClipPlayerView.swift, VocabView.swift, VocabFeedView.swift, PatternsView.swift, PatternFlowView.swift, VocabReviewView.swift, OnboardingView.swift, ProfileView.swift, Progress.swift, AppState.swift, APIClient.swift) + doğrulanmış denetim bulguları. Tüm öneriler Feynman video-first felsefesine (kelime-seti odaklı video öğrenme, 3 renkli cümle yapısı, gamification yok) sadıktır.

---

## 0. Tasarım İlkeleri (her kararın süzgeci)

1. **Video birincildir, her şey videoya hizmet eder.** Liste, kart, grafik — hepsi kullanıcıyı en kısa yoldan bir sahneye götürmek için var.
2. **Kelime seti müfredattır.** İlerleme = "bu kelimeyi kaç farklı bağlamda gördün" (mevcut `MasteryDots`, 7 bağlam eşiği — `VocabView.swift:394-413` bu fikri zaten doğru kuruyor). Başka ilerleme metriği icat edilmez.
3. **Gamification yok = dopamin tuzağı yok, ama ilerleme hissi VAR.** XP/level/trophy silinir; yerine *gerçeği anlatan* nötr sayaçlar konur: izlenen video, biriken kelime, mezun olan kelime, üst üste gün.
4. **Tek kavram seti:** kullanıcı yüzünde yalnızca **Set · Video · Kelime · Kalıp**. "Lesson", "Course", "Scene", "Clip", "Daily Task" kelimeleri UI'dan tamamen kalkar.
5. **%100 Türkçe UI.** POC hedefi Türk kullanıcı; yarım kalmış 6 dilli mimari (`Localization.swift`, `Progress.swift:5-30` NativeLanguage) sökülür.
6. **Ağ yoksa uygulama ölmez.** Son başarılı içerik her zaman gösterilir; ilerleme asla kaybolmaz.

---

## 1. Bilgi Mimarisi

### 1.1 Mevcut durum (kod envanteri)

`MainTabView.swift:46` bugün 4 tab gösteriyor: `[.patterns, .home, .vocab, .profile]` (varsayılan seçim `.home`). Ama binary'de hâlâ derlenen ve nav grafiğine kısmen bağlı **iki paralel dünya** var:

| Katman | Dosyalar | Durum |
|---|---|---|
| **Aktif (Feynman)** | `VideoFeedView` → `SetDetailView` → `SetPlayerView` → `ClipPlayerView`/`CinemaPlayerView`; `VocabView` (+`VocabFeedView`, `VocabWordDetailView`); `PatternsView` → `PatternDetailView`/`PatternFlowView` → `PatternReelsView`; `ProfileView`; `OnboardingView` | Ürünün kendisi |
| **Legacy (Duolingo-dönemi)** | `HomeView` (XP/journey, 450 satır), `LearningPathView` (400), `LessonDetailView` (939), `LessonClipsView` (272), `CoursesView` (228), `DailyTasksView` (242), `ScenesLandingView` (188), `VideoWatchView` (60), `VocabSetView` (207), `VocabReviewView` (311 — **hiçbir yerden erişilemiyor**) | ~2.900 satır ölü/yarı-ölü kod, TestFlight'a gidiyor |

`Progress.swift:139-158`'deki `UserProgress` da bu ikiliği taşıyor: `lessonMastery`, `checkpointResults`, `dailyTasks`, `achievements`, `xp`, `level` alanları aktif üründe ya hiç ya da yanlış kullanılıyor.

### 1.2 Hedef: 4 tab, tek dünya

```
┌──────────────────────────────────────────────┐
│  İzle        Kalıplar      Kelimeler    Ben  │
│  (film)      (puzzle)      (book)    (person)│
└──────────────────────────────────────────────┘
```

- **İzle** (varsayılan tab): Set listesi + "Devam et" kartı. Bugünkü `VideoFeedView`'ın evrimi.
- **Kalıplar:** Mevcut `PatternsView` yol haritası (locked/available/completed node'lar) korunur — felsefeyle uyumlu çünkü kural anlatmıyor, kalıbı gerçek sahnelerde gösteriyor (`PatternFlowView` cümle akışı + video araları).
- **Kelimeler:** Mevcut `VocabView` (Akış/Liste modu) — ama "tekrar" bacağı buraya bağlanır (bkz. §2.3).
- **Ben:** Felsefeye uygun metriklerle yeniden kurulan profil (bkz. §2.4) + ayarlar + gizlilik.

Tab sırası ve varsayılan düzeltilmeli: bugün `displayed`'da Kalıplar ilk sırada ama varsayılan `.home` (`MainTabView.swift:46,51`) — göz ile başlangıç noktası uyuşmuyor. **İzle ilk sıraya ve varsayılan olarak** alınır.

### 1.3 Silinecekler / birleştirilecekler (net liste)

**SİL (git geçmişi yeter):**
- `Features/Courses/`, `Features/DailyTasks/`, `Features/Scenes/`, `Features/Lesson/`, `Features/Home/HomeView.swift`, `Features/Home/LearningPathView.swift`, `Features/Home/VideoWatchView.swift`, `Features/Vocab/VocabSetView.swift`
- `MainTab.courses` / `MainTab.play` case'leri ve `FloatingTabBar`'daki ölü `.play` dalı (`MainTabView.swift:11,142-143,185-188`)
- `UserProgress`'ten: `xp`, `level`, `achievements`, `dailyTasks`, `checkpointResults`, `lessonMastery`, `completedLessons` (+ `Levels`/`XPReward` enum'ları, `Progress.swift:160-208`) — **şema migration'ı ile** (bkz. §4.1)
- `APIClient`'tan legacy endpoint'ler: `fetchCurriculum`, `fetchLesson`, `fetchLessonClips` (bozuk `?all=true` URL'i dahil, `APIClient.swift:105`), `fetchVocabSets`, `fetchClipsByStructure`
- `Localization.swift` 6-dil altyapısı ve `ProfileView`'daki dil seçici (`ProfileView.swift:217`) → tek TR string kataloğu
- Repo genelinde: legacy Expo katmanı (app/, components/, data/, kök scripts/), `data.db`'nin git'ten çıkarılması (ürün kalitesinin ön koşulu olan hijyen işleri)

**BİRLEŞTİR:**
- `VocabReelCard` + `PatternReelCard` (~450'şer satır kopya) → tek `ReelCard` + `VerticalReelFeed<Item>` generic'i
- 5 yerde kopyalanan 3-renk paleti + contraction map + karaoke render → tek `SentenceStructure` modülü (`Bucket`, `ContractionLexicon`, `KaraokeTextBuilder`)
- `VocabReviewView` (flashcard) → silinir; SRS "tekrar" bacağı akışa gömülür (§2.3). Flashcard drill'i Feynman ilkesine aykırı ("kelimeyi listede değil, sahnede tekrar gör").
- `cleanedTitle`/`ThumbnailMosaic`/`difficultyLabel` kopyaları → extension'lar + tek `RemoteThumbnail`

### 1.4 Navigasyon ve deep link

- `MainTabView.swift:57-68`'deki switch her tab geçişinde state'i öldürüyor → standart `TabView(selection:)` + custom bar overlay (offscreen tab state'i korunur).
- `NavigationPath` tabanlı Router + `.onOpenURL`: `app://set/{id}`, `app://video/{id}`, `app://word/{id}`, `app://pattern/{id}`. Bu, hem bildirimlerden dönüşü (§2.5) hem ileride paylaşma/Spotlight entegrasyonunu açar.
- `isVideoPlayerActive` bool'u (7 view'dan itiliyor, watchdog hack'li) → sayaç/PreferenceKey modeli; tab bar gizleme yarışları biter.

---

## 2. Çekirdek Öğrenme Döngüsü

### 2.1 Döngünün tanımı

Feynman döngüsü üç bacaklıdır ve bugün **ikinci ve üçüncü bacak kopuk**:

```
İZLE (sahne) → YAKALA (starter-word pause, kelimeyi ekle) → TEKRAR GÖR (aynı kelime yeni bağlamlarda)
   ✅ var          ✅ var (ClipPlayerView:1309-1343)          ❌ kopuk (VocabReviewView erişilemez,
                                                                izleme ilerlemesi persist edilmiyor)
```

### 2.2 "İzle" tabı: günlük oturum tasarımı

**Hedef ekran (İzle tabı, yukarıdan aşağı):**

1. **"Devam et" kartı** (en üstte, tek büyük CTA): `"Set 02 · Video 3/8 — kaldığın yerden"`. Bunun için `UserProgress`'e `watchedVideos: [String]` ve `resumePoint: {setId, videoIndex}` eklenir; `SetPlayerView`'ın phase makinesi (`SetDetailView.swift:286-291`) `completed` ve video-geçiş anlarında bunu yazar. Bugün **hiçbir izleme ilerlemesi kaydedilmiyor** — ertesi gün açan kullanıcı sıfırdan başlıyor.
2. **"Bugün" şeridi** (nötr, tek satır): `"Üst üste 3. gün · Bugün 12 dk izledin · 4 kelime tekrar bekliyor"`. Rozet yok, konfeti yok; sadece bilgi. "4 kelime tekrar bekliyor" → Kelimeler tabındaki tekrar akışına götürür.
3. **Set kartları** (mevcut `SetHeroCard` korunur — mozaik + zorluk etiketi iyi çalışıyor) + her kartta **izlenme durumu**: `"3/8 izlendi"` progress bar'ı ve tamamlanan setlerde sakin bir "Tamamlandı" rozeti (onay işareti, animasyonsuz).
4. `SetDetailView` satırlarında izlendi işareti (✓) ve "buradan devam" vurgusu.

**Oturum sonu:** `SetCompleteOverlay` (`SetDetailView.swift:819`) korunur ama içerik değişir: XP yerine *bu oturumda ne oldu* — "8 video · 14 dk · 3 yeni kelime ekledin · 2 kelime yeni bağlamda göründü". Feynman'ın "ne öğrendin"i, Duolingo'nun "kaç puan aldın"ı değil.

### 2.3 "Tekrar" bacağı: SRS'i akışa gömmek

Flashcard ekranı (`VocabReviewView`) silinir. Yerine:

- **Kelimeler tabı Akış modu** (`VocabFeedView`) sıralaması **due-weighted** olur: `AppState.dueForReview` (`AppState.swift:234`) listesindeki kelimelerin sahneleri feed'in başına gelir. Kullanıcı "tekrar yapıyorum" hissetmez; sadece akışı açar ve tam zamanında o kelimelerle yeni sahnelerde karşılaşır. SM-2 `processReview` çağrısı, kullanıcı o kartı sonuna kadar izlediğinde/`"anladım"` dokunuşunda tetiklenir.
- **Liste modunda** üstte tek satır: `"Bugün tekrar sırası gelen: 4 kelime → Akışta izle"`.
- Teknik ön koşullar (bulgulardan): SpacedRepetition timezone standardizasyonu (yerel gün + `Calendar.isDate(_:inSameDayAs:)`), aynı-gün review şişmesi koruması, tek SR implementasyonu (TS kopyası legacy ile silinir), `computeNextReview`/`updateStreak` unit testleri.

### 2.4 İlerleme hissi — gamification'sız "Ben" tabı

`ProfileView` yeniden kurulur; XP ring / Level / trophy / ölü weekly chart gider. Yerine **"Kelime Haritam"**:

- **Mezuniyet hunisi:** `Yeni (≤3 bağlam) → Yaklaşıyor (4-6) → Mezun (7+)` — `VocabFilter` (`VocabView.swift:32-52`) zaten bu segmentasyonu yapıyor, Profile sadece toplamları gösterir. "Mastered" yerine Türkçe **"Mezun"**.
- **Gerçek sayaçlar:** izlenen video / tamamlanan set / eklenen kelime / tamamlanan kalıp / toplam izleme dakikası (`SessionEntry.minutesWatched` zaten var, `Progress.swift:104-111` — gerçek veriye bağlanır).
- **Üst üste gün:** tek satır, alev ikonu yok. `updateStreak` `scenePhase == .active`'e taşınır (bugün yalnızca `MainTabView.onAppear`, `MainTabView.swift:86`).
- Ayarlar bölümü: bildirim tercihi, gizlilik politikası linki, iletişim, sürüm (Bundle'dan), veri sıfırlama.

### 2.5 Devam ettirme (retention)

- **Yerel bildirim, opt-in ve nötr:** onboarding'de değil, *ikinci oturum sonunda* sorulur ("Hatırlatıcı ister misin?"). Metin baskısız: "Bugün 10 dakikan var mı? Set 02'de kaldın." Streak tehdidi ("serini kaybetme!") asla kullanılmaz.
- Bildirime dokunuş → deep link ile doğrudan devam noktasına.

---

## 3. Video Deneyimi

### 3.1 Tek player mimarisi

Bugün: her reel kartı kendi `WKWebView`'ını mount ediyor, 220ms JS ticker'ı temizlenmiyor, `updateUIView` prop değişikliklerini yok sayıyor, tek slotlu command binding komut kaybediyor. Hedef:

- **`PlayerController: ObservableObject`** — komut kuyruğu (`send(.seekAndPlay(t))`), `currentTime`, `isPlaying`, `onError` yayını. `YouTubePlayerView` tek yerde tanımlı, `loadVideoById` ile parametreli reload (remount `.id()` hack'leri gider).
- **Reels'te TikTok mimarisi:** tek paylaşılan player instance'ı, kartlar arasında `videoId` swap. `dismantleUIView` + PLAYING-durumunda-çalışan ticker.
- **`ClipPlaybackController`**: `ClipPlayerView`'daki (1371 satır) karaoke/auto-advance/loop mantığı ViewModel'e iner — starter-word pause (ürünün kalbi, `ClipPlayerView.swift:1309-1343`) test edilebilir hale gelir.
- Cinema modu korunur; `OrientationLock` push/pop sayaç semantiğine geçer (video geçişinde portrait'e düşme biter).

### 3.2 Hata UX'i — "siyah ekran yasak"

YouTube embed hataları (101/150/152) bugün hiçbir view'da ele alınmıyor. Hedef davranış:

- **Set akışında:** hata → sahnenin yerinde Türkçe kart: *"Bu video şu an oynatılamıyor"* + 3 sn sonra otomatik sonraki videoya geçiş (NextUp overlay'in aynısı, "atlandı" ibaresiyle). Manuel "Tekrar dene" ikincil aksiyon.
- **Reels akışlarında:** kart sessizce feed'den düşer, sonraki kart gelir.
- **Telemetri:** her hata `yt_error(videoId, code)` olarak backend'e raporlanır → mevcut oEmbed temizlik script'i cron'a bağlanır, ölü videolar feed'lere hiç girmez. Böylece kullanıcı hatayı giderek daha az görür.

### 3.3 YouTube riskine ürün cevabı

Bu bir hukuk/ürün kararı, UI detayı değil. App Store 5.2.3 için savunulabilir pozisyon:

1. **Resmi IFrame API + görünür atıf:** shield/gizleme yaklaşımı bırakılır; her sahnede kanal adı + "YouTube'da aç" linki görünür olur (bizim değer katmanımız videoyu gizlemek değil, altyazı/yapı/kelime katmanı). App Review notlarında embed'in resmi API ile yapıldığı belgelenir.
2. **İçerik stratejisi B planı:** POC doğrulanırsa kürasyon Creative Commons + lisanslı içeriğe kayar (monetizasyonun da ön koşulu, §7).
3. **Offline gerçeği:** YouTube ToS gereği video indirilemez. "Offline" vaadi dürüst tanımlanır: **metadata, altyazılar, kelime defteri ve akış listeleri offline çalışır; video oynatma internet ister.** Uçak modunda kullanıcı kelime listesini, sahne transkriptlerini ve okunuşları görebilir; play'e basınca tek satırlık "Video için internet gerekli" bandı çıkar.

### 3.4 Offline / dayanıklılık

- **Stale-while-revalidate:** `videoSets`, `pocVideos`, `starterWordSummaries`, pattern listeleri süresiz disk cache'ine yazılır; açılışta önce cache gösterilir, arkada tazelenir (CacheService zaten var). Backend down = kullanıcı fark etmez.
- App bundle'ına **seed JSON** (ilk 2-3 setin metadata'sı): ilk açılış + hiç internet yok senaryosu bile boş ekran göstermez.
- Ağ hatası ≠ boş ekran: cache varsa sessiz banner ("Güncellenemedi, son içerik gösteriliyor"), cache yoksa `ErrorState`.

---

## 4. Hesap / Senkron Stratejisi

### 4.1 Faz 0 — veri güvenliği (senkrondan ÖNCE, şimdi)

Kritik bulgu: `UserProgress` decode'u tek alan ekleme/silmede **tüm ilerlemeyi sessizce sıfırlıyor**. §1.3'teki alan temizliği bu yüzden migration'sız yapılamaz:

- `UserProgress`'e `schemaVersion` + custom `init(from:)` (`decodeIfPresent ?? default`), versiyonlu migration fonksiyonu.
- Decode başarısızsa ham blob `user_progress_v2_backup` key'ine kopyalanır, üzerine yazılmaz, hata loglanır.
- Persistence debounce'lanır ve background'a alınır (bugün her mutasyonda main thread'de tam re-encode).

### 4.2 Faz 1 — iCloud KVS (POC, hesapsız)

- `NSUbiquitousKeyValueStore`: `UserProgress` + `vocabPool` blob'ları (temizlenmiş şema 1MB limitine rahat sığar). Hesap yok, ekran yok, izin yok — kullanıcı için görünmez sigorta.
- **Merge kuralı** (cihazlar arası çakışma): `learnedWords`/`watchedVideos` = union; SRS entry'lerde `lastReviewDate` yenisi kazanır; sayaçlarda max. "Son yazan kazanır" asla kullanılmaz (ilerleme kaybettirir).
- Ayarlar'da tek satır: "İlerlemen iCloud'da yedekleniyor ✓".

### 4.3 Faz 2 — Sign in with Apple + backend progress (POC sonrası)

- Amaç: Android/web'e açılma + kişisel öneri (due kelimelere göre set sıralama) sunucuya taşınınca.
- `POST /api/v1/progress` (auth'lu) + aynı merge kuralları sunucuda.
- **Ön koşul (kritik bulgular):** admin backend'e auth (mutasyonlar `ADMIN_TOKEN` arkasına), public read-only API'nin ayrılması, rate limiting, ATS'in açılması (`NSAllowsArbitraryLoads` kaldırılır). Kullanıcı verisi barındıracak bir backend bugünkü haliyle bu işi taşıyamaz.

---

## 5. İlk Kullanım, Boş Durumlar, Hata Durumları

### 5.1 Onboarding: 4 adımdan 2 adıma

Bugünkü akış (`OnboardingView.swift:39-41`: dil → seviye → hedef → dakika) topladığı hiçbir veriyi kullanmıyor ve **çekirdek mekaniği öğretmiyor**. Hedef:

- **Ekran 1 — "3 renk" tanıtımı:** canlı örnek cümle üzerinde özne/yüklem/geri kalanın renklenişi animasyonla gösterilir: *"Cümleleri renklerle okuyacaksın."* (statik görsel değil, gerçek karaoke bileşeniyle).
- **Ekran 2 — "dokun-ekle" demosu + seviye:** amber altı çizili kelimeye dokunma denemesi ("dokun → cebine girdi") + tek soru: "İngilizcen ne durumda?" (Başlıyorum / Biraz var / Orta). **Cevap gerçekten kullanılır:** set listesinin başlangıç sıralamasını belirler (`difficulty` alanı zaten var, `VideoFeedView.swift:201-219`).
- Dil seçimi, hedef ve dakika adımları silinir. Onboarding biter bitmez **ilk setin ilk videosu otomatik açılır** — ilk değer anı ≤60 saniye.

### 5.2 Boş durumlar (tek `EmptyState` bileşeni, `variant: .dark` ile)

- **Kelimeler boş:** mevcut metin iyi (`VocabView.swift:247-256`) — üstüne tek CTA eklenir: "Bir set aç" (İzle tabına atlar). Akış modunun boş hali de aynı bileşeni kullanır (bugün el yapımı kopya).
- **Tekrar sırası boş:** "Bugün tekrar yok — akışta yeni kelimelerle karşılaş."
- **Kalıplar başlangıcı:** ilk node zaten `available`; ekstra boş durum gerekmiyor, ilk girişte legend (3-renk anahtarı, `PatternsView.swift:63`) bir kere vurgulanır.

### 5.3 Hata durumları — tek dil, tek katman

- `AppError: LocalizedError` katmanı + `LoadableState<T>` (8 ViewModel'deki kopya `isLoading/errorMessage` kalıbı yerine). Eşleme tek yerde: transport → *"İnternet bağlantını kontrol et"*, 5xx → *"Sunucuda geçici bir sorun var"*, decode → *"İçerik yüklenemedi"*. Ham `error.localizedDescription` kullanıcıya asla gösterilmez; teknik detay `os.Logger`'a.
- Retry politikası: yalnızca transport/5xx retry, decode aynen fırlatılır, cancellation yutulmaz.
- Her `ErrorState`'te retry butonu + cache varsa "son içeriği göster" yolu.

---

## 6. App Store Kalite Çıtası

### 6.1 Görsel dil

- **Dark-only resmileşir:** `Info.plist`'e `UIUserInterfaceStyle = Dark`; dağınık `preferredColorScheme` çağrıları silinir. (Light tema POC kapsamı dışı; istenirse Theme renkleri Asset Catalog semantic color'a taşınır.)
- **Token disiplini:** Features altındaki 70 `Color(hex:)` Theme token'ına çevrilir; eksik semantik token'lar eklenir (`karaokeGloss`, `translationAmber` — bugün `VocabView.swift:358`'de ham `0xE0B07A`, `targetUnderline`, 3 yapı rengi). SwiftLint `no_raw_color_hex` kuralı.
- Loading/empty/error metinleri tek TR string kataloğundan; "YENI KELIME" gibi yazım hataları ve EN/TR karışımı (Cinema chrome, `HomeView`'daki "Your journey" kalıntıları) temizlenir.

### 6.2 Accessibility (inceleme değil, ürün kalitesi)

- **Dynamic Type:** `Theme.Font` sabit puntolardan `Font.system(.body...)` + `@ScaledMetric`'e geçer. Karaoke satırı büyük puntoda satır kaydırmalı test edilir.
- **VoiceOver:** ikon-only butonlara (`FloatingTabBar`, player transport, reel aksiyon sütunu) `accessibilityLabel`; karaoke satırına `.accessibilityElement(children: .combine)` + tam cümle etiketi.
- **Kontrast:** `textMuted` küçük puntolarda WCAG AA'ya çekilir; **Reduce Motion**'da reel geçiş/auto-advance animasyonları sadeleşir.

### 6.3 Privacy & güvenlik

- `PrivacyInfo.xcprivacy` (UserDefaults → CA92.1; tracking yok, veri toplama beyanı telemetriyle tutarlı).
- ATS açılır (`NSAllowsArbitraryLoads` kaldırılır; DEBUG için `NSAllowsLocalNetworking`).
- Gizlilik politikası: legacy Expo web build'inden bağımsız statik sayfa (`docs/` → Pages); Ben tabında link.
- Telemetri privacy-hafif: MetricKit/Sentry crash + TelemetryDeck tarzı anonim sayaç. Minimum event seti: `set_started`, `video_finished`, `word_added`, `word_graduated`, `pattern_completed`, `yt_error(code)`, `session_minutes`.

### 6.4 Süreç çıtası

- Sürüm tek kaynak (`project.yml`), her TestFlight'ta git tag; CI: xcodebuild test + SwiftLint + jest (ayıklandıktan sonra).
- Test öncelikleri: `SpacedRepetition`, streak, `UserProgress` migration, `ClipPlaybackController` (auto-advance/pause). Canlı YouTube testi default suite'ten çıkar.
- Yaş derecelendirmesi 12+ hedeflenir → admin review akışına "küfür/şiddet" işaretleme alanı eklenir (kürasyon kuralı olarak dokümante edilir).

---

## 7. Monetizasyon Zemini (POC sonrası, ama zemin şimdi)

**İlke:** çekirdek döngü (izle-yakala-tekrar gör) asla paywall arkasına girmez; YouTube embed'li içerik doğrudan satılamaz (ToS + telif). İki senaryo:

- **Senaryo A (lisanslı/özgün içerik):** POC doğrularsa premium setler lisanslı içerikle gelir → klasik "ücretsiz N set + Pro'da tam kütüphane".
- **Senaryo B (YouTube katmanı ücretsiz kalır):** Pro = *kişisel katman*: sınırsız kelime havuzu (ücretsizde ör. 50 aktif kelime), gelişmiş okunuş/telaffuz kartları, kişisel aylık rapor ("bu ay 214 dk, 31 kelime mezun"), öncelikli yeni setler.

**Şimdi atılacak zemin taşları:** (1) `EntitlementStore` soyutlaması (tek `isPro` kapısı — UI'da limit noktaları tek yerden), (2) anonim telemetri (hangi limitin anlamlı olduğunu veri söyler), (3) hesap altyapısı Faz 2 (satın alım restore + çoklu cihaz için), (4) içerik lisansı kararının ürün yol haritasına yazılması. StoreKit 2 entegrasyonu ancak bu karardan sonra.

---

## 8. Yol Haritası (önerilen sıra)

**Faz 1 — Güvenli zemin (1-2 hafta):** UserProgress migration + backup (§4.1) → backend auth + ATS → YouTube onError UX (§3.2) → legacy ekran/alan silme (§1.3) → izleme ilerlemesi persist + "Devam et" kartı (§2.2).

**Faz 2 — Döngüyü kapat (2-3 hafta):** due-weighted akış (§2.3) → Ben tabı yeniden kurulum (§2.4) → onboarding 2 ekran (§5.1) → stale-while-revalidate + seed JSON (§3.4) → AppError/LoadableState (§5.3) → tek ReelCard/PlayerController (§3.1).

**Faz 3 — Vitrin kalitesi (2 hafta):** Dynamic Type + VoiceOver (§6.2) → PrivacyInfo + politika sayfası + telemetri (§6.3) → TR string kataloğu + token disiplini (§6.1) → iCloud KVS (§4.2) → App Review dosyası (5.2.3 cevabı, yaş derecelendirme) → TestFlight → 1.1 submission.

**Sonuç ürün cümlesi:** *"Bir set seç, sahneleri izle; renkler cümleyi söker, dokunduğun kelimeler cebine girer ve tam unutacakken yeni bir sahnede karşına çıkar. Puan yok, seviye yok — sadece dilin kendisi."* Uygulamanın her ekranı bu cümlenin bir parçasını taşımalı; taşımayan her şey (ve yukarıda listelenen ~2.900 satır) silinmelidir.