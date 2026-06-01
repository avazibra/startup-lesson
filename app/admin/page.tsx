"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { COURSE_ID, LESSON_ID } from "@/lib/constants";
import { demoLessonBundle, demoProfile } from "@/lib/demo-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Lesson, LessonBundle, Profile, QuizQuestion } from "@/lib/types";

export default function AdminPage() {
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [draft, setDraft] = useState<LessonBundle>(demoLessonBundle);
  const [message, setMessage] = useState("");
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) void loadProfile(user.id, user.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        void loadProfile(user.id, user.email ?? null);
      } else {
        setProfile(null);
      }
    });

    void loadContent();

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string, fallbackEmail: string | null) {
    if (!supabase) return;

    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(
      data ?? {
        id: userId,
        full_name: fallbackEmail?.split("@")[0] ?? "Learner",
        email: fallbackEmail,
        role: "student"
      }
    );
  }

  async function loadContent() {
    if (!supabase) return;

    const [{ data: course }, { data: lesson }, { data: questions }] = await Promise.all([
      supabase.from("courses").select("*").eq("id", COURSE_ID).single(),
      supabase.from("lessons").select("*").eq("id", LESSON_ID).single(),
      supabase.from("quiz_questions").select("*").eq("lesson_id", LESSON_ID).order("question_order")
    ]);

    if (course && lesson && questions) {
      setDraft({ course, lesson, questions: questions as QuizQuestion[] });
    }
  }

  function updateLesson(patch: Partial<Lesson>) {
    setDraft((current) => ({
      ...current,
      lesson: { ...current.lesson, ...patch }
    }));
  }

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question
      )
    }));
  }

  function addQuestion() {
    setDraft((current) => ({
      ...current,
      questions: [
        ...current.questions,
        {
          id: crypto.randomUUID(),
          lesson_id: current.lesson.id,
          prompt: "New question",
          choice_type: "single",
          options: ["Option A", "Option B", "Option C", "Option D"],
          correct_answers: [0],
          explanation: "Explain why the correct answer is right.",
          question_order: current.questions.length + 1
        }
      ]
    }));
  }

  function removeQuestion(index: number) {
    setDraft((current) => ({
      ...current,
      questions: current.questions
        .filter((_question, questionIndex) => questionIndex !== index)
        .map((question, questionIndex) => ({ ...question, question_order: questionIndex + 1 }))
    }));
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSupabaseConfigured && !isAdmin) {
      setMessage("Admin access is required to save content.");
      return;
    }

    if (!supabase) {
      setMessage("Saved in demo mode. Add Supabase env vars to persist changes.");
      return;
    }

    const lessonPayload = {
      id: draft.lesson.id,
      course_id: draft.lesson.course_id,
      title: draft.lesson.title,
      description: draft.lesson.description,
      youtube_video_id: draft.lesson.youtube_video_id,
      lesson_order: draft.lesson.lesson_order,
      passing_score: draft.lesson.passing_score,
      is_published: draft.lesson.is_published
    };

    const { error: lessonError } = await supabase.from("lessons").upsert(lessonPayload);
    if (lessonError) {
      setMessage(lessonError.message);
      return;
    }

    for (const question of draft.questions) {
      const { error } = await supabase.from("quiz_questions").upsert({
        id: question.id,
        lesson_id: draft.lesson.id,
        prompt: question.prompt,
        choice_type: question.choice_type,
        options: question.options,
        correct_answers: question.correct_answers,
        explanation: question.explanation,
        question_order: question.question_order
      });

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Content saved.");
  }

  return (
    <div className="shell">
      <header className="topbar" aria-label="Admin header">
        <div className="topbar-inner">
          <div className="brand">
            <p className="eyebrow">Startup Fundamentals</p>
            <h1>Admin</h1>
          </div>
          <nav className="tabs" aria-label="App sections">
            <Link className="tab" href="/">
              Lesson
            </Link>
            <Link className="tab active" href="/admin">
              Admin
            </Link>
            <Link className="tab" href="/profile">
              Profile
            </Link>
          </nav>
        </div>
      </header>

      <main className="stack">
        <section className="card card-pad">
          <div className="row">
            <div>
              <p className="eyebrow">Content management</p>
              <h2>Maintain lesson content</h2>
              <p className="muted">Edit the video ID, passing score, questions, answers, and explanations.</p>
            </div>
            <span className={`pill ${isAdmin ? "success" : "warning"}`}>{isAdmin ? "Admin access" : "Admin required"}</span>
          </div>
        </section>

        {isSupabaseConfigured && !profile && (
          <section className="card card-pad">
            <h3>Sign in required</h3>
            <p className="muted">Sign in on the lesson page first, then return here.</p>
            <Link className="tab active" href="/">
              Go to sign in
            </Link>
          </section>
        )}

        {profile && !isAdmin && (
          <section className="card card-pad">
            <h3>Student account</h3>
            <p className="muted">This account can learn and track progress, but cannot edit course content.</p>
          </section>
        )}

        {(!isSupabaseConfigured || isAdmin) && (
          <form className="card card-pad form-grid" onSubmit={saveContent}>
            <div className="split">
              <div className="field">
                <label htmlFor="lesson-title">Lesson title</label>
                <input id="lesson-title" value={draft.lesson.title} onChange={(event) => updateLesson({ title: event.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="video-id">YouTube video ID</label>
                <input
                  id="video-id"
                  value={draft.lesson.youtube_video_id}
                  onChange={(event) => updateLesson({ youtube_video_id: event.target.value })}
                />
              </div>
            </div>

            <div className="split">
              <div className="field">
                <label htmlFor="passing-score">Passing score</label>
                <input
                  id="passing-score"
                  min="1"
                  type="number"
                  value={draft.lesson.passing_score}
                  onChange={(event) => updateLesson({ passing_score: Number(event.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="published">Publish status</label>
                <select
                  id="published"
                  value={draft.lesson.is_published ? "published" : "draft"}
                  onChange={(event) => updateLesson({ is_published: event.target.value === "published" })}
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="lesson-description">Lesson description</label>
              <textarea
                id="lesson-description"
                value={draft.lesson.description}
                onChange={(event) => updateLesson({ description: event.target.value })}
              />
            </div>

            {draft.questions.map((question, index) => (
              <div className="admin-question" key={question.id}>
                <div className="row">
                  <strong>Question {index + 1}</strong>
                  <button className="danger" type="button" onClick={() => removeQuestion(index)}>
                    Remove
                  </button>
                </div>
                <div className="field">
                  <label htmlFor={`prompt-${question.id}`}>Prompt</label>
                  <textarea
                    id={`prompt-${question.id}`}
                    value={question.prompt}
                    onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                  />
                </div>
                <div className="split">
                  <div className="field">
                    <label htmlFor={`type-${question.id}`}>Question type</label>
                    <select
                      id={`type-${question.id}`}
                      value={question.choice_type}
                      onChange={(event) =>
                        updateQuestion(index, {
                          choice_type: event.target.value as QuizQuestion["choice_type"],
                          correct_answers: [question.correct_answers[0] ?? 0]
                        })
                      }
                    >
                      <option value="single">Single choice</option>
                      <option value="multiple">Multiple choice</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`answers-${question.id}`}>Correct answer indexes</label>
                    <input
                      id={`answers-${question.id}`}
                      value={question.correct_answers.join(",")}
                      onChange={(event) =>
                        updateQuestion(index, {
                          correct_answers: event.target.value
                            .split(",")
                            .map((value) => Number(value.trim()))
                            .filter((value) => Number.isInteger(value))
                        })
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`options-${question.id}`}>Options, one per line</label>
                  <textarea
                    id={`options-${question.id}`}
                    value={question.options.join("\n")}
                    onChange={(event) => updateQuestion(index, { options: event.target.value.split("\n").filter(Boolean) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`explanation-${question.id}`}>Explanation</label>
                  <textarea
                    id={`explanation-${question.id}`}
                    value={question.explanation}
                    onChange={(event) => updateQuestion(index, { explanation: event.target.value })}
                  />
                </div>
              </div>
            ))}

            <div className="row">
              <button className="secondary" type="button" onClick={addQuestion}>
                Add question
              </button>
              <button className="primary" type="submit">
                Save content
              </button>
            </div>
          </form>
        )}

        {message && (
          <section className="card card-pad" role="status">
            {message}
          </section>
        )}
      </main>
    </div>
  );
}
