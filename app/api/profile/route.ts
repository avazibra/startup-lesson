import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Certificate, Profile } from "@/lib/types";

type UpdateProfileBody = {
  fullName?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Profile updates are not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Sign in before updating your profile." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } }
  });
  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const body = (await request.json()) as UpdateProfileBody;
  const fullName = body.fullName?.replace(/\s+/g, " ").trim() ?? "";

  if (fullName.length < 2) {
    return NextResponse.json({ error: "Enter your full name before saving." }, { status: 400 });
  }

  if (fullName.length > 120) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id)
    .select("*")
    .single();

  if (profileError) {
    return NextResponse.json({ error: `Could not update profile: ${profileError.message}` }, { status: 500 });
  }

  const { data: certificates, error: certificateError } = await serviceClient
    .from("certificates")
    .update({ recipient_name: fullName })
    .eq("user_id", user.id)
    .select("*");

  if (certificateError) {
    return NextResponse.json({ error: `Could not update certificates: ${certificateError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    profile: profile as Profile,
    certificates: (certificates as Certificate[] | null) ?? []
  });
}
