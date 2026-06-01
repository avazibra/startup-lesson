"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LESSON_ID } from "@/lib/constants";
import { demoAttempts, demoProfile, emptyDemoProgress } from "@/lib/demo-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { LessonProgress, Profile, QuizAttempt } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [progress, setProgress] = useState<LessonProgress>(emptyDemoProgress);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(isSupabaseConfigured ? [] : demoAttempts);

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
        setProgress(emptyDemoProgress);
        setAttempts([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadUserData(userId: string, fallbackEmail: string | null) {
    if (!supabase) return;

    const [{ data: userProfile }, { data: userProgress }, { data: userAttempts }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("lesson_progress").select("*").eq("user_id", userId).eq("lesson_id", LESSON_ID).maybeSingle(),
      supabase
        .from("quiz_attempts")
        .select("*")
        .eq("user_id", userId)
        .eq("lesson_id", LESSON_ID)
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
    setProgress(
      userProgress ?? {
        ...emptyDemoProgress,
        user_id: userId,
        lesson_id: LESSON_ID
      }
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
          <div className="checklist">
            <ChecklistItem done={progress.video_completed} number="1" title="Video" text={`${progress.video_progress_percent}% watched`} />
            <ChecklistItem done={progress.quiz_passed} number="2" title="Quiz" text={progress.quiz_passed ? "Passed" : "Not passed yet"} />
            <ChecklistItem done={Boolean(progress.completed_at)} number="3" title="Completion" text={progress.completed_at ?? "Incomplete"} />
          </div>
        </section>

        <section className="card card-pad">
          <h3>Quiz history</h3>
          {attempts.length ? (
            <ul className="history-list" style={{ marginTop: 16 }}>
              {attempts.map((attempt, index) => (
                <li className="history-item" key={attempt.id ?? `${attempt.created_at}-${index}`}>
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

function ChecklistItem({ done, number, title, text }: { done: boolean; number: string; title: string; text: string }) {
  return (
    <li className={`check-item ${done ? "complete" : ""}`}>
      <span className="check-icon" aria-hidden="true">
        {done ? "OK" : number}
      </span>
      <span>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </li>
  );
}
