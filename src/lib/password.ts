import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };
const MAXMEM = 64 * 1024 * 1024;

export { MIN_PASSWORD_LENGTH };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password.normalize("NFKC"), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAXMEM });

  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, salt, key] = stored.split("$");

  if (scheme !== "scrypt" || !salt || !key) return false;

  const expected = Buffer.from(key, "base64");
  const actual = await derive(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
