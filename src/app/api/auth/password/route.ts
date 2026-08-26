import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { badRequest, readJson, unauthorized } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validateNewPassword } from "@/lib/password-rules";
import { prisma } from "@/lib/prisma";
import { createSession, destroyUserSessions } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Única rota autenticada que continua acessível com senha provisória —
 * é justamente a que tira o usuário desse estado.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await readJson(request);
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";

  // Primeiro acesso: o login com a senha provisória já é a prova de identidade,
  // então não pedimos a senha de novo. Numa troca voluntária, sim — senão uma
  // sessão sequestrada trocaria a senha sem saber a atual.
  const firstAccess = user.mustChangePassword;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

  const check = validateNewPassword(firstAccess ? null : currentPassword, newPassword, confirmation);
  if (!check.ok) return badRequest(check.error);

  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record) return unauthorized();

  if (firstAccess) {
    // Sem o texto puro da provisória, a comparação é contra o hash.
    if (await verifyPassword(newPassword, record.passwordHash)) {
      return badRequest("A nova senha precisa ser diferente da provisória.");
    }
  } else {
    if (!currentPassword) return badRequest("Informe a senha atual.");
    if (!(await verifyPassword(currentPassword, record.passwordHash))) {
      return badRequest("A senha atual não confere.");
    }
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  // Derruba todas as sessões (inclusive a que fez esta chamada) e emite uma
  // nova: se a senha provisória vazou, nenhuma sessão aberta com ela sobrevive.
  await destroyUserSessions(user.id);
  await createSession(user.id);

  await recordAudit({
    action: "PASSWORD_CHANGED",
    actor: auditActor(user),
    target: { id: user.id, name: user.name },
    details: { email: user.email, primeiroAcesso: firstAccess, sessoesEncerradas: true },
  });

  return NextResponse.json({ ok: true });
}
