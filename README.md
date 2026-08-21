# WiFi Checker Pro

Dashboard diagnostik jaringan berbasis browser dengan pengukuran nyata, consent-first geolocation, dan UI network-lab yang responsif.

## Fitur utama

- Download dan upload speed test ke Cloudflare edge
- Idle ping / latency dan jitter
- Loaded latency saat download dan upload
- Indikator bufferbloat berbasis kenaikan loaded latency
- Network quality score 0–100 untuk Full Test
- Quick Check dengan payload lebih kecil
- Public IP, ISP / organization, ASN, Cloudflare edge/colo, dan perkiraan lokasi IP
- Geolocation perangkat melalui Geolocation API setelah persetujuan pengguna
- Cloudflare dan Google DNS-over-HTTPS diagnostics
- Network Information API jika tersedia
- Informasi browser/perangkat yang memang diekspos browser
- Rekomendasi otomatis berdasarkan hasil ukur
- Riwayat lokal opsional
- Copy summary dan Export JSON
- Dark/light mode
- PWA + service worker
- Animasi gauge, progress, sparklines, ambient network canvas, dan responsive mobile layout
- Tombol pembatalan pengujian

## Permission preflight

Sebelum Full Test atau Quick Check, aplikasi menampilkan preflight yang menjelaskan data dan trafik yang akan digunakan.

Lokasi presisi hanya diminta melalui prompt resmi browser/OS menggunakan `navigator.geolocation.getCurrentPosition()` dengan high-accuracy mode. Pengguna dapat memilih **Tanpa lokasi** dan pengujian jaringan tetap berjalan.

Koordinat latitude/longitude presisi tidak disimpan dalam riwayat lokal dan tidak dimasukkan ke Export JSON. Riwayat hanya menyimpan status permission dan nilai akurasi lokasi bila tersedia.

## Prinsip: tidak ada data dummy

Angka speed, latency, jitter, DNS timing, dan loaded latency berasal dari request jaringan aktual. Jika suatu API dibatasi browser atau request gagal, UI menampilkan tidak tersedia/gagal daripada membuat nilai palsu.

`Network Information API` tidak tersedia di semua browser. Website biasa juga tidak dapat membaca data sensitif Wi-Fi berikut secara portabel:

- password Wi-Fi
- BSSID / MAC router
- Wi-Fi channel
- RSSI / signal strength dBm
- daftar perangkat LAN
- DNS server aktual yang dikonfigurasi router/perangkat

Aplikasi tidak mengarang data tersebut.

## Mesin pengukuran

Bandwidth dan latency memakai endpoint Cloudflare Speedtest:

- `https://speed.cloudflare.com/__down`
- `https://speed.cloudflare.com/__up`

Full Test menggunakan warm-up dan payload adaptif, beberapa sampel per arah, percentile bandwidth, latency sampling, dan loaded-latency probes. Hasil speed test browser tetap dapat dipengaruhi device load, VPN/proxy, Wi-Fi contention, browser scheduling, dan kondisi ISP.

Full Test dapat menggunakan sekitar 100 MB data pada koneksi cepat; preflight memperingatkan pengguna sebelum mulai. Quick Check menggunakan trafik jauh lebih kecil dan ditandai sebagai quick estimate, bukan pengganti Full Test.

Packet-loss tidak ditampilkan sebagai angka palsu. Pengukuran packet loss yang benar membutuhkan infrastruktur UDP/WebRTC/TURN yang sesuai.

## Validasi otomatis

Workflow `.github/workflows/validate.yml` menjalankan:

- `node --check app.js`
- pemeriksaan seluruh DOM ID yang direferensikan JavaScript tersedia di `index.html`

Workflow `.github/workflows/pages.yml` menangani deployment GitHub Pages dari branch `main`.

## Menjalankan lokal

```bash
python3 -m http.server 8080
```

Untuk geolocation, gunakan HTTPS pada deployment produksi. `localhost` juga diperlakukan sebagai secure context oleh browser modern untuk development.

## GitHub Pages

Di repository, buka **Settings → Pages → Build and deployment → GitHub Actions**.

Setelah GitHub Pages aktif, alamat situs:

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
.github/workflows/validate.yml
```
