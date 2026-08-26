export const MIN_SELLER_LEVEL = 1;
export const MAX_SELLER_LEVEL = 5;
export const SELLER_LEVELS = [1, 2, 3, 4, 5] as const;

/**
 * 2 MB. É uma foto de perfil renderizada no máximo a 68px — qualquer coisa
 * acima disso é desperdício de banco e de banda, já que o blob viaja inteiro
 * na resposta. Serve com folga para uma foto de celular sem tratamento.
 */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/**
 * Só formatos rasterizados. SVG fica de fora de propósito: é XML e pode
 * carregar `<script>`, virando XSS na origem da aplicação quando servido.
 */
export const ALLOWED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type AllowedPhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];

export const PHOTO_ACCEPT_ATTRIBUTE = ALLOWED_PHOTO_TYPES.join(",");

export type Check<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function validateSellerName(input: unknown): Check<string> {
  const name = typeof input === "string" ? input.trim() : "";

  if (name.length === 0) return { ok: false, error: "Nome é obrigatório." };
  if (name.length > 120) return { ok: false, error: "Nome pode ter no máximo 120 caracteres." };

  return { ok: true, value: name };
}

export function validateSellerLevel(input: unknown): Check<number> {
  const level = typeof input === "number" ? input : Number(input);

  if (!Number.isInteger(level) || level < MIN_SELLER_LEVEL || level > MAX_SELLER_LEVEL) {
    return { ok: false, error: `Nível deve ser um número inteiro de ${MIN_SELLER_LEVEL} a ${MAX_SELLER_LEVEL}.` };
  }

  return { ok: true, value: level };
}

export function validatePhotoUrl(input: unknown): Check<string | null> {
  const raw = typeof input === "string" ? input.trim() : "";
  if (raw.length === 0) return { ok: true, value: null };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "URL da foto inválida." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "A URL da foto precisa começar com http:// ou https://." };
  }

  return { ok: true, value: url.toString() };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;

  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/**
 * Identifica o formato pelo conteúdo, não pelo `Content-Type` — que é escolhido
 * por quem envia e pode mentir. Devolve `null` para qualquer coisa que não seja
 * uma das imagens aceitas.
 */
export function detectImageType(bytes: Uint8Array): AllowedPhotoType | null {
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "image/gif";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";

  return null;
}

export function validatePhotoUpload(bytes: Uint8Array): Check<AllowedPhotoType> {
  if (bytes.length === 0) return { ok: false, error: "Arquivo vazio." };

  if (bytes.length > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      error: `A imagem tem ${formatBytes(bytes.length)} e o limite é ${formatBytes(MAX_PHOTO_BYTES)}.`,
    };
  }

  const mimeType = detectImageType(bytes);
  if (!mimeType) {
    return { ok: false, error: "Envie uma imagem PNG, JPEG, WebP ou GIF." };
  }

  return { ok: true, value: mimeType };
}
