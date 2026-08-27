import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/base-path";

/**
 * Manifesto para quem salva o app na tela inicial.
 *
 * Sem ele o iPhone usa o título da página como nome do atalho — "ksales ·
 * Operação comercial" não cabe embaixo do ícone. E os caminhos precisam do
 * `basePath`: a aplicação vive em `/sales`, não na raiz do domínio.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ksales · Operação comercial",
    short_name: "ksales",
    description: "Fila de vendedores, atendimentos e vendas da Kalebhawi.",
    start_url: `${BASE_PATH}/fila`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#f7f5f1",
    theme_color: "#ef754d",
    lang: "pt-BR",
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        // Quadrado cheio e com o desenho recuado: o Android recorta a borda no
        // formato do próprio sistema, e canto arredondado aqui sairia duplicado.
        src: `${BASE_PATH}/icons/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
