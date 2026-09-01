"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  Trash2,
  LogOut,
  Search,
  ArrowUpDown,
  Download,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type FileKind = "word" | "excel" | "pdf";

type ArchiveFile = {
  id: string;
  name: string;
  mimeType: string;
  kind: FileKind;
  size: string | null;
  createdTime: string;
  category: string;
  accountIndex: number;
  accountLabel: string;
};

type PendingFile = {
  file: File;
  name: string;
};

type SortField = "category" | "name" | "date";
type SortDir = "asc" | "desc";
type ConflictAction = "overwrite" | "rename" | "skip";

const PAGE_SIZE = 10;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

const ACCEPTED_EXTENSIONS = ".doc,.docx,.pdf,.xls,.xlsx";
const ACCEPTED_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const CATEGORY_COLOR_VARS = ["--cat-0", "--cat-1", "--cat-2", "--cat-3", "--cat-4", "--cat-5"];
const DEFAULT_CATEGORY = "Tanpa Kategori";

const SORT_OPTIONS: { value: string; label: string; field: SortField; dir: SortDir }[] = [
  { value: "category-asc", label: "Kategori (A-Z)", field: "category", dir: "asc" },
  { value: "category-desc", label: "Kategori (Z-A)", field: "category", dir: "desc" },
  { value: "name-asc", label: "Nama (A-Z)", field: "name", dir: "asc" },
  { value: "name-desc", label: "Nama (Z-A)", field: "name", dir: "desc" },
  { value: "date-desc", label: "Tanggal (Terbaru)", field: "date", dir: "desc" },
  { value: "date-asc", label: "Tanggal (Terlama)", field: "date", dir: "asc" },
];

function categoryColorVar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % CATEGORY_COLOR_VARS.length;
  }
  return `var(${CATEGORY_COLOR_VARS[Math.abs(hash)]})`;
}

