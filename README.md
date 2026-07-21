# Harfiyen

İki telefondan oynanan, gerçek zamanlı Türkçe mini oyunlar. Bir oda kur, linki sevgiline veya arkadaşına gönder ve aynı anda oynamaya başla.

**[Canlı oyna](https://harfiyen-gundem.r00tmancer.workers.dev)**

## Oyunlar

- **Randevu Ruleti — yeni:** Yemek, etkinlik ve tatlıyı gizlice seçin. Aynı seçim doğrudan plana girer; farklı seçimlerde güvenli rulet karar verir. Ortaya çıkan üç parçalı randevuyu Story görseli olarak paylaşın.
- **Beni Yakala:** Önce kendi tercihini gizlice seç, sonra sevgilinin cevabını tahmin et. Beş turun sonunda kalp okuma skorunu Story görseli olarak paylaş.
- **Kör Sıralama:** Beş sürpriz seçenek tek tek gelir. Geleceği bilmeden 1–5 arasına kilitleyin; listeler açılınca uyum yüzdesini Story görseli olarak paylaşın.
- **Telepati:** Aynı sorulara gizlice cevap verip ortak uyumu ölçün.
- **Harf Yarışı, Sayı Avı, Kelime Zinciri, En Uzun Kelime ve Bom:** Rekabetçi kısa oyunlar.

- **İstemci**: Vite + React + TypeScript; Cloudflare Worker assets veya GitHub Pages üzerinde statik.
- **Sunucu**: Cloudflare Worker + Durable Object (oda başına bir nesne), WebSocket Hibernation.
- **Kelime doğrulama**: TDK Güncel Türkçe Sözlük'ten türetilmiş ~62 bin kelimelik gömülü liste — çevrimdışı, deterministik, <1 ms.

## Geliştirme

```bash
npm install
npm run data          # kelime listesini üretir (tek seferlik, çıktılar commit'lidir)
npm run dev:worker    # http://localhost:8787
npm run dev:web       # http://localhost:5173
```

## Dağıtım

- Cloudflare (Worker + Durable Object + web assets): `npm run deploy`
- GitHub Pages: `main`'e push → test/typecheck/build → `gh-pages`

Varsayılan web base yolu Cloudflare için `/` olur. GitHub Pages workflow'u yeni repo adını otomatik olarak `VITE_BASE_PATH` üzerinden ayarlar.

## Veri kaynakları ve atıflar

- Kelime listesi: [ogun/guncel-turkce-sozluk](https://github.com/ogun/guncel-turkce-sozluk) (MIT) — TDK Güncel Türkçe Sözlük 12. baskı dökümünden filtrelenmiştir.
- Takma ad küfür filtresi: [ooguz/turkce-kufur-karaliste](https://github.com/ooguz/turkce-kufur-karaliste) (CC-BY-SA-4.0).
