"use client";

import { createClient } from "./supabase/browser";

export const DOCS_BUCKET = "docs";

export interface DocFile {
  name: string;
  size: number;
  updatedAt: string | null;
}

// ---------- mock store (no Supabase) ----------
const g = globalThis as unknown as {
  __mockDocs?: { name: string; content: string; updatedAt: string }[];
};
if (!g.__mockDocs) {
  g.__mockDocs = [
    {
      name: "PRODUCT.md",
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      content:
        "# Reputr — Product Overview\n\nReputr helps local businesses collect, monitor, and respond to online reviews.\n\n## Core value\n- Automated review requests over SMS + email\n- Real-time alerts on new reviews\n- AI-assisted reply drafts\n",
    },
    {
      name: "BRAND_VOICE.md",
      updatedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      content:
        "# Brand Voice\n\nConfident, helpful, no jargon. Speak to owners, not marketers. Short sentences.\n",
    },
    {
      name: "ICP.md",
      updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      content:
        "# Ideal Customer Profile\n\nMulti-location local service businesses (dental, med-spa, home services) with 3–50 locations.\n",
    },
  ];
}
function bytes(s: string) {
  return new Blob([s]).size;
}

// ---------- public API (branches on isMock) ----------

export async function listDocs(isMock: boolean): Promise<DocFile[]> {
  if (isMock) {
    return g.__mockDocs!.map((d) => ({
      name: d.name,
      size: bytes(d.content),
      updatedAt: d.updatedAt,
    }));
  }
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).list("", {
    limit: 200,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((o) => o.name && o.id !== null) // skip folder placeholders
    .map((o) => ({
      name: o.name,
      size: (o.metadata as { size?: number } | null)?.size ?? 0,
      updatedAt: o.updated_at ?? o.created_at ?? null,
    }));
}

// Upsert: replaces the object if a file with the same name already exists.
export async function uploadDoc(isMock: boolean, file: File): Promise<void> {
  if (isMock) {
    const content = await file.text();
    const i = g.__mockDocs!.findIndex((d) => d.name === file.name);
    const entry = { name: file.name, content, updatedAt: new Date().toISOString() };
    if (i === -1) g.__mockDocs!.push(entry);
    else g.__mockDocs![i] = entry;
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(file.name, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
}

export async function downloadDoc(isMock: boolean, name: string): Promise<void> {
  let blob: Blob;
  if (isMock) {
    const d = g.__mockDocs!.find((x) => x.name === name);
    blob = new Blob([d?.content ?? ""], { type: "text/plain" });
  } else {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).download(name);
    if (error) throw new Error(error.message);
    blob = data;
  }
  triggerDownload(blob, name);
}

export async function deleteDoc(isMock: boolean, name: string): Promise<void> {
  if (isMock) {
    g.__mockDocs = g.__mockDocs!.filter((d) => d.name !== name);
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.storage.from(DOCS_BUCKET).remove([name]);
  if (error) throw new Error(error.message);
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function humanSize(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
