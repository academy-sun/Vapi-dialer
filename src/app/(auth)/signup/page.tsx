"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
  }

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0D0D0D",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  };

  const Logo = () => (
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
        POWERED BY AI
      </p>
    </div>
  );

  if (done) {
    return (
      <div style={pageStyle}>
        <Logo />
        <div style={{
          width: "100%",
          maxWidth: "400px",
          background: "#111111",
          border: "1px solid #222222",
          borderRadius: "16px",
          padding: "32px",
          textAlign: "center",
        }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#FFFFFF", marginBottom: "12px" }}>
            Verifique seu email
          </h1>
          <p style={{ fontSize: "14px", color: "#666666", marginBottom: "24px" }}>
            Enviamos um link de confirmação para{" "}
            <strong style={{ color: "#999999" }}>{email}</strong>.
            Confirme para continuar.
          </p>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "11px 24px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Voltar ao login
          </Link>
        </div>
        <p style={{ marginTop: "24px", fontSize: "13px", color: "#444444" }}>
          © {new Date().getFullYear()} Call X. Todos os direitos reservados.
        </p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <Logo />

      {/* Card de cadastro */}
      <div style={{
        width: "100%",
        maxWidth: "400px",
        background: "#111111",
        border: "1px solid #222222",
        borderRadius: "16px",
        padding: "32px",
      }}>
        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#FFFFFF", marginBottom: "8px" }}>
          Criar conta
        </h1>
        <p style={{ fontSize: "14px", color: "#666666", marginBottom: "28px" }}>
          Preencha os dados para se registrar
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

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
              minLength={6}
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
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <p style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#555555" }}>
          Já tem conta?{" "}
          <Link href="/login" style={{ color: "#FF6666", textDecoration: "none" }}>
            Entrar
          </Link>
        </p>
      </div>

      <p style={{ marginTop: "24px", fontSize: "13px", color: "#444444" }}>
        © {new Date().getFullYear()} Call X. Todos os direitos reservados.
      </p>
    </div>
  );
}
