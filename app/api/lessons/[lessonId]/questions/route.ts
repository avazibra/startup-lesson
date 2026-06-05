import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const lessonId = request.nextUrl.pathname.split("/").at(-2);

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Question loading is not configured." }, { status: 500 });
  }

  if (!lessonId) {
    return NextResponse.json({ error: "Lesson ID is required." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: lesson } = await serviceClient
    .from("lessons")
    .select("id, is_published, archived_at")
    .eq("id", lessonId)
    .single();

  if (!lesson || !lesson.is_published || lesson.archived_at) {
    return NextResponse.json({ error: "Lesson is not available." }, { status: 404 });
  }

  const { data: questions, error } = await serviceClient
    .from("quiz_questions")
    .select("id, lesson_id, prompt, choice_type, options, explanation, question_order")
    .eq("lesson_id", lessonId)
    .order("question_order");

  if (error) {
    return NextResponse.json({ error: "Could not load quiz questions." }, { status: 500 });
  }

  return NextResponse.json({ questions: questions ?? [] });
}
