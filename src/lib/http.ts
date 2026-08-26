import { NextResponse } from "next/server";

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function unauthorized() {
  return NextResponse.json({ error: "Sessão expirada ou inexistente." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Você não tem permissão para esta ação." }, { status: 403 });
}

export function notFound(error: string) {
  return NextResponse.json({ error }, { status: 404 });
}

export function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function passwordChangeRequired() {
  return NextResponse.json(
    { error: "Troque a senha provisória antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" },
    { status: 403 },
  );
}
