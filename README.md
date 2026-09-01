# Arsip

Website pribadi untuk menyimpan dan mengakses dokumen perusahaan dari mana saja.
File disimpan di Google Drive (bisa pakai beberapa akun sekaligus), website-nya
di-deploy ke Vercel.

## Fitur

- Login dengan 1 password.
- Upload file **Word (.doc/.docx), Excel (.xls/.xlsx), atau PDF** — maksimal **5MB** per file.
- Tiap file dikasih **kategori** (pilih yang ada atau bikin baru saat upload), bisa dihapus juga.
- **Lihat**: buka preview PDF di tab baru (file Word/Excel otomatis dikonversi
  jadi PDF khusus untuk preview, filenya sendiri tidak berubah).
- **Unduh**: file diunduh dalam **format aslinya** (Word → .docx, Excel → .xlsx, PDF → .pdf).
- **Multi-pilih**: centang beberapa dokumen sekaligus untuk diunduh atau dihapus bareng.
- Sortir per kolom (Kategori/Nama/Tanggal), filter kategori & bulan, pencarian nama.
- Halaman dibagi 10 dokumen per halaman (bukan infinite scroll).
- Mobile-friendly (tampilan kartu di HP, tabel di desktop).
- Upload otomatis dipilihkan ke akun Drive dengan sisa ruang paling banyak.

## Langkah 1 — Buat OAuth Client di Google Cloud Console

1. Buka https://console.cloud.google.com/ , buat project baru.
2. **APIs & Services > Library**, cari **Google Drive API**, klik **Enable**.
3. **Google Auth Platform > Branding**: isi App name, User support email, Developer contact.
4. **Google Auth Platform > Audience**: pilih **External**, tambahkan email
   akun-akun Drive yang mau dipakai sebagai **Test users**. Setelah semua siap
   dan sudah dites, ubah **Publishing status** jadi **"In production"** — ini
   PENTING supaya refresh token tidak expired dalam 7 hari.
5. **Google Auth Platform > Clients > Create Client**:
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/oauth-callback`
   - Simpan **Client ID** dan **Client Secret**.

## Langkah 2 — Ambil refresh token untuk tiap akun Drive

```bash
npm install
cp .env.example .env
# isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di .env

node scripts/get-refresh-token.js
```

Ikuti instruksi di terminal. Kalau muncul **"Self-test BERHASIL"**, tokennya
valid dan siap dipakai. Ulangi untuk setiap akun Google lain yang mau
ditambahkan ke pool penyimpanan.

## Langkah 3 — Deploy ke Vercel

1. Push folder ini ke repository GitHub.
2. Buka https://vercel.com , **Add New Project**, pilih repo tersebut.
3. Di **Environment Variables**, isi semua isi file `.env` kamu (ADMIN_PASSWORD,
   SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan
   DRIVE_ACCOUNT_N_REFRESH_TOKEN / DRIVE_ACCOUNT_N_LABEL untuk tiap akun).
4. Klik **Deploy**.

## Menambah akun Drive di kemudian hari

Ulangi Langkah 2 untuk akun baru, tambahkan `DRIVE_ACCOUNT_N_REFRESH_TOKEN`
(nomor berikutnya) di Environment Variables Vercel, lalu **Redeploy**.

## Menjalankan di lokal

```bash
npm install
npm run dev
```

## Catatan keamanan

- `ADMIN_PASSWORD` adalah satu-satunya penghalang ke seluruh arsip — pakai
  password kuat, jangan dibagikan.
- File tersimpan di folder `ArsipPerusahaan` di root masing-masing akun Drive
  — jangan dihapus/direname manual dari Drive langsung.
