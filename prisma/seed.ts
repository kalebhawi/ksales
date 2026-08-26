// O `prisma migrate` carrega o .env via prisma.config.ts; o seed roda direto
// no tsx e precisa carregar por conta própria.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { MIN_PASSWORD_LENGTH } from "../src/lib/password-rules";
import { ADMIN_ROLE, SELLER_ROLE, SUPERVISOR_ROLE } from "../src/lib/authz";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const sellers = [
  ["Marina Costa", "MC-001", 2, "Especialista em planos empresariais e relacionamento."],
  ["Rafael Martins", "RM-002", 2, "Atendimento consultivo para clientes recorrentes."],
  ["Beatriz Nunes", "BN-003", 3, "Focada em conversão e primeira experiência do cliente."],
  ["João Pedro", "JP-004", 1, "Especialista em suporte e vendas de upgrade."],
  ["Camila Rocha", "CR-005", 1, "Atendimento ágil para clientes digitais."],
  ["Lucas Almeida", "LA-006", 1, "Boa performance em produtos de entrada."],
  ["Sofia Mendes", "SM-007", 2, "Atendimento humanizado e carteira premium."],
] as const;

async function main() {
  const roles = {
    [ADMIN_ROLE]: "Acesso completo à operação.",
    [SUPERVISOR_ROLE]: "Supervisiona a fila e cadastra vendedores.",
    [SELLER_ROLE]: "Acesso à própria operação.",
  };

  for (const [name, description] of Object.entries(roles)) {
    await prisma.role.upsert({ where: { name }, update: { description }, create: { name, description } });
  }

  const admin = await prisma.role.findUniqueOrThrow({ where: { name: ADMIN_ROLE } });

  // Os vendedores acima são fixture de desenvolvimento. Em produção a equipe é
  // cadastrada pela tela, e criar "Marina Costa" no primeiro dia da loja seria
  // lixo que alguém teria de desativar na mão.
  if (process.env.NODE_ENV === "production") {
    console.log("Produção: vendedores de exemplo não foram criados.");
  } else {
    for (const [name, badgeNumber, level, description] of sellers) {
      await prisma.seller.upsert({
        where: { badgeNumber },
        update: { name, level, description },
        create: { name, badgeNumber, level, description },
      });
    }
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@kalebhawi.com.br").toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // A senha só é definida na criação: rodar o seed de novo não sobrescreve
  // a senha de um administrador já existente.
  //
  // `??` não serve aqui: SEED_ADMIN_PASSWORD="" (como vem no .env.example) é
  // string vazia, não undefined, e criaria um admin com senha em branco.
  const configured = process.env.SEED_ADMIN_PASSWORD?.trim() ?? "";

  if (configured.length > 0 && configured.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SEED_ADMIN_PASSWORD precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const password = configured.length > 0 ? configured : randomBytes(12).toString("base64url");

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Admin",
      passwordHash: await hashPassword(password),
      // Provisória como qualquer outra senha definida por terceiros: no
      // primeiro acesso o administrador é obrigado a trocar.
      mustChangePassword: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: admin.id } },
    update: {},
    create: { userId: adminUser.id, roleId: admin.id },
  });

  if (existing) {
    console.log(`Administrador ${email} já existia — senha mantida.`);
    return;
  }

  if (configured.length > 0) {
    console.log(`Administrador ${email} criado com a senha de SEED_ADMIN_PASSWORD.`);
  } else {
    console.log(`Administrador ${email} criado com a senha gerada: ${password}`);
    console.log("Guarde-a agora; ela não será exibida novamente.");
  }

  console.log("Essa senha é provisória: no primeiro acesso será obrigatório definir uma nova.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
