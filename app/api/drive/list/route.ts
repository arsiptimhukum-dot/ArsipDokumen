import { NextResponse } from "next/server";
import { listAllFiles } from "@/lib/driveAccounts";
import { isValidSession } from "@/lib/auth";

export async function GET() {
  if (!isValidSession()) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  try {
    const files = await listAllFiles();
    return NextResponse.json({ files });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Gagal mengambil daftar file" },
      { status: 500 }
    );
  }
}
