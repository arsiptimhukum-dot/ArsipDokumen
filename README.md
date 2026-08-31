# Arsip

Website pribadi untuk menyimpan dan mengakses dokumen perusahaan dari mana saja.
File disimpan di Google Drive (bisa pakai beberapa akun sekaligus agar total
kapasitas gratisnya bertambah), website-nya sendiri di-deploy ke Vercel.

## Fitur

- Hanya menerima file **.doc, .docx, atau .pdf** saat unggah.
- Setiap unggahan diberi **kategori** (pilih yang sudah ada atau ketik baru lewat popup).
- File Word otomatis dikonversi Google Drive jadi Google Docs saat diunggah,
  supaya saat **diunduh selalu keluar sebagai PDF** (tidak perlu tool konversi
  tambahan). File yang aslinya sudah PDF diunduh apa adanya.

## Cara kerja singkat

- Kamu login ke website pakai 1 password (yang kamu tentukan sendiri).
- Setiap file yang diunggah otomatis disimpan ke folder `ArsipPerusahaan`
  di salah satu akun Google Drive yang sudah dikonfigurasi — dipilih
  otomatis yang sisa ruangnya paling banyak.
- Saat membuka arsip, semua file dari semua akun digabung jadi satu daftar.
- Tidak ada database terpisah — Google Drive itu sendiri jadi tempat
  penyimpanan data & filenya.

## Langkah 1 — Buat OAuth Client di Google Cloud Console

1. Buka https://console.cloud.google.com/ , buat project baru (nama bebas, misal "Arsip Pribadi").
2. Di menu **APIs & Services > Library**, cari **Google Drive API**, klik **Enable**.
3. Di menu **APIs & Services > OAuth consent screen**:
   - Pilih **External**, isi nama aplikasi bebas (misal "Arsip").
   - Di bagian **Test users**, tambahkan SEMUA alamat email Google yang akan
     kamu pakai sebagai tempat penyimpanan (termasuk akun utamamu).
4. Di menu **APIs & Services > Credentials**, klik **Create Credentials > OAuth client ID**.
   - Application type: **Web application**
   - Authorized redirect URIs: tambahkan `http://localhost:3000/oauth-callback`
   - Simpan **Client ID** dan **Client Secret** yang muncul.

## Langkah 2 — Ambil refresh token untuk tiap akun Drive

Refresh token adalah "kunci" yang membuat aplikasi bisa akses Drive kamu
tanpa perlu login ulang terus-menerus. Perlu diambil sekali per akun.

Di komputer lokal (bukan di Vercel):

```bash
npm install
cp .env.example .env
# isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di .env

node scripts/get-refresh-token.js
```

Ikuti instruksi di terminal: buka link yang muncul, login dengan akun
Google pertama yang mau dipakai, setujui izin, lalu salin kode dari URL
redirect dan tempel di terminal. Refresh token akan muncul — catat.

**Ulangi langkah ini untuk setiap akun Google lain** yang mau ditambahkan
ke "pool" penyimpanan (misal 3-5 akun @gmail, masing-masing dapat 15GB
gratis).

## Langkah 3 — Deploy ke Vercel

1. Push folder ini ke repository GitHub.
2. Buka https://vercel.com , **Add New Project**, pilih repo tersebut.
3. Di bagian **Environment Variables**, isi:

   | Nama | Isi |
   |---|---|
   | `ADMIN_PASSWORD` | password pilihanmu untuk login ke website |
   | `SESSION_SECRET` | string acak panjang, bebas (buat sendiri) |
   | `GOOGLE_CLIENT_ID` | dari Langkah 1 |
   | `GOOGLE_CLIENT_SECRET` | dari Langkah 1 |
   | `DRIVE_ACCOUNT_1_REFRESH_TOKEN` | refresh token akun Drive pertama |
   | `DRIVE_ACCOUNT_1_LABEL` | nama bebas, misal "Akun Utama" |
   | `DRIVE_ACCOUNT_2_REFRESH_TOKEN` | refresh token akun kedua (kalau ada) |
   | `DRIVE_ACCOUNT_2_LABEL` | nama bebas |
   | ...dst | tambah nomor urut untuk tiap akun tambahan |

4. Klik **Deploy**.
5. Buka domain yang diberikan Vercel, login pakai `ADMIN_PASSWORD`, mulai
   unggah dokumen.

## Menambah akun Drive di kemudian hari

Kapan saja mau nambah kapasitas: ulangi Langkah 2 untuk akun baru,
lalu tambahkan `DRIVE_ACCOUNT_N_REFRESH_TOKEN` (nomor berikutnya) di
Environment Variables Vercel, redeploy.

## Menjalankan di lokal (opsional, untuk coba-coba sebelum deploy)

```bash
npm install
npm run dev
```

Buka http://localhost:3000 — pastikan semua env var di `.env` sudah diisi
(termasuk minimal 1 akun Drive).

## Catatan keamanan

- Password login (`ADMIN_PASSWORD`) adalah satu-satunya penghalang ke
  seluruh arsip — pakai password yang kuat dan jangan dibagikan.
- Karena OAuth consent screen dalam mode **Testing**, token tidak
  kedaluwarsa selama akun yang dipakai tetap terdaftar sebagai *test user* —
  tidak perlu publish app ke Google.
- File tersimpan di folder `ArsipPerusahaan` di root masing-masing akun
  Drive — jangan dihapus/direname manual dari Drive langsung supaya
  aplikasi tidak bingung.
