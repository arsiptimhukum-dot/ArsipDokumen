/**
 * Jalankan script ini SEKALI per akun Google yang mau dipakai sebagai storage.
 *
 * Cara pakai:
 *   1. npm install
 *   2. Set GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di file .env (lihat .env.example)
 *   3. node scripts/get-refresh-token.js
 *   4. Buka link yang muncul, login dengan akun Google yang mau dipakai
 *   5. Setelah izin diberikan, browser akan redirect ke localhost dan gagal
 *      (itu normal) — salin kode "code=" dari address bar browser, atau
 *      copot dari URL yang gagal tsb, lalu tempel di terminal saat diminta
 *   6. Refresh token akan muncul di terminal — simpan sebagai
 *      DRIVE_ACCOUNT_N_REFRESH_TOKEN di environment variables Vercel
 *   7. Ulangi untuk setiap akun Google lain yang mau ditambahkan ke pool
 */

require("dotenv").config();
const { google } = require("googleapis");
const readline = require("readline");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/oauth-callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Set dulu GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di file .env"
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // wajib, supaya selalu dapat refresh_token baru
  scope: ["https://www.googleapis.com/auth/drive"],
});

console.log("\nBuka link berikut, lalu login dengan akun Google yang ingin dipakai:\n");
console.log(authUrl);
console.log("\nSetelah menyetujui izin, kamu akan diarahkan ke halaman error (localhost).");
console.log("Itu wajar — salin nilai parameter 'code' dari URL di address bar browser.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Tempel kode di sini: ", async (rawCode) => {
  rl.close();

  // Jaga-jaga kalau yang ditempel adalah seluruh URL, bukan cuma kodenya
  let code = rawCode.trim();
  const codeMatch = code.match(/[?&]code=([^&\s]+)/);
  if (codeMatch) {
    code = decodeURIComponent(codeMatch[1]);
    console.log("(Terdeteksi kamu menempel URL lengkap, kode sudah diekstrak otomatis)");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error(
        "\nTidak ada refresh_token yang dikembalikan Google. Ini biasanya karena akun ini " +
        "sudah pernah kasih izin sebelumnya. Cabut dulu aksesnya di " +
        "https://myaccount.google.com/permissions (cari nama app-mu), baru jalankan script ini lagi."
      );
      return;
    }

    console.log("\nToken didapat, sedang diuji langsung ke Google Drive...");

    // SELF-TEST: langsung coba pakai token ini persis seperti yang dilakukan aplikasi,
    // pakai OAuth2Client baru supaya benar-benar menguji refresh_token-nya, bukan access_token sesaat.
    const testClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    testClient.setCredentials({ refresh_token: tokens.refresh_token });
    const drive = google.drive({ version: "v3", auth: testClient });

    try {
      const about = await drive.about.get({ fields: "user" });
      console.log(`Self-test BERHASIL — token ini valid untuk akun: ${about.data.user.emailAddress}\n`);
    } catch (testErr) {
      console.error("\nSelf-test GAGAL — token ini TIDAK bisa dipakai ulang:");
      console.error(testErr.response?.data || testErr.message);
      console.error(
        "\nKalau ini muncul, masalahnya BUKAN di file .env kamu, tapi di sisi Google Cloud Console " +
        "(kemungkinan Client ID/Secret di .env tidak sama dengan yang aktif di Console, atau app " +
        "perlu di-cek ulang di Audience > Test users)."
      );
      return;
    }

    console.log("Simpan baris berikut ke .env atau environment variable Vercel:\n");
    console.log(`DRIVE_ACCOUNT_N_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\n(Ganti N dengan nomor urut akun, mulai dari 1, dan jangan sampai bentrok dengan akun lain)");
  } catch (err) {
    console.error("Gagal menukar kode dengan token:", err.response?.data || err.message);
  }
});
