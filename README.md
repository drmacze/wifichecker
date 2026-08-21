# WiFi Checker Pro

WiFi Checker Pro adalah dashboard diagnostik jaringan berbasis browser untuk mengecek kualitas koneksi Internet/Wi‑Fi tanpa aplikasi tambahan.

## Fitur

- Download speed test
- Upload speed test
- Ping / latency
- Jitter
- Network quality score 0–100
- Status online/offline
- Network Information API jika didukung browser
- Public IP
- ISP / organization
- ASN
- Cloudflare edge/colo
- Perkiraan lokasi berdasarkan IP
- Cloudflare DNS-over-HTTPS diagnostic
- Google Public DNS-over-HTTPS diagnostic
- Browser & device capability info
- Smart recommendations berdasarkan hasil tes
- Riwayat hasil di `localStorage`
- Copy summary
- Export JSON
- Dark/light theme
- PWA manifest + offline app shell
- Responsive untuk desktop dan mobile

## Batasan penting browser

Website biasa **tidak dapat** membaca informasi sensitif Wi‑Fi seperti:

- SSID
- BSSID / MAC address router
- password Wi‑Fi
- Wi‑Fi channel
- RSSI / signal strength dalam dBm
- daftar seluruh perangkat di LAN
- DNS server aktual yang dikonfigurasi di perangkat/router

Browser modern sengaja tidak mengekspos data tersebut demi keamanan dan privasi. Website ini tidak memalsukan data tersebut. Informasi koneksi tambahan akan tampil hanya jika browser menyediakan `Network Information API`.

## Mesin speed test

Tes bandwidth dan latency menggunakan endpoint edge Cloudflare (`speed.cloudflare.com`). DNS diagnostic menguji resolver DNS-over-HTTPS Cloudflare dan Google. Hasil dapat berbeda dari aplikasi native karena browser, device load, VPN, proxy, Wi‑Fi contention, TCP/TLS warm-up, dan kebijakan jaringan.

Full Test dapat menggunakan puluhan MB data.

## Menjalankan lokal

Karena fitur Service Worker dan beberapa Web API membutuhkan secure context, gunakan server lokal daripada membuka `index.html` langsung.

Contoh:

```bash
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080`.

## GitHub Pages

Workflow deployment tersedia di `.github/workflows/pages.yml`.

Untuk aktivasi pertama kali:

1. Buka repository **Settings**.
2. Masuk ke **Pages**.
3. Pada **Build and deployment**, pilih **GitHub Actions** sebagai source.
4. Jalankan ulang workflow **Deploy WiFi Checker to GitHub Pages** bila run pertama terjadi sebelum Pages diaktifkan.

Setelah aktif, website normalnya tersedia di:

`https://drmacze.github.io/wifichecker/`

## Struktur

```text
index.html
styles.css
app.js
manifest.webmanifest
icon.svg
sw.js
.nojekyll
.github/workflows/pages.yml
```

## Privasi

Riwayat pengujian disimpan lokal pada browser pengguna. Untuk menjalankan tes, browser tetap membuat request jaringan ke endpoint speed test / IP metadata / DNS diagnostics yang digunakan aplikasi.
