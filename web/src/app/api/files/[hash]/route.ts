import { NextResponse } from "next/server";
import { getFile } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: "Bad hash" }, { status: 400 });
  const file = await getFile(hash);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { "content-type": file.contentType, "cache-control": "public, max-age=31536000, immutable" },
  });
}
