import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

/**
 * Setiap akun Google Drive dikonfigurasi lewat env var:
 *   DRIVE_ACCOUNT_1_REFRESH_TOKEN=xxx
 *   DRIVE_ACCOUNT_1_LABEL=Akun Kerja        (opsional, buat display saja)
 *   DRIVE_ACCOUNT_2_REFRESH_TOKEN=yyy
 *   ...dst, tinggal tambah nomor urut
 *
 * Semua akun berbagi 1 OAuth Client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
 * yang didaftarkan di Google Cloud Console. Lihat README.md untuk cara
 * mendapatkan refresh token tiap akun (scripts/get-refresh-token.js).
 */

export const ARCHIVE_FOLDER_NAME = "ArsipPerusahaan";
export const DEFAULT_CATEGORY = "Tanpa Kategori";
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXCEL_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const PDF_MIME_TYPE = "application/pdf";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  ...WORD_MIME_TYPES,
  ...EXCEL_MIME_TYPES,
  PDF_MIME_TYPE,
]);

export type FileKind = "word" | "excel" | "pdf";

export type DriveAccount = {
  index: number;
  label: string;
  client: drive_v3.Drive;
};

function buildOAuthClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

let cachedAccounts: DriveAccount[] | null = null;

export function getAllAccounts(): DriveAccount[] {
  if (cachedAccounts) return cachedAccounts;

  const accounts: DriveAccount[] = [];
  let i = 1;
  while (true) {
    const refreshToken = process.env[`DRIVE_ACCOUNT_${i}_REFRESH_TOKEN`];
    if (!refreshToken) break;
    const label = process.env[`DRIVE_ACCOUNT_${i}_LABEL`] || `Akun ${i}`;
    const auth = buildOAuthClient(refreshToken.trim());
    const client = google.drive({ version: "v3", auth });
    accounts.push({ index: i, label, client });
    i++;
  }

  if (accounts.length === 0) {
    throw new Error(
      "Tidak ada akun Drive yang dikonfigurasi. Set DRIVE_ACCOUNT_1_REFRESH_TOKEN dst di environment variables."
    );
  }

  cachedAccounts = accounts;
  return accounts;
}

export function getAccount(index: number): DriveAccount {
  const account = getAllAccounts().find((a) => a.index === index);
  if (!account) throw new Error(`Akun dengan index ${index} tidak ditemukan`);
  return account;
}

