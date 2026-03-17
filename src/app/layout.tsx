import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vapi Dialer",
  description: "Plataforma SaaS de discagem outbound",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
