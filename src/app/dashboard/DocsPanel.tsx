"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileIcon,
  DownloadIcon,
  UploadIcon,
  TrashIcon,
  CloseIcon,
} from "@/components/icons";
import {
  listDocs,
  uploadDoc,
  downloadDoc,
  deleteDoc,
  humanSize,
  type DocFile,
} from "@/lib/docsClient";

export default function DocsPanel({
  isMock,
  onClose,
}: {
  isMock: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError(null);
    try {
      setFiles(await listDocs(isMock));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    setError(null);
    setBusy("upload");
    try {
      for (const f of Array.from(e.target.files)) await uploadDoc(isMock, f);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDownload(name: string) {
    setError(null);
    setBusy(name);
    try {
      await downloadDoc(isMock, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError(null);
    setBusy(name);
    try {
      await deleteDoc(isMock, name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside className="panel-in relative flex h-full w-full flex-col border-l border-surface-line bg-surface-card shadow-elevated sm:w-[42%] sm:min-w-[420px]">
        <header className="flex items-center gap-2 border-b border-surface-line px-5 py-4">
          <FileIcon className="h-5 w-5 text-brand" />
          <div>
            <h2 className="text-base font-semibold text-ink">Documents</h2>
            <p className="text-xs text-ink-subtle">Shared files — download or replace</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunk hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {loading ? (
            <p className="py-10 text-center text-sm text-ink-subtle">Loading…</p>
          ) : files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-surface-line py-10 text-center text-sm text-ink-subtle">
              No documents yet. Upload one below.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center gap-3 rounded-lg border border-surface-line bg-surface-card px-3 py-2.5"
                >
                  <FileIcon className="h-5 w-5 shrink-0 text-ink-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{f.name}</p>
                    <p className="text-xs text-ink-subtle">
                      {humanSize(f.size)}
                      {f.updatedAt &&
                        ` · ${new Date(f.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => onDownload(f.name)}
                    disabled={busy === f.name}
                    title="Download"
                    aria-label="Download"
                    className="rounded-md p-1.5 text-ink-subtle transition hover:bg-surface-sunk hover:text-ink disabled:opacity-50"
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(f.name)}
                    disabled={busy === f.name}
                    title="Delete"
                    aria-label="Delete"
                    className="rounded-md p-1.5 text-ink-subtle transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-surface-line px-5 py-4">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === "upload"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            <UploadIcon className="h-4 w-4" />
            {busy === "upload" ? "Uploading…" : "Upload file"}
          </button>
          <p className="mt-2 text-center text-xs text-ink-subtle">
            Uploading a file with the same name replaces it.
          </p>
          <input ref={fileRef} type="file" multiple onChange={onUpload} className="hidden" />
        </footer>
      </aside>
    </div>
  );
}
