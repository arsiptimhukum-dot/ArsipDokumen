import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/driveAccounts";
import { isValidSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isValidSession()) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "";
    const customName = (formData.get("fileName") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Tidak ada file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const finalName = customName.trim() || file.name;

    const result = await uploadFile(
      finalName,
      file.type || "application/octet-stream",
      buffer,
      category
    );

    return NextResponse.json({ file: result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Upload gagal" },
      { status: 500 }
    );
  }
}
