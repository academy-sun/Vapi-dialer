"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    // O redirectTo aponta para a página de update-password onde coletaremos a nova senha
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/update-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
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
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <Link href="/login" style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "8px", 
          color: "#999", 
          fontSize: "14px", 
          textDecoration: "none",
          marginBottom: "24px",
          width: "fit-content"
        }}>
          <ArrowLeft size={16} /> Voltar para o Login
        </Link>
        
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "4px" }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "28px", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-1px" }}>
              CALL
            </span>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "32px", fontWeight: 700, color: "#FF1A1A", letterSpacing: "-1px" }}>
              X
            </span>
          </div>
        </div>

        <div style={{
          background: "#111111",
          border: "1px solid #222222",
          borderRadius: "16px",
          padding: "32px",
        }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#FFFFFF", marginBottom: "8px" }}>
            Recuperar Senha
          </h1>
          <p style={{ fontSize: "14px", color: "#666666", marginBottom: "28px" }}>
            Informe seu e-mail para receber o link.
          </p>

          {error && (
            <div style={{
              background: "#1a0000", border: "1px solid #FF1A1A33", borderRadius: "8px", 
              padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#FF6666",
              display: "flex", gap: "8px", alignItems: "flex-start"
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
              {error}
            </div>
          )}

          {success ? (
            <div style={{
              background: "#001a0d", border: "1px solid #00cc6633", borderRadius: "8px", 
              padding: "16px", fontSize: "14px", color: "#33ff99",
              display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "12px"
            }}>
              <CheckCircle2 size={32} />
              Verifique sua caixa de entrada (e a pasta de Spam). Enviamos um link de redefinição para <strong>{email}</strong>.
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#999999", marginBottom: "8px" }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  style={{
                    width: "100%", padding: "12px 16px", background: "#1a1a1a",
                    border: "1px solid #2a2a2a", borderRadius: "8px", color: "#FFFFFF",
                    fontSize: "14px", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "13px",
                  background: loading ? "#cc0000" : "#FF1A1A",
                  border: "none", borderRadius: "8px", color: "#FFFFFF",
                  fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                  marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? "Enviando..." : "Enviar link de recuperação"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
