import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));

  if (email === "admin" && password === "admin") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("session", "admin", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  }
  return NextResponse.json(
    { ok: false, error: "Identifiants invalides" },
    { status: 401 },
  );
}
