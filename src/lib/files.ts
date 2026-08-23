import { config } from "./env";
import { all, get, run, nowMs } from "./db";
import { log } from "./logger";

/**
 * File processing. Validation happens server-side on every upload:
 * size limit + magic-byte sniffing (file extensions are never trusted).
 */

export type FileDTO = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  kind: "text" | "image" | "pdf" | "docx" | "other";
  hasText: boolean;
  conversationId: string | null;
  createdAt: number;
};

export const ALLOWED_KINDS: Record<string, { mime: string; kind: FileDTO["kind"] }> = {
  "application/pdf": { mime: "application/pdf", kind: "pdf" },
  "text/plain": { mime: "text/plain", kind: "text" },
  "text/markdown": { mime: "text/markdown", kind: "text" },
  "text/csv": { mime: "text/csv", kind: "text" },
  "application/json": { mime: "application/json", kind: "text" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
  },
  "image/png": { mime: "image/png", kind: "image" },
  "image/jpeg": { mime: "image/jpeg", kind: "image" },
  "image/gif": { mime: "image/gif", kind: "image" },
  "image/webp": { mime: "image/webp", kind: "image" },
};

export function sniffKind(buf: Buffer, declaredMime: string, filename: string): FileDTO["kind"] | null {
  // magic bytes first — extensions are hints only
  if (buf.length > 4 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length > 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image"; // png
  if (buf.length > 3 && buf.subarray(0, 3).toString("hex") === "ffd8ff") return "image"; // jpeg
  if (buf.length > 6 && (buf.subarray(0, 6).toString("hex") === "474946383761" || buf.subarray(0, 6).toString("hex") === "474946383961")) return "image"; // gif
  if (buf.length > 12 && buf.subarray(0, 4).toString("hex") === "52494646" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image"; // webp
  if (buf.length > 4 && buf.subarray(0, 4).toString("hex") === "504b0304") {
    // zip container — docx if it is a word document (declared or by extension)
    const norm = filename.toLowerCase();
    if (declaredMime.includes("wordprocessingml") || norm.endsWith(".docx")) return "docx";
    return null;
  }
  // text-ish: check declared mime or scan for binary bytes
  const declaredText = declaredMime.startsWith("text/") || declaredMime === "application/json";
  if (declaredText && isProbablyText(buf)) return "text";
  const norm = filename.toLowerCase();
  if (/\.(txt|md|markdown|csv|json|log)$/.test(norm) && isProbablyText(buf)) return "text";
  return null;
}

function isProbablyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4_096));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32) && b !== 27) suspicious++;
  }
  return suspicious / Math.max(1, sample.length) < 0.05;
}

export function rowToFileDTO(r: Record<string, unknown>): FileDTO {
  return {
    id: String(r.id),
    filename: String(r.filename),
    mime: String(r.mime),
    size: Number(r.size),
    kind: r.kind as FileDTO["kind"],
    hasText: r.text_content != null,
    conversationId: r.conversation_id ? String(r.conversation_id) : null,
    createdAt: Number(r.created_at),
  };
}

export function listFiles(userId: string): FileDTO[] {
  return all("SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC LIMIT 200", userId).map(rowToFileDTO);
}

export function getFileRow(userId: string, fileId: string) {
  return get("SELECT * FROM files WHERE id = ? AND user_id = ?", fileId, userId);
}

export function deleteFile(userId: string, fileId: string): boolean {
  const row = getFileRow(userId, fileId);
  if (!row) return false;
  run("DELETE FROM files WHERE id = ? AND user_id = ?", fileId, userId);
  return true;
}

/* ─── text extraction ───────────────────────────────────────────────────── */

export async function extractText(kind: FileDTO["kind"], buf: Buffer): Promise<string> {
  try {
    if (kind === "text") return normalizeText(buf.toString("utf8"));
    if (kind === "pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      let text = "";
      const pages = Math.min(doc.numPages, 200);
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
      }
      try {
        await doc.cleanup();
      } catch { /* optional */ }
      return normalizeText(text);
    }
    if (kind === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      return normalizeText(result.value);
    }
    return "";
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "text extraction failed");
    return "";
  }
}

function normalizeText(text: string): string {
  const cleaned = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.slice(0, config.uploads.maxTextChars);
}

/* ─── upload processing ─────────────────────────────────────────────────── */

export type UploadResult =
  | { ok: true; file: FileDTO }
  | { ok: false; error: string; status: number };

export async function processUpload(
  userId: string,
  file: File,
  conversationId: string | null
): Promise<UploadResult> {
  const maxBytes = config.uploads.maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${config.uploads.maxMb} MB.`,
    };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return { ok: false, status: 415, error: "File is empty." };
  const kind = sniffKind(buf, file.type || "", file.name);
  if (!kind) {
    return {
      ok: false,
      status: 415,
      error: "Unsupported file type. Allowed: PDF, TXT, MD, CSV, JSON, DOCX, PNG, JPEG, GIF, WebP (validated by content, not extension).",
    };
  }
  const mime = kind === "image" ? imageMime(buf, file.type) : kindMime(kind);
  let textContent: string | null = null;
  let dataB64: string | null = null;
  if (kind === "image") {
    dataB64 = buf.toString("base64");
  } else {
    textContent = await extractText(kind, buf);
  }
  const id = crypto.randomUUID();
  run(
    "INSERT INTO files (id, user_id, conversation_id, filename, mime, size, kind, text_content, data_b64, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id,
    userId,
    conversationId,
    file.name.slice(0, 200),
    mime,
    buf.length,
    kind,
    textContent,
    dataB64,
    nowMs()
  );
  const dto = rowToFileDTO(get("SELECT * FROM files WHERE id = ?", id)!);
  if (kind !== "image" && !textContent) {
    return { ok: true, file: { ...dto, hasText: false } };
  }
  return { ok: true, file: dto };
}

function kindMime(kind: FileDTO["kind"]): string {
  const entry = Object.entries(ALLOWED_KINDS).find(([, v]) => v.kind === kind);
  return entry ? entry[0] : "application/octet-stream";
}

function imageMime(buf: Buffer, declared: string): string {
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (buf.subarray(0, 4).toString("hex") === "52494646") return "image/webp";
  return declared;
}