/** Cari (atau buat) folder arsip di root akun tersebut, return folder id */
async function ensureArchiveFolder(account: DriveAccount): Promise<string> {
  const res = await account.client.files.list({
    q: `name='${ARCHIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const folder = await account.client.files.create({
    requestBody: {
      name: ARCHIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return folder.data.id!;
}

function kindFromMimeType(mimeType: string): FileKind {
  if (mimeType === PDF_MIME_TYPE) return "pdf";
  if (mimeType === GOOGLE_SHEET_MIME || EXCEL_MIME_TYPES.has(mimeType)) return "excel";
  return "word";
}

export type ArchiveFile = {
  id: string;
  name: string;
  mimeType: string;
  kind: FileKind;
  size: string | null;
  createdTime: string;
  category: string;
  accountIndex: number;
  accountLabel: string;
};

/** Ambil daftar file dari SEMUA akun, digabung jadi satu list */
export async function listAllFiles(): Promise<ArchiveFile[]> {
  const accounts = getAllAccounts();

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const folderId = await ensureArchiveFolder(account);
        const res = await account.client.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: "files(id, name, mimeType, size, createdTime, properties)",
          orderBy: "createdTime desc",
          pageSize: 1000,
        });
        return (res.data.files || [])
          .filter((f) => !f.name?.startsWith("__preview_tmp_"))
          .map((f) => ({
            id: f.id!,
            name: f.name!,
            mimeType: f.mimeType!,
            kind: kindFromMimeType(f.mimeType!),
            size: f.size || null,
            createdTime: f.createdTime!,
            category: f.properties?.kategori || DEFAULT_CATEGORY,
            accountIndex: account.index,
            accountLabel: account.label,
          }));
      } catch (err) {
        console.error(`Gagal ambil file dari akun ${account.label}:`, err);
        return [];
      }
    })
  );

  return results
    .flat()
    .sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
}

/** Pilih akun dengan sisa kuota paling besar, untuk tempat upload berikutnya */
export async function pickAccountForUpload(): Promise<DriveAccount> {
  const accounts = getAllAccounts();

  const withQuota = await Promise.all(
    accounts.map(async (account) => {
      try {
        const about = await account.client.about.get({
          fields: "storageQuota",
        });
        const limit = Number(about.data.storageQuota?.limit || 0);
        const usage = Number(about.data.storageQuota?.usage || 0);
        const free = limit > 0 ? limit - usage : Number.MAX_SAFE_INTEGER;
        return { account, free };
      } catch (err) {
        console.error(`Gagal cek kuota akun ${account.label}:`, err);
        return { account, free: -1 };
      }
    })
  );

  withQuota.sort((a, b) => b.free - a.free);
  return withQuota[0].account;
}

export async function uploadFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  category: string
): Promise<ArchiveFile> {
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error("Hanya file Word, Excel, atau PDF yang bisa diunggah");
  }
  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error("File maksimal 5MB");
  }

  const account = await pickAccountForUpload();
  const folderId = await ensureArchiveFolder(account);
  const finalCategory = category?.trim() || DEFAULT_CATEGORY;

  // Disimpan APA ADANYA (tidak dikonversi), supaya nanti diunduh dalam
  // format asli (docx/xlsx/pdf). Konversi ke PDF cuma dilakukan saat
  // "Lihat" (preview), lewat salinan sementara — lihat previewFile().
  const res = await account.client.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      properties: { kategori: finalCategory },
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, name, mimeType, size, createdTime, properties",
  });

  return {
    id: res.data.id!,
    name: res.data.name!,
    mimeType: res.data.mimeType!,
    kind: kindFromMimeType(res.data.mimeType!),
    size: res.data.size || null,
    createdTime: res.data.createdTime!,
    category: res.data.properties?.kategori || finalCategory,
    accountIndex: account.index,
    accountLabel: account.label,
  };
}

function replaceExtension(name: string, newExt: string): string {
  const withoutExt = name.replace(/\.[^./\\]+$/, "");
  return `${withoutExt}${newExt}`;
}

/**
 * Unduh file dalam FORMAT ASLINYA:
 * - File lama yang sempat dikonversi jadi Google Docs/Sheets di-export
 *   balik jadi .docx / .xlsx.
 * - File yang disimpan apa adanya (word/excel/pdf) diunduh langsung.
 */
export async function downloadFile(accountIndex: number, fileId: string) {
  const account = getAccount(accountIndex);
  const meta = await account.client.files.get({
    fileId,
    fields: "name, mimeType",
  });

  const mimeType = meta.data.mimeType!;
  const name = meta.data.name!;

  if (mimeType === GOOGLE_DOC_MIME) {
    const res = await account.client.files.export(
      { fileId, mimeType: DOCX_MIME },
      { responseType: "arraybuffer" }
    );
    return {
      name: replaceExtension(name, ".docx"),
      mimeType: DOCX_MIME,
      data: Buffer.from(res.data as ArrayBuffer),
    };
  }

  if (mimeType === GOOGLE_SHEET_MIME) {
    const res = await account.client.files.export(
      { fileId, mimeType: XLSX_MIME },
      { responseType: "arraybuffer" }
    );
    return {
      name: replaceExtension(name, ".xlsx"),
      mimeType: XLSX_MIME,
      data: Buffer.from(res.data as ArrayBuffer),
    };
  }

  const res = await account.client.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return {
    name,
    mimeType,
    data: Buffer.from(res.data as ArrayBuffer),
  };
}

/**
 * Ambil versi PDF file ini untuk DILIHAT (preview), tanpa mengubah file
 * aslinya. Untuk file Word/Excel, dibuat salinan sementara yang dikonversi
 * ke Google Docs/Sheets, di-export ke PDF, lalu salinan sementaranya dihapus.
 */
export async function previewFile(accountIndex: number, fileId: string) {
  const account = getAccount(accountIndex);
  const meta = await account.client.files.get({
    fileId,
    fields: "name, mimeType",
  });

  const mimeType = meta.data.mimeType!;
  const name = meta.data.name!;
  const pdfName = replaceExtension(name, ".pdf");

  if (mimeType === PDF_MIME_TYPE) {
    const res = await account.client.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return { name: pdfName, data: Buffer.from(res.data as ArrayBuffer) };
  }

  if (mimeType === GOOGLE_DOC_MIME || mimeType === GOOGLE_SHEET_MIME) {
    const res = await account.client.files.export(
      { fileId, mimeType: PDF_MIME_TYPE },
      { responseType: "arraybuffer" }
    );
    return { name: pdfName, data: Buffer.from(res.data as ArrayBuffer) };
  }

  // Word/Excel biner: bikin salinan sementara yang dikonversi, export PDF, hapus lagi
  const original = await account.client.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(original.data as ArrayBuffer);

  // Cara yang BENAR di Drive API v3: bukan pakai parameter "convert" (itu
  // peninggalan API v2 dan tidak berfungsi di v3), tapi dengan menentukan
  // mimeType TUJUAN (Google Docs/Sheets) di requestBody, sementara media
  // tetap pakai mimeType ASLI file — Drive otomatis mengonversi saat upload.
  const targetMimeType = EXCEL_MIME_TYPES.has(mimeType) ? GOOGLE_SHEET_MIME : GOOGLE_DOC_MIME;
  const temp = await account.client.files.create({
    requestBody: { name: `__preview_tmp_${fileId}`, mimeType: targetMimeType },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
  });

  try {
    const pdfRes = await account.client.files.export(
      { fileId: temp.data.id!, mimeType: PDF_MIME_TYPE },
      { responseType: "arraybuffer" }
    );
    return { name: pdfName, data: Buffer.from(pdfRes.data as ArrayBuffer) };
  } finally {
    account.client.files.delete({ fileId: temp.data.id! }).catch(() => {});
  }
}

export async function deleteFile(accountIndex: number, fileId: string) {
  const account = getAccount(accountIndex);
  await account.client.files.delete({ fileId });
}

/**
 * Hapus kategori: semua file yang pakai kategori ini di-set balik ke
 * DEFAULT_CATEGORY. File-nya sendiri TIDAK dihapus, cuma label kategorinya.
 * Return jumlah file yang terpengaruh.
 */
export async function deleteCategory(category: string): Promise<number> {
  const accounts = getAllAccounts();
  const escaped = category.replace(/'/g, "\\'");
  let updatedCount = 0;

  for (const account of accounts) {
    try {
      const folderId = await ensureArchiveFolder(account);
      const res = await account.client.files.list({
        q: `'${folderId}' in parents and trashed=false and properties has { key='kategori' and value='${escaped}' }`,
        fields: "files(id)",
        pageSize: 1000,
      });

      for (const f of res.data.files || []) {
        await account.client.files.update({
          fileId: f.id!,
          requestBody: { properties: { kategori: DEFAULT_CATEGORY } },
        });
        updatedCount++;
      }
    } catch (err) {
      console.error(`Gagal hapus kategori di akun ${account.label}:`, err);
    }
  }

  return updatedCount;
}
