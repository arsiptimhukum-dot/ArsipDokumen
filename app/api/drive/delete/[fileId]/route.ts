import { NextRequest, NextResponse } from "next/server";
import { deleteFile } from "@/lib/driveAccounts";
import { isValidSession } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  if (!isValidSession()) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const accountIndex = Number(req.nextUrl.searchParams.get("account"));
  if (!accountIndex) {
    return NextResponse.json({ error: "Parameter account wajib diisi" }, { status: 400 });
  }

  try {
    await deleteFile(accountIndex, params.fileId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Gagal hapus file" },
      { status: 500 }
    );
  }
}
