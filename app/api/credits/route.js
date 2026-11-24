import { NextResponse } from "next/server";
import { db, owner } from "../../db";

export const dynamic = "force-dynamic";

const SIGNUP_BONUS = 20;

export async function GET(request) {
  const email = owner(request);
  if (!email) {
    return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
  }
  const supabase = db();
  const { data: bal, error } = await supabase.rpc("credit_adjust", {
    p_email: email,
    p_delta: 0,
    p_reason: "check",
    p_ref: null,
    p_bonus: SIGNUP_BONUS,
  });
  if (error) {
    return NextResponse.json({ error: "Could not load your credits." }, { status: 500 });
  }
  const balance = Number(bal) || 0;
  if (new URL(request.url).searchParams.get("balanceOnly")) {
    return NextResponse.json({ balance });
  }

  const { data: rows } = await supabase
    .from("credit_ledger")
    .select("id,delta,reason,ref,balance_after,created_at")
    .eq("owner_email", email)
    .order("created_at", { ascending: false })
    .limit(500);
  const list = rows || [];

  let used = 0;
  let added = 0;
  for (const r of list) {
    if (r.reason === "send") used += -r.delta;
    else if (r.reason === "refund") used -= r.delta;
    else if (r.delta > 0) added += r.delta;
  }
  return NextResponse.json({ balance, used, added, history: list.slice(0, 100) });
}
