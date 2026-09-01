import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { downloadFile } from "@/lib/driveAccounts";
import { isValidSession } from "@/lib/auth";

export const runtime = "nodejs";

type Item = { id: string; account: number };

export async function POST(req: NextRequest) {
  if (!isValidSession()) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  try {
    const { items } = (await req.json()) as { items: Item[] };
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Tidak ada file dipilih" }, { status: 400 });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const item of items) {
      const { name, data } = await downloadFile(item.account, item.id);

      let finalName = name;
      let counter = 2;
      while (usedNames.has(finalName)) {
        const dot = name.lastIndexOf(".");
        finalName = dot === -1 ? `${name} (${counter})` : `${name.slice(0, dot)} (${counter})${name.slice(dot)}`;
        counter++;
      }
      usedNames.add(finalName);

      zip.file(finalName, data);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const zipName = `arsip-${new Date().toISOString().slice(0, 10)}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Gagal menyiapkan file zip" },
      { status: 500 }
    );
  }
}
