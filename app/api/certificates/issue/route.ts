import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { COURSE_ID } from "@/lib/constants";
import type { Certificate, LessonProgress, Profile } from "@/lib/types";

type IssueCertificateBody = {
  lessonId?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Certificate issuing is not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Sign in before issuing a certificate." }, { status: 401 });
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

  const body = (await request.json()) as IssueCertificateBody;
  if (!body.lessonId) {
    return NextResponse.json({ error: "Lesson is required." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const [
    { data: lesson, error: lessonError },
    { data: course, error: courseError },
    { data: profile, error: profileError },
    { data: progress, error: progressError },
    { data: existingCertificate, error: existingCertificateError }
  ] = await Promise.all([
    serviceClient
      .from("lessons")
      .select("id, course_id, title, is_published, archived_at, provides_certificate")
      .eq("id", body.lessonId)
      .single(),
    serviceClient.from("courses").select("id, title").eq("id", COURSE_ID).single(),
    serviceClient.from("profiles").select("id, full_name, email").eq("id", user.id).single(),
    serviceClient.from("lesson_progress").select("*").eq("user_id", user.id).eq("lesson_id", body.lessonId).maybeSingle(),
    serviceClient.from("certificates").select("*").eq("user_id", user.id).eq("lesson_id", body.lessonId).maybeSingle()
  ]);

  if (lessonError) return NextResponse.json({ error: `Could not load lesson: ${lessonError.message}` }, { status: 500 });
  if (courseError) return NextResponse.json({ error: `Could not load course: ${courseError.message}` }, { status: 500 });
  if (profileError) return NextResponse.json({ error: `Could not load profile: ${profileError.message}` }, { status: 500 });
  if (progressError) return NextResponse.json({ error: `Could not load progress: ${progressError.message}` }, { status: 500 });
  if (existingCertificateError) {
    return NextResponse.json({ error: `Could not load certificate: ${existingCertificateError.message}` }, { status: 500 });
  }

  if (!lesson || !lesson.is_published || lesson.archived_at) {
    return NextResponse.json({ error: "This lesson is not available for certification." }, { status: 404 });
  }

  if (!lesson.provides_certificate) {
    return NextResponse.json({ error: "This lesson does not provide a certificate." }, { status: 400 });
  }

  const lessonProgress = progress as LessonProgress | null;
  if (!lessonProgress?.quiz_passed) {
    return NextResponse.json({ error: "Pass the lesson quiz before issuing a certificate." }, { status: 403 });
  }

  const learnerProfile = profile as Pick<Profile, "full_name" | "email">;
  const recipientName = learnerProfile.full_name?.trim();

  if (!recipientName) {
    return NextResponse.json({ error: "Add your certificate name in your profile before issuing a certificate." }, { status: 400 });
  }

  if (existingCertificate) {
    const { data: updatedCertificate, error: updateCertificateError } = await serviceClient
      .from("certificates")
      .update({ recipient_name: recipientName })
      .eq("id", (existingCertificate as Certificate).id)
      .select("*")
      .single();

    if (updateCertificateError) {
      return NextResponse.json({ error: `Could not update certificate: ${updateCertificateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ certificate: updatedCertificate as Certificate });
  }

  const { data: certificate, error: certificateError } = await serviceClient
    .from("certificates")
    .insert({
      user_id: user.id,
      lesson_id: lesson.id,
      course_id: lesson.course_id,
      recipient_name: recipientName,
      lesson_title: lesson.title,
      course_title: course.title
    })
    .select("*")
    .single();

  if (certificateError) {
    return NextResponse.json({ error: `Could not issue certificate: ${certificateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ certificate: certificate as Certificate });
}
