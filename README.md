# Usûl veri deposu

Bu depo, **Usûl** Android uygulamasının uygulama güncellemesi gerektirmeden
usûl gösterimlerini yenileyebilmesi için kullanılan doğrulanmış veri
kataloğunu taşır.

## Dizin yapısı

- `public/veri/manifest.json`: uygulamanın açılışta kontrol ettiği küçük sürüm dosyası
- `public/veri/katalog/`: değiştirilmeyen, sürümlenmiş katalog dosyaları
- `tools/validate-catalog.mjs`: süre, kimlik, şema, boyut ve SHA-256 denetimi
- `.github/workflows/validate-catalog.yml`: her gönderimde otomatik doğrulama

- `public/index.html`: `usul.sazusoz.com` tanıtım ve canlı katalog durum sayfası
- `public/gizlilik.html`: Android uygulaması gizlilik politikası
- `.github/workflows/deploy-pages.yml`: `public/` klasörünü GitHub Pages'e yayınlar

Web sayfası `public/` kökünde, uygulamanın makine tarafından okunan veri
dosyaları ise `public/veri/` altında tutulur. Böylece tanıtım sayfası ile veri
güncelleme uç noktası birbirine karışmaz.

## Yayın akışı

1. **Usûl Veri** uygulamasında hece, nota çizgisi, ses veya süre düzeltilir.
2. Uygulama bütün katalogu doğrular ve yeni sürüm dosyasını üretir.
3. `manifest.json` yeni dosyanın boyutu ve SHA-256 özetiyle yenilenir.
4. Değişiklik GitHub'a gönderilir.
5. Android uygulaması açılışta manifesti kontrol eder; yalnızca doğrulanan
   kataloğu atomik biçimde kurar.

Katalog ayrıca Android uygulamasının Ayarlar ekranındaki **Usûl verileri**
bölümünden elle denetlenebilir. Bağlantı yoksa son doğrulanmış kopya, o da yoksa
APK içindeki yerleşik katalog kullanılmaya devam eder.

Hece, nota çizgisi ve çalınacak ses birbirinden bağımsız alanlardır. `Te`,
`Ke`, `Tâ` veya `Hek` adına bakılarak nota çizgisi ya da ses türetilmez.
Kaynak listesi de katalogdan dinamik oluşur; Özkan ve Ungay dışında yeni bir
kitap ya da araştırmacı kaynağı APK güncellemeden eklenebilir.