function downloadLabel(kind: FileKind): string {
  if (kind === "word") return "DOCX";
  if (kind === "excel") return "XLSX";
  return "PDF";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CategoryPill({ category }: { category: string }) {
  const color = categoryColorVar(category);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "3px 10px 3px 8px",
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 12%, white)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, white)`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {category}
    </span>
  );
}

export default function HomePage() {
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Semua");
  const [monthFilter, setMonthFilter] = useState("Semua");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sortField, setSortField] = useState<SortField>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [bulkBusy, setBulkBusy] = useState<"download" | "delete" | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");

  const [conflict, setConflict] = useState<{ pendingIndex: number; existingFile: ArchiveFile } | null>(null);
  const conflictResolveRef = useRef<((action: ConflictAction) => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/drive/list");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setFiles(data.files);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setPage(1);
  }, [query, categoryFilter, monthFilter, sortField, sortDir]);

  const existingCategories = useMemo(() => {
    const set = new Set(files.map((f) => f.category));
    return Array.from(set).sort();
  }, [files]);

  const existingMonths = useMemo(() => {
    const map = new Map<string, string>();
    files.forEach((f) => {
      const d = new Date(f.createdTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      map.set(key, label);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, label]) => ({ key, label }));
  }, [files]);

  function monthKeyOf(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function pickFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);

    const invalidType = arr.find((f) => !ACCEPTED_MIME_TYPES.has(f.type));
    if (invalidType) {
      setError(`"${invalidType.name}" bukan file Word, Excel, atau PDF yang didukung.`);
      return;
    }

    const tooBig = arr.find((f) => f.size > MAX_UPLOAD_SIZE);
    if (tooBig) {
      setError(`"${tooBig.name}" melebihi ukuran maksimal 5MB.`);
      return;
    }

    setError("");
    setPendingFiles(arr.map((file) => ({ file, name: file.name })));
    setSelectedCategory(existingCategories[0] || "");
    setNewCategoryInput("");
  }

  function updatePendingName(index: number, name: string) {
    setPendingFiles((prev) =>
      prev ? prev.map((p, i) => (i === index ? { ...p, name } : p)) : prev
    );
  }

  function closeModal() {
    setPendingFiles(null);
    setSelectedCategory("");
    setNewCategoryInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function waitForConflictResolution(pendingIndex: number, existingFile: ArchiveFile): Promise<ConflictAction> {
    return new Promise((resolve) => {
      setConflict({ pendingIndex, existingFile });
      conflictResolveRef.current = resolve;
    });
  }

  function resolveConflict(action: ConflictAction) {
    setConflict(null);
    conflictResolveRef.current?.(action);
    conflictResolveRef.current = null;
  }

  async function confirmUpload() {
    if (!pendingFiles) return;
    const category = newCategoryInput.trim() || selectedCategory || "Tanpa Kategori";

    setUploading(true);
    setError("");

    let workingFiles = [...files];
    const remainingPending: PendingFile[] = [];

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const { file, name } = pendingFiles[i];
        const finalName = name.trim() || file.name;

        const dupe = workingFiles.find((f) => f.name.toLowerCase() === finalName.toLowerCase());
        if (dupe) {
          const action = await waitForConflictResolution(i, dupe);
          if (action === "overwrite") {
            const res = await fetch(`/api/drive/delete/${dupe.id}?account=${dupe.accountIndex}`, {
              method: "DELETE",
            });
            if (res.status === 401) {
              router.push("/login");
              return;
            }
            workingFiles = workingFiles.filter((f) => f.id !== dupe.id);
          } else if (action === "skip") {
            continue;
          } else if (action === "rename") {
            // hentikan proses di sini, sisakan file ini + sisanya supaya
            // pengguna bisa edit nama lalu klik "Unggah" lagi
            remainingPending.push(...pendingFiles.slice(i));
            break;
          }
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", finalName);
        formData.append("category", category);
        const res = await fetch("/api/drive/upload", {
          method: "POST",
          body: formData,
        });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Gagal unggah ${file.name}`);
      }

      if (remainingPending.length > 0) {
        setPendingFiles(remainingPending);
      } else {
        closeModal();
      }
      await loadFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(f: ArchiveFile) {
    if (!confirm(`Hapus "${f.name}" dari arsip? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingIds((prev) => new Set(prev).add(f.id));
    try {
      const res = await fetch(`/api/drive/delete/${f.id}?account=${f.accountIndex}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(f.id);
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(f.id);
        return next;
      });
    }
  }

  async function handleDeleteCategory(category: string) {
    if (
      !confirm(
        `Hapus kategori "${category}"? Dokumen yang pakai kategori ini akan otomatis jadi "Tanpa Kategori" (dokumennya sendiri tidak terhapus).`
      )
    )
      return;
    try {
      const res = await fetch(`/api/drive/category/${encodeURIComponent(category)}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus kategori");
      if (selectedCategory === category) setSelectedCategory("");
      await loadFiles();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const filtered = files.filter((f) => {
    const matchQuery = f.name.toLowerCase().includes(query.toLowerCase());
    const matchCategory = categoryFilter === "Semua" || f.category === categoryFilter;
    const matchMonth = monthFilter === "Semua" || monthKeyOf(f.createdTime) === monthFilter;
    return matchQuery && matchCategory && matchMonth;
  });

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortField === "category") {
        cmp = a.category.localeCompare(b.category, "id");
        if (cmp === 0) cmp = a.name.localeCompare(b.name, "id");
      } else if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "id");
      } else {
        cmp = new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const pageItems: (number | "ellipsis")[] = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const items: (number | "ellipsis")[] = [1];
    if (currentPage > 3) items.push("ellipsis");
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
      items.push(p);
    }
    if (currentPage < totalPages - 2) items.push("ellipsis");
    items.push(totalPages);
    return items;
  }, [totalPages, currentPage]);

  function goToPage(p: number) {
    setPage(Math.min(totalPages, Math.max(1, p)));
  }

  function submitJump(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n)) goToPage(n);
    setJumpOpen(false);
    setJumpValue("");
  }

  const allCategories = ["Semua", ...existingCategories];
  const allOnPageSelected = paged.length > 0 && paged.every((f) => selected.has(f.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        paged.forEach((f) => next.delete(f.id));
      } else {
        paged.forEach((f) => next.add(f.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleBulkDownload() {
    const list = sorted.filter((f) => selected.has(f.id));
    if (list.length === 0) return;

    setBulkBusy("download");
    setError("");
    try {
      const res = await fetch("/api/drive/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: list.map((f) => ({ id: f.id, account: f.accountIndex })),
        }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal menyiapkan file unduhan");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arsip-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkDelete() {
    const list = sorted.filter((f) => selected.has(f.id));
    if (list.length === 0) return;
    if (!confirm(`Hapus ${list.length} dokumen yang dipilih? Tindakan ini tidak bisa dibatalkan.`)) return;

    setBulkBusy("delete");
    setError("");
    try {
      for (const f of list) {
        const res = await fetch(`/api/drive/delete/${f.id}?account=${f.accountIndex}`, {
          method: "DELETE",
        });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
      }
      clearSelection();
      await loadFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkBusy(null);
    }
  }

  const currentSortValue = `${sortField}-${sortDir}`;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 80px" }}>
      <header
        className="header-actions"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 22,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: "var(--accent)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 700 }}>Arsip Tim Hukum</h1>
            <p style={{ margin: "1px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
              {files.length} dokumen tersimpan
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            padding: "9px 14px",
            fontSize: 13,
            color: "var(--ink-soft)",
            whiteSpace: "nowrap",
          }}
        >
          <LogOut size={14} /> Keluar
        </button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        hidden
        onChange={(e) => pickFiles(e.target.files)}
      />

      <div
        className={`dropzone${dragOver ? " drag-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFiles(e.dataTransfer.files);
        }}
        style={{ marginBottom: 18 }}
      >
        <div className="dropzone-icon">
          <UploadCloud size={22} />
        </div>
        <div className="dropzone-text">
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Seret dokumen ke sini</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>
            Format .doc, .docx, .xls, .xlsx, atau .pdf — maksimal 5MB per file
          </p>
        </div>
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={15} /> Pilih file
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search
            size={15}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}
          />
          <input
            type="text"
            placeholder="Cari nama dokumen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px 9px 34px",
              fontSize: 13,
              borderRadius: 9,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            fontSize: 13,
            borderRadius: 9,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            fontSize: 13,
            borderRadius: 9,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <option value="Semua">Semua bulan</option>
          {existingMonths.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <ArrowUpDown size={14} style={{ color: "var(--ink-soft)", flexShrink: 0 }} />
        <select
          value={currentSortValue}
          onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
            if (opt) {
              setSortField(opt.field);
              setSortDir(opt.dir);
            }
          }}
          style={{
            padding: "8px 12px",
            fontSize: 12,
            borderRadius: 9,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Urutkan: {o.label}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            background: "var(--selected)",
            border: `1px solid var(--selected-border)`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} dokumen dipilih</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleBulkDownload}
              disabled={bulkBusy !== null}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {bulkBusy === "download" ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
              {bulkBusy === "download" ? "Menyiapkan..." : "Unduh"}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy !== null}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {bulkBusy === "delete" ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
              {bulkBusy === "delete" ? "Menghapus..." : "Hapus"}
            </button>
            <button
              onClick={clearSelection}
              disabled={bulkBusy !== null}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                color: "var(--ink-soft)",
              }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={14} className="spin" /> Memuat arsip...
        </p>
      ) : sorted.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
          }}
        >
          <FileText size={28} style={{ color: "var(--ink-soft)", opacity: 0.5, marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
            {query || categoryFilter !== "Semua" || monthFilter !== "Semua"
              ? "Tidak ada dokumen yang cocok."
              : "Arsip masih kosong. Unggah dokumen pertama."}
          </p>
        </div>
      ) : (
        <>
          {/* TABEL - tampil di layar lebar */}
          <div
            className="desktop-table"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(20,24,31,0.04)",
            }}
          >
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--row-alt)", borderBottom: "1px solid var(--border)" }}>
                  <th style={thStyle("36px")}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                    />
                  </th>
                  <th style={thStyle("170px")}>Kategori</th>
                  <th style={thStyle()}>Nama</th>
                  <th style={thStyle("120px")}>Tanggal</th>
                  <th style={thStyle("140px")}>Aksi</th>
                  <th style={thStyle("40px")}></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((f, i) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: selected.has(f.id) ? "var(--selected)" : i % 2 === 1 ? "var(--row-alt)" : "transparent",
                    }}
                  >
                    <td style={tdStyle()}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggleSelect(f.id)}
                      />
                    </td>
                    <td style={tdStyle()}>
                      <CategoryPill category={f.category} />
                    </td>
                    <td style={tdStyle()}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                        <FileText size={14} style={{ color: "var(--ink-soft)", flexShrink: 0 }} />
                        {f.name}
                      </span>
                    </td>
                    <td style={tdStyle()} className="mono">
                      {formatDate(f.createdTime)}
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <a
                          href={`/api/drive/preview/${f.id}?account=${f.accountIndex}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", textDecoration: "none" }}
                        >
                          <Eye size={13} /> Lihat
                        </a>
                        <a
                          href={`/api/drive/download/${f.id}?account=${f.accountIndex}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                        >
                          <Download size={13} /> {downloadLabel(f.kind)}
                        </a>
                      </div>
                    </td>
                    <td style={tdStyle()}>
                      <button
                        onClick={() => handleDelete(f)}
                        disabled={deletingIds.has(f.id)}
                        title="Hapus"
                        style={{ background: "none", border: "none", color: "var(--ink-soft)", padding: 4 }}
                      >
                        {deletingIds.has(f.id) ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* KARTU - tampil di HP */}
          <div className="mobile-cards" style={{ flexDirection: "column", gap: 10 }}>
            {paged.map((f) => (
              <div
                key={f.id}
                style={{
                  background: selected.has(f.id) ? "var(--selected)" : "var(--surface)",
                  border: `1px solid ${selected.has(f.id) ? "var(--selected-border)" : "var(--border)"}`,
                  borderRadius: 12,
                  padding: "14px",
                  boxShadow: "0 1px 2px rgba(20,24,31,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggleSelect(f.id)}
                      style={{ marginTop: 3 }}
                    />
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{f.name}</p>
                  </span>
                  <button
                    onClick={() => handleDelete(f)}
                    disabled={deletingIds.has(f.id)}
                    style={{ background: "none", border: "none", color: "var(--ink-soft)", padding: 0 }}
                  >
                    {deletingIds.has(f.id) ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <CategoryPill category={f.category} />
                  <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {formatDate(f.createdTime)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <a
                    href={`/api/drive/preview/${f.id}?account=${f.accountIndex}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink)",
                      background: "var(--row-alt)",
                      border: "1px solid var(--border)",
                      padding: "7px 12px",
                      borderRadius: 8,
                      textDecoration: "none",
                    }}
                  >
                    <Eye size={13} /> Lihat
                  </a>
                  <a
                    href={`/api/drive/download/${f.id}?account=${f.accountIndex}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#fff",
                      background: "var(--accent)",
                      padding: "7px 12px",
                      borderRadius: 8,
                      textDecoration: "none",
                    }}
                  >
                    <Download size={13} /> {downloadLabel(f.kind)}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, flexWrap: "wrap" }}>
              <button
                className="pagination-btn"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Sebelumnya"
              >
                <ChevronLeft size={14} />
              </button>

              {pageItems.map((item, i) =>
                item === "ellipsis" ? (
                  <button
                    key={`e-${i}`}
                    className="pagination-btn"
                    onClick={() => setJumpOpen((v) => !v)}
                    title="Lompat ke halaman"
                  >
                    …
                  </button>
                ) : (
                  <button
                    key={item}
                    className={`pagination-btn${item === currentPage ? " active" : ""}`}
                    onClick={() => goToPage(item)}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                className="pagination-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="Berikutnya"
              >
                <ChevronRight size={14} />
              </button>

              {jumpOpen && (
                <form
                  onSubmit={submitJump}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 9,
                    padding: "6px 8px",
                    boxShadow: "0 8px 24px rgba(20,24,31,0.12)",
                    zIndex: 10,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Ke halaman</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    autoFocus
                    value={jumpValue}
                    onChange={(e) => setJumpValue(e.target.value)}
                    style={{ width: 56, padding: "5px 6px", fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }}
                  />
                  <button
                    type="submit"
                    style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600 }}
                  >
                    Ke
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL UPLOAD */}
      {pendingFiles && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,24,31,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
            overflowY: "auto",
          }}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              padding: 24,
              width: 420,
              maxWidth: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(20,24,31,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
                Unggah {pendingFiles.length > 1 ? `${pendingFiles.length} dokumen` : "dokumen"}
              </h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", color: "var(--ink-soft)" }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 16px" }}>
              Kamu bisa ganti nama tiap dokumen sebelum disimpan
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {pendingFiles.map((p, i) => (
                <div key={i}>
                  <label style={{ display: "block", fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                    File {i + 1}: {p.file.name} ({formatSize(p.file.size)})
                  </label>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updatePendingName(i, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>
              ))}
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Kategori
            </label>

            {existingCategories.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {existingCategories.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 6px 5px 10px",
                      fontSize: 12,
                      borderRadius: 999,
                      border: `1px solid ${selectedCategory === c && !newCategoryInput ? "var(--accent)" : "var(--border)"}`,
                      background: selectedCategory === c && !newCategoryInput ? "var(--accent-soft)" : "var(--surface)",
                      color: selectedCategory === c && !newCategoryInput ? "var(--accent)" : "var(--ink)",
                    }}
                  >
                    <button
                      onClick={() => {
                        setSelectedCategory(c);
                        setNewCategoryInput("");
                      }}
                      style={{ background: "none", border: "none", padding: 0, color: "inherit", fontSize: 12, fontWeight: 500 }}
                    >
                      {c}
                    </button>
                    {c !== DEFAULT_CATEGORY && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(c);
                        }}
                        title={`Hapus kategori "${c}"`}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 2,
                          display: "flex",
                          color: "var(--ink-soft)",
                          opacity: 0.7,
                        }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <input
              type="text"
              placeholder="atau ketik kategori baru..."
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--border)",
                marginBottom: 18,
              }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={closeModal}
                disabled={uploading}
                style={{ padding: "9px 14px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                Batal
              </button>
              <button onClick={confirmUpload} disabled={uploading} className="upload-btn">
                {uploading && <Loader2 size={14} className="spin" />}
                {uploading ? "Mengunggah..." : "Unggah"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFLIK NAMA FILE */}
      {conflict && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,24,31,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              padding: 24,
              width: 380,
              maxWidth: "100%",
              boxShadow: "0 20px 60px rgba(20,24,31,0.3)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nama file sudah ada</h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 20px" }}>
              Dokumen dengan nama <strong style={{ color: "var(--ink)" }}>"{conflict.existingFile.name}"</strong> sudah
              ada di arsip. Mau diapakan?
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => resolveConflict("overwrite")}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "none",
                  background: "var(--danger)",
                  color: "#fff",
                  textAlign: "left",
                }}
              >
                Timpa file lama
                <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                  File lama dihapus, digantikan yang baru
                </div>
              </button>
              <button
                onClick={() => resolveConflict("rename")}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  textAlign: "left",
                }}
              >
                Ganti nama file ini
                <div style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-soft)", marginTop: 2 }}>
                  Kembali ke form buat ubah namanya dulu
                </div>
              </button>
              <button
                onClick={() => resolveConflict("skip")}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink-soft)",
                  textAlign: "left",
                }}
              >
                Lewati file ini
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function thStyle(width?: string) {
  return {
    textAlign: "left" as const,
    padding: "11px 14px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--ink-soft)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    width,
  };
}

function tdStyle() {
  return {
    padding: "11px 14px",
    verticalAlign: "middle" as const,
  };
}
