import { NextRequest, NextResponse } from "next/server";
import { downloadFile } from "@/lib/driveAccounts";
import { isValidSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
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
    const { name, mimeType, data } = await downloadFile(accountIndex, params.fileId);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Gagal download file" },
      { status: 500 }
    );
  }
}
