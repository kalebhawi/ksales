import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return user ? NextResponse.json(user) : unauthorized();
}
