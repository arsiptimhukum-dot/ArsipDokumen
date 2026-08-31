import { NextRequest, NextResponse } from "next/server";
import { deleteCategory } from "@/lib/driveAccounts";
import { isValidSession } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  if (!isValidSession()) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  try {
    const category = decodeURIComponent(params.name);
    const updated = await deleteCategory(category);
    return NextResponse.json({ ok: true, updated });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Gagal menghapus kategori" },
      { status: 500 }
    );
  }
}
