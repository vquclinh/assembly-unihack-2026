import { NextResponse } from "next/server";
import { keccak256 } from "viem";
import { rateLimit } from "@/lib/ratelimit";
import { putFile } from "@/lib/store";

export const runtime = "nodejs";

const MAX = 6 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/json"];

export async function POST(req: Request) {
  const limited = rateLimit(req, "files", 80, 60_000);
  if (limited) return limited;
  const contentType = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!ALLOWED.includes(contentType)) return NextResponse.json({ error: "UnsupportedType" }, { status: 415 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX) return NextResponse.json({ error: "FileTooLarge" }, { status: 413 });
  if (contentType === "application/json") {
    try {
      JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return NextResponse.json({ error: "BadJson" }, { status: 400 });
    }
  }
  const hash = keccak256(bytes);
  await putFile(hash, bytes, contentType);
  return NextResponse.json({ hash });
}
