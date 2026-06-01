"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COURSE_ID } from "@/lib/constants";
import { demoAttempts, demoLessons, demoProfile } from "@/lib/demo-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { LessonProgress, LessonWithProgress, Profile, QuizAttempt } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [lessons, setLessons] = useState<LessonWithProgress[]>(isSupabaseConfigured ? [] : demoLessons);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(isSupabaseConfigured ? [] : demoAttempts);
  const completedLessons = lessons.filter((lesson) => lesson.progress?.quiz_passed).length;
  const progressPercent = lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0;
  const lessonTitleById = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) void loadUserData(user.id, user.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        void loadUserData(user.id, user.email ?? null);
      } else {
        setProfile(null);
        setLessons([]);
        setAttempts([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadUserData(userId: string, fallbackEmail: string | null) {
    if (!supabase) return;

    const [{ data: userProfile }, { data: courseLessons }, { data: userProgress }, { data: userAttempts }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("lessons").select("*").eq("course_id", COURSE_ID).eq("is_published", true).order("lesson_order"),
      supabase.from("lesson_progress").select("*").eq("user_id", userId),
      supabase
        .from("quiz_attempts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
    ]);

    setProfile(
      userProfile ?? {
        id: userId,
        full_name: fallbackEmail?.split("@")[0] ?? "Learner",
        email: fallbackEmail,
        role: "student"
      }
    );

    const progressByLesson = new Map((userProgress as LessonProgress[] | null)?.map((item) => [item.lesson_id, item]) ?? []);
    setLessons(
      ((courseLessons as LessonWithProgress[] | null) ?? [])
        .filter((lesson) => !lesson.archived_at)
        .map((lesson) => ({
          ...lesson,
          progress: progressByLesson.get(lesson.id) ?? null
        }))
    );
    setAttempts((userAttempts as QuizAttempt[]) ?? []);
  }

  return (
    <div className="shell">
      <header className="topbar" aria-label="Profile header">
        <div className="topbar-inner">
          <div className="brand">
            <p className="eyebrow">Startup Fundamentals</p>
            <h1>Profile</h1>
          </div>
          <nav className="tabs" aria-label="App sections">
            <Link className="tab" href="/">
              Lesson
            </Link>
            {profile?.role === "admin" && (
              <Link className="tab" href="/admin">
                Admin
              </Link>
            )}
            <Link className="tab active" href="/profile">
              Profile
            </Link>
          </nav>
        </div>
      </header>

      <main className="grid">
        <section className="card card-pad">
          <p className="eyebrow">Learner profile</p>
          <h2>{profile?.full_name ?? "Not signed in"}</h2>
          <p className="muted">{profile?.email ?? "Sign in to save progress across devices."}</p>
          <div className="profile-meter">
            <div className="progress-label">
              <span>Course progress</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="progress-track" aria-label={`Course progress ${progressPercent}%`}>
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="muted">
              {completedLessons} of {lessons.length} lessons completed
            </p>
          </div>
        </section>

        <section className="card card-pad">
          <h3>Lesson progress</h3>
          {lessons.length ? (
            <ul className="history-list" style={{ marginTop: 16 }}>
              {lessons.map((lesson, index) => (
                <li className="history-item lesson-history-item" key={lesson.id}>
                  <div>
                    <strong>
                      {lesson.lesson_order}. {lesson.title}
                    </strong>
                    <p className="muted">{lesson.progress?.video_progress_percent ?? 0}% watched</p>
                  </div>
                  <span className={`pill ${lesson.progress?.quiz_passed ? "success" : ""}`}>
                    {lesson.progress?.quiz_passed ? "Completed" : index === 0 || lessons[index - 1]?.progress?.quiz_passed ? "In progress" : "Locked"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No published lessons yet.</p>
          )}
        </section>

        <section className="card card-pad">
          <h3>Quiz history</h3>
          {attempts.length ? (
            <ul className="history-list" style={{ marginTop: 16 }}>
              {attempts.map((attempt, index) => (
                <li className="history-item" key={attempt.id ?? `${attempt.created_at}-${index}`}>
                  <p className="eyebrow">{lessonTitleById.get(attempt.lesson_id) ?? "Lesson"}</p>
                  <strong>
                    {attempt.score}/{attempt.total_questions} - {attempt.passed ? "Passed" : "Failed"}
                  </strong>
                  <p className="muted">{attempt.created_at ? new Date(attempt.created_at).toLocaleString() : "Just now"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No quiz attempts yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
