type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Limitador simples em memória, suficiente para uma instância única atrás do
 * Nginx. Se a aplicação passar a rodar em cluster, trocar por Redis.
 */
export function consumeAttempt(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetAttempts(key: string) {
  buckets.delete(key);
}
