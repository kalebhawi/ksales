import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ksales · Operação comercial",
  description: "Fila de vendedores, atendimentos e vendas da Kalebhawi.",
  // Nome curto embaixo do ícone quando alguém salva na tela inicial do iPhone,
  // e barra de status combinando com o topo claro da aplicação.
  appleWebApp: {
    capable: true,
    title: "ksales",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Pinta a barra do navegador com o laranja da marca no Android e no desktop.
  themeColor: "#ef754d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
