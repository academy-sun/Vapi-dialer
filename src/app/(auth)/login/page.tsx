"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Email ou senha incorretos.");
      setLoading(false);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0D0D0D",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "40px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "4px" }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: "36px", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-1px" }}>
            CALL
          </span>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: "42px", fontWeight: 700, color: "#FF1A1A", letterSpacing: "-1px" }}>
            X
          </span>
        </div>
        <p style={{ fontSize: "11px", color: "#555555", letterSpacing: "2px", marginTop: "4px" }}>
          by MX3
        </p>
      </div>

      {/* Card de login */}
      <div style={{
        width: "100%",
        maxWidth: "400px",
        background: "#111111",
        border: "1px solid #222222",
        borderRadius: "16px",
        padding: "32px",
      }}>
        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#FFFFFF", marginBottom: "8px" }}>
          Entrar
        </h1>
        <p style={{ fontSize: "14px", color: "#666666", marginBottom: "28px" }}>
          Acesse sua conta para continuar
        </p>

        {error && (
          <div style={{
            background: "#1a0000",
            border: "1px solid #FF1A1A33",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "20px",
            fontSize: "14px",
            color: "#FF6666",
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#999999", marginBottom: "8px" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: "8px",
                color: "#FFFFFF",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#999999", marginBottom: "8px" }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: "8px",
                color: "#FFFFFF",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <Link href="/forgot-password" style={{ 
                fontSize: "12px", 
                color: "#FF1A1A", 
                textDecoration: "none",
                fontWeight: 500
              }}>
                Esqueceu a senha?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              background: loading ? "#cc0000" : "#FF1A1A",
              border: "none",
              borderRadius: "8px",
              color: "#FFFFFF",
              fontSize: "15px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: "8px",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>

      <p style={{ marginTop: "24px", fontSize: "13px", color: "#444444" }}>
        © {new Date().getFullYear()} Call X. Todos os direitos reservados.
      </p>
    </div>
  );
}
