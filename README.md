# Usûl veri deposu

Bu depo, **Usûl** Android uygulamasının uygulama güncellemesi gerektirmeden
usûl gösterimlerini yenileyebilmesi için kullanılan doğrulanmış veri
kataloğunu taşır.

## Dizin yapısı

- `public/veri/manifest.json`: uygulamanın açılışta kontrol ettiği küçük sürüm dosyası
- `public/veri/katalog/`: değiştirilmeyen, sürümlenmiş katalog dosyaları
- `tools/validate-catalog.mjs`: süre, kimlik, şema, boyut ve SHA-256 denetimi
- `.github/workflows/validate-catalog.yml`: her gönderimde otomatik doğrulama

Web sayfası daha sonra `public/` köküne eklenecektir. Veri dosyalarının
tamamı `public/veri/` altında tutulduğu için web sayfasıyla çakışmaz.

## Yayın akışı

1. **Usûl Veri** uygulamasında hece, nota çizgisi, ses veya süre düzeltilir.
2. Uygulama bütün katalogu doğrular ve yeni sürüm dosyasını üretir.
3. `manifest.json` yeni dosyanın boyutu ve SHA-256 özetiyle yenilenir.
4. Değişiklik GitHub'a gönderilir.
5. Android uygulaması açılışta manifesti kontrol eder; yalnızca doğrulanan
   kataloğu atomik biçimde kurar.

Hece, nota çizgisi ve çalınacak ses birbirinden bağımsız alanlardır. `Te`,
`Ke`, `Tâ` veya `Hek` adına bakılarak nota çizgisi ya da ses türetilmez.

