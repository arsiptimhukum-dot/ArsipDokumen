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
  ArrowUp,
  ArrowDown,
  Download,
  X,
} from "lucide-react";

type ArchiveFile = {
  id: string;
  name: string;
  mimeType: string;
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

const ACCEPTED_EXTENSIONS = ".doc,.docx,.pdf";
const ACCEPTED_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
]);

const CATEGORY_COLOR_VARS = ["--cat-0", "--cat-1", "--cat-2", "--cat-3", "--cat-4", "--cat-5"];
const DEFAULT_CATEGORY = "Tanpa Kategori";

function categoryColorVar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % CATEGORY_COLOR_VARS.length;
  }
  return `var(${CATEGORY_COLOR_VARS[Math.abs(hash)]})`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4, verticalAlign: -1 }} />;
  return dir === "asc" ? (
    <ArrowUp size={12} style={{ marginLeft: 4, verticalAlign: -1 }} />
  ) : (
    <ArrowDown size={12} style={{ marginLeft: 4, verticalAlign: -1 }} />
  );
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
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sortField, setSortField] = useState<SortField>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");

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

  const existingCategories = useMemo(() => {
    const set = new Set(files.map((f) => f.category));
    return Array.from(set).sort();
  }, [files]);

  function pickFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    const invalid = arr.find((f) => !ACCEPTED_MIME_TYPES.has(f.type));
    if (invalid) {
      setError(`"${invalid.name}" bukan file Word atau PDF. Hanya .doc, .docx, dan .pdf yang bisa diunggah.`);
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

  async function confirmUpload() {
    if (!pendingFiles) return;
    const category = newCategoryInput.trim() || selectedCategory || "Tanpa Kategori";

    setUploading(true);
    setError("");
    try {
      for (const { file, name } of pendingFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", name.trim() || file.name);
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
      closeModal();
      await loadFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(f: ArchiveFile) {
    if (!confirm(`Hapus "${f.name}" dari arsip? Tindakan ini tidak bisa dibatalkan.`)) return;
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
    } catch (err: any) {
      setError(err.message);
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

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = files.filter((f) => {
    const matchQuery = f.name.toLowerCase().includes(query.toLowerCase());
    const matchCategory = categoryFilter === "Semua" || f.category === categoryFilter;
    return matchQuery && matchCategory;
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

  const allCategories = ["Semua", ...existingCategories];

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
            <h1 style={{ fontSize: 23, fontWeight: 700 }}>Arsip</h1>
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
            Format .doc, .docx, atau .pdf
          </p>
        </div>
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={15} /> Pilih file
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
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
      </div>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Memuat arsip...</p>
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
            {query || categoryFilter !== "Semua"
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
                  <th style={thStyle("48px")}>No</th>
                  <th className="sort-th" style={thStyle("170px")} onClick={() => toggleSort("category")}>
                    Kategori
                    <SortIcon active={sortField === "category"} dir={sortDir} />
                  </th>
                  <th className="sort-th" style={thStyle()} onClick={() => toggleSort("name")}>
                    Nama
                    <SortIcon active={sortField === "name"} dir={sortDir} />
                  </th>
                  <th className="sort-th" style={thStyle("120px")} onClick={() => toggleSort("date")}>
                    Tanggal
                    <SortIcon active={sortField === "date"} dir={sortDir} />
                  </th>
                  <th style={thStyle("90px")}>Unduh</th>
                  <th style={thStyle("40px")}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: i % 2 === 1 ? "var(--row-alt)" : "transparent",
                    }}
                  >
                    <td style={tdStyle()} className="mono">
                      {i + 1}
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
                      <a
                        href={`/api/drive/download/${f.id}?account=${f.accountIndex}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        <Download size={13} /> PDF
                      </a>
                    </td>
                    <td style={tdStyle()}>
                      <button
                        onClick={() => handleDelete(f)}
                        title="Hapus"
                        style={{ background: "none", border: "none", color: "var(--ink-soft)", padding: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* KARTU - tampil di HP */}
          <div className="mobile-cards" style={{ flexDirection: "column", gap: 10 }}>
            {sorted.map((f) => (
              <div
                key={f.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px",
                  boxShadow: "0 1px 2px rgba(20,24,31,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
                    <FileText size={16} style={{ color: "var(--ink-soft)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{f.name}</p>
                  </span>
                  <button
                    onClick={() => handleDelete(f)}
                    style={{ background: "none", border: "none", color: "var(--ink-soft)", padding: 0 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <CategoryPill category={f.category} />
                  <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {formatDate(f.createdTime)}
                  </span>
                </div>
                <a
                  href={`/api/drive/download/${f.id}?account=${f.accountIndex}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    background: "var(--accent)",
                    padding: "7px 14px",
                    borderRadius: 8,
                    textDecoration: "none",
                  }}
                >
                  <Download size={13} /> Unduh PDF
                </a>
              </div>
            ))}
          </div>
        </>
      )}

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
                    File {i + 1}: {p.file.name}
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
                style={{ padding: "9px 14px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                Batal
              </button>
              <button
                onClick={confirmUpload}
                disabled={uploading}
                className="upload-btn"
              >
                {uploading ? "Mengunggah..." : "Unggah"}
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
