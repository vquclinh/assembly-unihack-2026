"use client";

import type { Hex } from "viem";
import { uploadJson, uploadPhoto } from "./files";
import type { ConditionReport, Evidence } from "./lease";

/** One photo per default report item: walls, floor and doors, bathroom, AC and lights, furniture. */
export const SAMPLE_ITEM_PHOTOS = ["wall-clean.jpg", "floor.jpg", "bathroom.jpg", "ac.jpg", "furniture.jpg"];

/** Bundled photos in /public/demo, so a demo never waits for a camera. */
export async function sampleFile(name: string) {
  const res = await fetch(`/demo/${name}`);
  return new File([await res.blob()], name, { type: "image/jpeg" });
}

/** Uploads the sample move-in report (five items, one photo each) and returns its hash. */
export async function sampleConditionReport(leaseId: string, labels: string[], notes: string[]): Promise<Hex> {
  const names = SAMPLE_ITEM_PHOTOS;
  const items = [];
  for (let i = 0; i < names.length; i++) {
    items.push({ label: labels[i] ?? names[i], note: notes[i] ?? "", photos: [await uploadPhoto(await sampleFile(names[i]))] });
  }
  const doc: ConditionReport = { kind: "condition", v: 1, leaseId, items, createdAt: new Date().toISOString() };
  return uploadJson(doc);
}

/** Uploads sample move-out evidence for one side and returns its hash. */
export async function sampleEvidence(leaseId: string, role: "landlord" | "tenant", text: string): Promise<Hex> {
  const photo = await uploadPhoto(await sampleFile(role === "landlord" ? "wall-stain.jpg" : "wall-clean.jpg"));
  const doc: Evidence = { kind: "evidence", v: 1, leaseId, role, text, photos: [photo], createdAt: new Date().toISOString() };
  return uploadJson(doc);
}
