import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Call X",
  description: "Powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
