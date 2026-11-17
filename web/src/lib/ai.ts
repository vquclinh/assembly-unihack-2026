import "server-only";
import type { Hex } from "viem";
import type { AiReport, ConditionReport, Evidence } from "./lease";
import { getFile } from "./store";

/**
 * AI damage assessment: compares the move-in photo report with the move-out evidence.
 * Uses any OpenAI-compatible vision model through OpenRouter (default: Gemini Flash Lite, with fallbacks).
 */

/** Cheap vision models, tried in order. OpenRouter retires models from time to time, so one going away doesn't break reports. */
const DEFAULT_MODELS = ["google/gemini-2.5-flash-lite", "google/gemini-2.0-flash-001", "openai/gpt-4o-mini"];
/** OPENROUTER_MODEL may list several models, comma-separated; the defaults are tried after them. */
const MODELS = [...new Set([...(process.env.OPENROUTER_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean), ...DEFAULT_MODELS])];
export const AI_MODEL = MODELS[0];
/** Errors that mean "this model can't be used right now", as opposed to a bad key or no credit. */
const MODEL_GONE = /no (allowed )?providers?|not a valid model|no endpoints|model.*(not found|unavailable|deprecated)|no longer available/i;
const MAX_IMAGES = 8;

export function aiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY) || process.env.AI_MOCK === "1";
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

async function imagePart(hash: Hex): Promise<Part | null> {
  const f = await getFile(hash);
  if (!f) return null;
  return { type: "image_url", image_url: { url: `data:${f.contentType};base64,${f.bytes.toString("base64")}` } };
}

const SYSTEM = `You are a neutral rental inspector helping a mediator settle a deposit dispute between a landlord and a student tenant.
You compare MOVE-IN photos (signed by both sides when the tenant moved in) with MOVE-OUT photos submitted later.
Rules:
- Only describe what is visible. Never invent damage. If photos do not show the same area, say so.
- Normal wear and tear (light scuffs, faded paint after months of use) is not the tenant's responsibility.
- Damage that is already visible in the move-in photos is pre-existing.
- Suggest what share (0-100) of the CONTESTED amount should go to the landlord, and be conservative when unsure.
Reply with JSON only, no markdown, using exactly this shape:
{"summary": string, "findings": [{"area": string, "observation": string, "preExisting": "yes"|"no"|"unclear", "severity": "none"|"minor"|"moderate"|"major"}], "suggestedDeductionPct": number, "confidence": "low"|"medium"|"high", "caveats": string}`;

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AiBadOutput");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);

type Inputs = {
  leaseId: string;
  condition: ConditionReport;
  landlord: Evidence;
  tenant: Evidence | null;
  contestedUsdc: string;
  lang: "en" | "vi";
};

export async function assessDamage(i: Inputs): Promise<Omit<AiReport, "kind" | "v" | "leaseId" | "inputs" | "payment" | "createdAt">> {
  if (process.env.AI_MOCK === "1") {
    // Test-only path for automated runs without an API key. Clearly labelled, never used in production.
    return {
      model: "mock (test only)",
      summary: "[TEST MOCK] The move-out wall photo shows a brown stain that is not visible in the move-in photo of the same wall.",
      findings: [{ area: "Wall", observation: "[TEST MOCK] New stain next to the switch", preExisting: "no", severity: "minor" }],
      suggestedDeductionPct: 40,
      confidence: "low",
      caveats: "Mock output for automated tests.",
    };
  }

  const parts: Part[] = [];
  let images = 0;
  parts.push({
    type: "text",
    text: `Lease #${i.leaseId}. Contested amount: ${i.contestedUsdc} USDC. Write all text fields in ${i.lang === "vi" ? "Vietnamese" : "English"}.`,
  });
  for (const item of i.condition.items) {
    parts.push({ type: "text", text: `MOVE-IN — ${item.label}${item.note ? `: ${item.note}` : ""}` });
    for (const h of item.photos) {
      if (images >= MAX_IMAGES - 2) break;
      const p = await imagePart(h);
      if (p) {
        parts.push(p);
        images++;
      }
    }
  }
  parts.push({ type: "text", text: `MOVE-OUT, LANDLORD'S CLAIM: ${i.landlord.text || "(no text)"}` });
  for (const h of i.landlord.photos) {
    if (images >= MAX_IMAGES) break;
    const p = await imagePart(h);
    if (p) {
      parts.push(p);
      images++;
    }
  }
  if (i.tenant) {
    parts.push({ type: "text", text: `TENANT'S RESPONSE: ${i.tenant.text || "(no text)"}` });
    for (const h of i.tenant.photos) {
      if (images >= MAX_IMAGES) break;
      const p = await imagePart(h);
      if (p) {
        parts.push(p);
        images++;
      }
    }
  }

  let model = "";
  let content = "";
  for (let i = 0; i < MODELS.length; i++) {
    model = MODELS[i];
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        "x-title": "Coc deposit escrow",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: parts },
        ],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (res.ok && !json.error) {
      content = json.choices?.[0]?.message?.content ?? "";
      break;
    }
    const message = json.error?.message ?? "request failed";
    const gone = res.status === 404 || MODEL_GONE.test(message);
    if (!gone || i === MODELS.length - 1) throw new Error(`OpenRouter ${res.status}: ${message}`);
    console.warn(`[ai] ${model} unavailable (${message.slice(0, 100)}), trying ${MODELS[i + 1]}`);
  }
  let out: Record<string, unknown>;
  try {
    out = extractJson(content);
  } catch {
    throw new Error(`${model} did not return valid JSON: ${content.slice(0, 120) || "(empty)"}`);
  }

  const findings = Array.isArray(out.findings) ? out.findings : [];
  return {
    model,
    summary: String(out.summary ?? "").slice(0, 1200),
    findings: findings.slice(0, 12).map((f) => {
      const x = f as Record<string, unknown>;
      return {
        area: String(x.area ?? "").slice(0, 80),
        observation: String(x.observation ?? "").slice(0, 400),
        preExisting: oneOf(x.preExisting, ["yes", "no", "unclear"] as const, "unclear"),
        severity: oneOf(x.severity, ["none", "minor", "moderate", "major"] as const, "minor"),
      };
    }),
    suggestedDeductionPct: Math.max(0, Math.min(100, Math.round(Number(out.suggestedDeductionPct) || 0))),
    confidence: oneOf(out.confidence, ["low", "medium", "high"] as const, "low"),
    caveats: String(out.caveats ?? "").slice(0, 600),
  };
}
