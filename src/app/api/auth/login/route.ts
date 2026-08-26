import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit-log";
import { primaryRole } from "@/lib/authz";
import { badRequest, readJson } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { consumeAttempt, resetAttempts } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/** Hash descartável usado para igualar o tempo de resposta quando o e-mail não existe. */
const DECOY_HASH = hashPassword("ksales-decoy-password");

export async function POST(request: Request) {
  const body = await readJson(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return badRequest("Informe e-mail e senha.");
  }

  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const throttle = consumeAttempt(`login:${clientKey}:${email}`, MAX_ATTEMPTS, WINDOW_MS);

  if (!throttle.allowed) {
    await recordAudit({
      action: "LOGIN_FAILED",
      actor: null,
      details: { email, motivo: "limite_de_tentativas", origem: clientKey },
    });

    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      roles: { include: { role: { select: { name: true } } } },
      seller: { select: { id: true, name: true, active: true } },
    },
  });

  const valid = await verifyPassword(password, user?.active ? user.passwordHash : await DECOY_HASH);

  if (!user || !user.active || !valid) {
    // Nunca a senha tentada: o arquivo de auditoria é lido por gente, e uma
    // senha errada aqui costuma ser a senha certa de outra conta.
    await recordAudit({
      action: "LOGIN_FAILED",
      actor: null,
      details: {
        email,
        motivo: !user ? "email_inexistente" : !user.active ? "usuario_inativo" : "senha_incorreta",
        origem: clientKey,
      },
    });

    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  resetAttempts(`login:${clientKey}:${email}`);
  await createSession(user.id);

  const roles = user.roles.map((entry) => entry.role.name);

  await recordAudit({
    action: "LOGIN",
    actor: {
      id: user.id,
      name: user.name,
      role: primaryRole({ userId: user.id, sellerId: user.seller?.id ?? null, roles }),
    },
    details: { email: user.email, origem: clientKey, senhaProvisoria: user.mustChangePassword },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    roles,
    sellerId: user.seller?.active ? user.seller.id : null,
    mustChangePassword: user.mustChangePassword,
  });
}
