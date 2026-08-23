"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileJson, FileText, FileUp, ImageIcon, Paperclip, Trash2 } from "lucide-react";
import type { FileDTO } from "@/lib/files";
import { filesApi } from "@/lib/api-client";
import { Button, EmptyState, Modal, Skeleton, useToast } from "@/components/ui";

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon size={18} aria-hidden />,
  pdf: <FileText size={18} aria-hidden />,
  docx: <FileText size={18} aria-hidden />,
  text: <FileJson size={18} aria-hidden />,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesClient() {
  const { push } = useToast();
  const [files, setFiles] = useState<FileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<FileDTO | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await filesApi.list();
      setFiles(data.files);
    } catch {
      push("Could not load files.", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (list: FileList | File[]) => {
    setUploading(true);
    for (const file of Array.from(list).slice(0, 6)) {
      try {
        await filesApi.upload(file, null);
      } catch (err) {
        push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`, "error");
      }
    }
    setUploading(false);
    push("Upload complete. Attach files to any message from the composer.", "success");
    await load();
  };

  const openPreview = async (f: FileDTO) => {
    setPreview(f);
    setPreviewText(null);
    if (f.hasText) {
      try {
        const data = await filesApi.get(f.id);
        setPreviewText(data.file.textContent ?? "(no extractable text — binary or scanned PDF)");
      } catch {
        setPreviewText("Could not load extracted text.");
      }
    }
  };

  const remove = async (f: FileDTO) => {
    try {
      await filesApi.remove(f.id);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      push("File deleted.", "success");
    } catch {
      push("Could not delete file.", "error");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-surface-border px-4 sm:px-6">
        <Paperclip size={18} className="text-accent" aria-hidden />
        <h1 className="text-[15px] font-semibold text-ink-primary">Files</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver ? "border-accent bg-accent-subtle/40" : "border-surface-border bg-surface-raised"
            }`}
          >
            <FileUp size={26} className="mb-3 text-ink-tertiary" aria-hidden />
            <p className="text-[14px] font-medium text-ink-primary">Drag &amp; drop files here</p>
            <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-secondary">
              PDF, TXT, MD, CSV, JSON, DOCX and images (PNG/JPEG/GIF/WebP). Files are validated server-side by content —
              extensions alone are never trusted. Extracted text is searchable by the file_search tool.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.txt,.md,.markdown,.csv,.json,.docx,.png,.jpg,.jpeg,.gif,.webp"
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = "";
              }}
            />
            <Button className="mt-4" onClick={() => inputRef.current?.click()} loading={uploading}>
              Choose files
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : files.length === 0 ? (
            <EmptyState icon={<Paperclip size={26} aria-hidden />} title="No files yet" description="Upload a document, then attach it in the chat composer for analysis." />
          ) : (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-raised p-3.5 shadow-subtle">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                    {KIND_ICON[f.kind] ?? <FileText size={18} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink-primary">{f.filename}</p>
                    <p className="text-[11.5px] text-ink-tertiary">
                      {f.kind.toUpperCase()} · {formatSize(f.size)} · {new Date(f.createdAt).toLocaleString()} {f.hasText ? "· text extracted" : f.kind === "image" ? "· image" : "· no text"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void openPreview(f)} aria-label={`Preview ${f.filename}`}>
                    <Download size={15} aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(f)} aria-label={`Delete ${f.filename}`}>
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.filename ?? "File"} wide>
        {previewText === null ? (
          preview?.kind === "image" ? (
            <p className="text-[13px] text-ink-secondary">Image file — attach it in the chat for vision-capable models to analyze.</p>
          ) : (
            <p className="text-[13px] text-ink-secondary">No extracted text available (binary or scanned document).</p>
          )
        ) : (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-surface-border bg-surface-raised p-3.5 font-mono text-[12px] leading-relaxed text-ink-secondary">
            {previewText.slice(0, 30_000)}
          </pre>
        )}
      </Modal>
    </div>
  );
}
