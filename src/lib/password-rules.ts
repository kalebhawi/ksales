export const MIN_PASSWORD_LENGTH = 8;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/**
 * Regras da troca de senha. Puras de propósito: sem `node:crypto`, então valem
 * tanto no formulário quanto no servidor, e são cobertas por teste.
 *
 * `current` é `null` no primeiro acesso, quando não pedimos a senha provisória —
 * o login já provou que o usuário a conhece. A garantia de que a nova senha é
 * diferente da provisória continua existindo, mas no servidor, comparando com o
 * hash guardado (o texto puro não está disponível aqui).
 */
export function validateNewPassword(
  current: string | null,
  next: string,
  confirmation: string,
): PasswordCheck {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `A nova senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  if (next !== confirmation) {
    return { ok: false, error: "A confirmação não confere com a nova senha." };
  }

  if (current !== null && next === current) {
    return { ok: false, error: "A nova senha precisa ser diferente da atual." };
  }

  return { ok: true };
}
