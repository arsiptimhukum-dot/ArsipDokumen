"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal login");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Tidak bisa terhubung ke server");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(20,24,31,0.06), 0 12px 32px rgba(20,24,31,0.06)",
          padding: "36px 32px",
          width: 340,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: "var(--accent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <FileText size={22} />
        </div>
        <h1 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Arsip</h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-soft)",
            marginTop: 0,
            marginBottom: 24,
          }}
        >
          Masuk untuk mengakses dokumen
        </p>

        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 6,
            color: "var(--ink-soft)",
          }}
        >
          Kata sandi
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            borderRadius: 9,
            border: "1px solid var(--border)",
            marginBottom: 18,
          }}
        />

        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: -10, marginBottom: 14 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "11px 0",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}
