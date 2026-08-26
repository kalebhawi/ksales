import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_PHOTO_BYTES,
  MAX_SELLER_LEVEL,
  detectImageType,
  formatBytes,
  validatePhotoUpload,
  validatePhotoUrl,
  validateSellerLevel,
  validateSellerName,
} from "../src/lib/seller-rules";

const bytes = (...values: number[]) => Uint8Array.from(values);
const PNG_HEADER = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG_HEADER = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
const GIF_HEADER = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0);
const WEBP_HEADER = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);

describe("nome do vendedor", () => {
  it("é obrigatório", () => {
    for (const entrada of ["", "   ", null, undefined, 42]) {
      const result = validateSellerName(entrada);
      assert.equal(result.ok, false, `deveria recusar ${JSON.stringify(entrada)}`);
    }
  });

  it("remove espaços das pontas", () => {
    assert.deepEqual(validateSellerName("  Marina Costa  "), { ok: true, value: "Marina Costa" });
  });

  it("limita o tamanho", () => {
    assert.equal(validateSellerName("a".repeat(121)).ok, false);
    assert.equal(validateSellerName("a".repeat(120)).ok, true);
  });
});

describe("nível do vendedor", () => {
  it("aceita de 1 a 5", () => {
    for (let level = 1; level <= MAX_SELLER_LEVEL; level += 1) {
      assert.deepEqual(validateSellerLevel(level), { ok: true, value: level });
    }
  });

  it("recusa fora da faixa", () => {
    for (const level of [0, -1, 6, 10, 99]) {
      assert.equal(validateSellerLevel(level).ok, false, `deveria recusar ${level}`);
    }
  });

  it("recusa fracionário e não numérico", () => {
    assert.equal(validateSellerLevel(2.5).ok, false);
    assert.equal(validateSellerLevel("alto").ok, false);
    assert.equal(validateSellerLevel(null).ok, false);
  });

  it("aceita número em texto vindo de formulário", () => {
    assert.deepEqual(validateSellerLevel("3"), { ok: true, value: 3 });
  });
});

describe("URL da foto", () => {
  it("vazia vira null", () => {
    assert.deepEqual(validatePhotoUrl("  "), { ok: true, value: null });
    assert.deepEqual(validatePhotoUrl(undefined), { ok: true, value: null });
  });

  it("aceita http e https", () => {
    assert.equal(validatePhotoUrl("https://exemplo.com/foto.png").ok, true);
    assert.equal(validatePhotoUrl("http://exemplo.com/foto.png").ok, true);
  });

  it("recusa esquema perigoso ou texto solto", () => {
    for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd", "só um texto"]) {
      assert.equal(validatePhotoUrl(url).ok, false, `deveria recusar ${url}`);
    }
  });
});

describe("upload de imagem", () => {
  it("identifica formato pelo conteúdo", () => {
    assert.equal(detectImageType(PNG_HEADER), "image/png");
    assert.equal(detectImageType(JPEG_HEADER), "image/jpeg");
    assert.equal(detectImageType(GIF_HEADER), "image/gif");
    assert.equal(detectImageType(WEBP_HEADER), "image/webp");
  });

  it("recusa o que não é imagem, mesmo que o cliente jure que é", () => {
    // %PDF, um zip e um SVG — SVG é XML e poderia carregar script.
    assert.equal(detectImageType(bytes(0x25, 0x50, 0x44, 0x46)), null);
    assert.equal(detectImageType(bytes(0x50, 0x4b, 0x03, 0x04)), null);
    assert.equal(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  });

  it("não confunde RIFF que não é WebP", () => {
    // RIFF....WAVE: mesmo cabeçalho de container, formato diferente.
    assert.equal(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)), null);
  });

  it("recusa arquivo vazio e acima do limite", () => {
    assert.equal(validatePhotoUpload(new Uint8Array(0)).ok, false);

    const grande = new Uint8Array(MAX_PHOTO_BYTES + 1);
    grande.set(PNG_HEADER);
    assert.equal(validatePhotoUpload(grande).ok, false);
  });

  it("aceita uma imagem dentro do limite", () => {
    const ok = new Uint8Array(1024);
    ok.set(PNG_HEADER);
    assert.deepEqual(validatePhotoUpload(ok), { ok: true, value: "image/png" });
  });
});

describe("formatBytes", () => {
  it("escolhe a unidade legível", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2 KB");
    assert.equal(formatBytes(MAX_PHOTO_BYTES), "2 MB");
  });
});
