import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { COURSE_ID } from "@/lib/constants";
import type { Certificate, LessonProgress, Profile, QuizAttempt, QuizQuestion } from "@/lib/types";

type SubmitQuizBody = {
  lessonId?: string;
  answers?: Record<string, number[]>;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Quiz submission is not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Sign in before submitting the quiz." }, { status: 401 });
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

  const body = (await request.json()) as SubmitQuizBody;
  if (!body.lessonId || !body.answers) {
    return NextResponse.json({ error: "Lesson and answers are required." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const [
    { data: lesson, error: lessonError },
    { data: progress, error: progressLookupError },
    { data: questions, error: questionsError }
  ] = await Promise.all([
    serviceClient
      .from("lessons")
      .select("id, course_id, title, passing_score, is_published, archived_at, provides_certificate")
      .eq("id", body.lessonId)
      .single(),
    serviceClient
      .from("lesson_progress")
      .select("*")
      .eq("user_id", user.id)
      .eq("lesson_id", body.lessonId)
      .maybeSingle(),
    serviceClient
      .from("quiz_questions")
      .select("id, lesson_id, prompt, choice_type, options, correct_answers, explanation, question_order")
      .eq("lesson_id", body.lessonId)
      .order("question_order")
  ]);

  if (lessonError) {
    return NextResponse.json({ error: `Could not load lesson: ${lessonError.message}` }, { status: 500 });
  }

  if (progressLookupError) {
    return NextResponse.json({ error: `Could not load progress: ${progressLookupError.message}` }, { status: 500 });
  }

  if (questionsError) {
    return NextResponse.json({ error: `Could not load quiz questions: ${questionsError.message}` }, { status: 500 });
  }

  if (!lesson || !lesson.is_published || lesson.archived_at) {
    return NextResponse.json({ error: "This lesson is not available." }, { status: 404 });
  }

  if (!progress?.video_completed) {
    return NextResponse.json({ error: "Complete the video before submitting the quiz." }, { status: 403 });
  }

  const quizQuestions = (questions ?? []) as QuizQuestion[];
  if (!quizQuestions.length) {
    return NextResponse.json({ error: "This lesson does not have a quiz yet." }, { status: 400 });
  }

  const missingQuestion = quizQuestions.find((question) => !body.answers?.[question.id]?.length);
  if (missingQuestion) {
    return NextResponse.json({ error: "Answer every quiz question before submitting." }, { status: 400 });
  }

  const results = quizQuestions.map((question) => {
    const selected = [...(body.answers?.[question.id] ?? [])].sort((a, b) => a - b);
    const expected = [...question.correct_answers].sort((a, b) => a - b);
    return {
      question,
      selected,
      correct: selected.length === expected.length && selected.every((value, index) => value === expected[index])
    };
  });

  const score = results.filter((result) => result.correct).length;
  const passed = score >= lesson.passing_score;
  const completedAt = passed ? new Date().toISOString() : progress.completed_at;

  const attemptPayload: QuizAttempt = {
    user_id: user.id,
    lesson_id: body.lessonId,
    score,
    total_questions: quizQuestions.length,
    passed,
    answers: body.answers
  };

  const [{ data: attempt, error: attemptError }, { data: updatedProgress, error: progressError }] = await Promise.all([
    serviceClient.from("quiz_attempts").insert(attemptPayload).select("*").single(),
    serviceClient
      .from("lesson_progress")
      .upsert(
        {
          user_id: user.id,
          lesson_id: body.lessonId,
          video_progress_percent: progress.video_progress_percent,
          video_completed: true,
          quiz_passed: passed,
          completed_at: completedAt,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,lesson_id" }
      )
      .select("*")
      .single()
  ]);

  if (attemptError || progressError) {
    return NextResponse.json(
      { error: attemptError?.message ?? progressError?.message ?? "Could not save quiz result." },
      { status: 500 }
    );
  }

  let certificate: Certificate | null = null;
  if (passed && lesson.provides_certificate) {
    const [{ data: course }, { data: profile }, { data: existingCertificate }] = await Promise.all([
      serviceClient.from("courses").select("id, title").eq("id", COURSE_ID).single(),
      serviceClient.from("profiles").select("id, full_name, email").eq("id", user.id).single(),
      serviceClient.from("certificates").select("*").eq("user_id", user.id).eq("lesson_id", body.lessonId).maybeSingle()
    ]);

    if (existingCertificate) {
      certificate = existingCertificate as Certificate;
    } else if (course && profile) {
      const learnerProfile = profile as Pick<Profile, "full_name" | "email">;
      const recipientName = learnerProfile.full_name?.trim() || learnerProfile.email?.split("@")[0] || "Learner";
      const { data: issuedCertificate } = await serviceClient
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

      certificate = (issuedCertificate as Certificate | null) ?? null;
    }
  }

  return NextResponse.json({
    attempt,
    progress: updatedProgress as LessonProgress,
    results,
    certificate
  });
}
