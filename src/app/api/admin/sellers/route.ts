import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { SELLER_ROLE, canManageSellerRegistry } from "@/lib/authz";
import { badRequest, conflict, forbidden, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { MIN_SELLER_LEVEL, validatePhotoUrl, validateSellerLevel, validateSellerName } from "@/lib/seller-rules";
import { prisma } from "@/lib/prisma";
import { activeStoreId, assertStoreAccess } from "@/lib/stores";

export const dynamic = "force-dynamic";

export const ADMIN_SELLER_SELECT = {
  id: true,
  name: true,
  storeId: true,
  store: { select: { id: true, name: true } },
  badgeNumber: true,
  level: true,
  photoUrl: true,
  description: true,
  queueStatus: true,
  active: true,
  user: { select: { id: true, email: true, active: true, mustChangePassword: true } },
  photo: { select: { mimeType: true, byteSize: true, updatedAt: true } },
} as const;

export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSellerRegistry(session.actor)) return forbidden();

  // O cadastro é o da loja aberta na tela, igual à fila e à visão geral.
  const storeId = await activeStoreId(session.user);
  if (!storeId) return NextResponse.json([]);

  const sellers = await prisma.seller.findMany({
    where: { storeId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: ADMIN_SELLER_SELECT,
  });

  return NextResponse.json(sellers);
}

export async function POST(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSellerRegistry(session.actor)) return forbidden();

  const body = await readJson(request);
  const badgeNumber = typeof body.badgeNumber === "string" ? body.badgeNumber.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const nameCheck = validateSellerName(body.name);
  if (!nameCheck.ok) return badRequest(nameCheck.error);

  const levelCheck = validateSellerLevel(body.level ?? MIN_SELLER_LEVEL);
  if (!levelCheck.ok) return badRequest(levelCheck.error);

  const photoUrlCheck = validatePhotoUrl(body.photoUrl);
  if (!photoUrlCheck.ok) return badRequest(photoUrlCheck.error);

  const name = nameCheck.value;
  const level = levelCheck.value;

  // Sem loja informada, a que está aberta na tela. Em qualquer caso o acesso é
  // conferido no servidor: ninguém cadastra vendedor em loja que não enxerga.
  const storeId = typeof body.storeId === "string" && body.storeId ? body.storeId : await activeStoreId(session.user);
  if (!storeId) return badRequest("Selecione a loja do vendedor.");
  if (!(await assertStoreAccess(session.actor, storeId))) return forbidden();

  if (!badgeNumber) return badRequest("Número de crachá é obrigatório.");
  if (email && password.length < MIN_PASSWORD_LENGTH) {
    return badRequest(`A senha de acesso precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  if (await prisma.seller.findUnique({ where: { badgeNumber }, select: { id: true } })) {
    return conflict("Já existe um vendedor com este crachá.");
  }

  if (email && (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
    return conflict("Já existe um usuário com este e-mail.");
  }

  const passwordHash = email ? await hashPassword(password) : null;

  const seller = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;

    if (email && passwordHash) {
      const role = await tx.role.upsert({
        where: { name: SELLER_ROLE },
        update: {},
        create: { name: SELLER_ROLE, description: "Acesso à própria operação." },
      });

      // Senha definida pelo administrador é sempre provisória: o vendedor
      // é obrigado a trocá-la no primeiro acesso.
      const user = await tx.user.create({
        data: { email, name, passwordHash, mustChangePassword: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      userId = user.id;
    }

    return tx.seller.create({
      data: {
        name,
        storeId,
        badgeNumber,
        level,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        photoUrl: photoUrlCheck.value,
        userId,
      },
      select: ADMIN_SELLER_SELECT,
    });
  });

  await recordAudit({
    action: "SELLER_CREATED",
    actor: auditActor(session.user),
    target: { id: seller.id, name: seller.name },
    store: seller.store,
    details: { cracha: seller.badgeNumber, nivel: seller.level, acesso: seller.user?.email ?? null },
  });

  return NextResponse.json(seller, { status: 201 });
}
