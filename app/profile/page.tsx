"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { COURSE_ID } from "@/lib/constants";
import { demoAttempts, demoLessons, demoProfile } from "@/lib/demo-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Certificate, LessonProgress, LessonWithProgress, Profile, QuizAttempt } from "@/lib/types";
import { ThemeToggle } from "../theme-toggle";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [lessons, setLessons] = useState<LessonWithProgress[]>(isSupabaseConfigured ? [] : demoLessons);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(isSupabaseConfigured ? [] : demoAttempts);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certificateMessage, setCertificateMessage] = useState("");
  const [issuingLessonId, setIssuingLessonId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(isSupabaseConfigured ? "" : demoProfile.full_name ?? "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const completedLessons = lessons.filter((lesson) => lesson.progress?.quiz_passed).length;
  const progressPercent = lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0;
  const lessonTitleById = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
  const certificateByLessonId = new Map(certificates.map((certificate) => [certificate.lesson_id, certificate]));

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
        setCertificates([]);
        setDisplayName("");
        setProfileMessage("");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadUserData(userId: string, fallbackEmail: string | null) {
    if (!supabase) return;

    const [{ data: userProfile }, { data: courseLessons }, { data: userProgress }, { data: userAttempts }, { data: userCertificates }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("lessons").select("*").eq("course_id", COURSE_ID).eq("is_published", true).order("lesson_order"),
        supabase.from("lesson_progress").select("*").eq("user_id", userId),
        supabase
          .from("quiz_attempts")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase.from("certificates").select("*").eq("user_id", userId).order("issued_at", { ascending: false })
      ]);

    const loadedProfile =
      userProfile ?? {
        id: userId,
        full_name: null,
        email: fallbackEmail,
        role: "student" as const
      };

    setProfile(loadedProfile);
    setDisplayName(loadedProfile.full_name ?? "");

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
    setCertificates((userCertificates as Certificate[]) ?? []);
  }

  async function saveProfileName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;

    const fullName = displayName.replace(/\s+/g, " ").trim();
    setProfileSaving(true);
    setProfileMessage("");

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setProfileSaving(false);
      setProfileMessage("Your session expired. Sign in again before updating your profile.");
      return;
    }

    const response = await fetch("/api/profile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fullName })
    });

    const payload = (await response.json()) as { profile?: Profile; certificates?: Certificate[]; error?: string };
    setProfileSaving(false);

    if (!response.ok || !payload.profile) {
      setProfileMessage(payload.error ?? "Could not update profile.");
      return;
    }

    setProfile(payload.profile);
    setDisplayName(payload.profile.full_name ?? "");
    if (payload.certificates) {
      setCertificates((current) => {
        const updatedById = new Map(payload.certificates?.map((certificate) => [certificate.id, certificate]) ?? []);
        return current.map((certificate) => updatedById.get(certificate.id) ?? certificate);
      });
    }
    setProfileMessage("Profile name saved. Certificates now use this name.");
  }

  async function issueCertificate(lessonId: string) {
    if (!supabase || !profile) return;

    setIssuingLessonId(lessonId);
    setCertificateMessage("");

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setCertificateMessage("Your session expired. Sign in again before issuing a certificate.");
      setIssuingLessonId(null);
      return;
    }

    const response = await fetch("/api/certificates/issue", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ lessonId })
    });

    const payload = (await response.json()) as { certificate?: Certificate; error?: string };
    setIssuingLessonId(null);

    if (!response.ok || !payload.certificate) {
      setCertificateMessage(payload.error ?? "Could not issue certificate.");
      return;
    }

    setCertificates((current) => {
      const withoutDuplicate = current.filter((certificate) => certificate.id !== payload.certificate?.id);
      return [payload.certificate as Certificate, ...withoutDuplicate];
    });
    setCertificateMessage("Certificate issued.");
  }

  return (
    <div className="shell">
      <header className="topbar" aria-label="Profile header">
        <div className="topbar-inner">
          <div className="brand">
            <p className="eyebrow">Startup Fundamentals</p>
            <h1>Profile</h1>
          </div>
          <div className="top-actions">
            <ThemeToggle />
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
        </div>
      </header>

      <main className="grid">
        <section className="card card-pad">
          <p className="eyebrow">Learner profile</p>
          <h2>{profile ? profile.full_name?.trim() || "Add your name" : "Not signed in"}</h2>
          <p className="muted">{profile?.email ?? "Sign in to save progress across devices."}</p>
          <form className="profile-name-form" onSubmit={saveProfileName}>
            <div className="field">
              <label htmlFor="profile-full-name">Certificate name</label>
              <input
                disabled={!profile || profileSaving}
                id="profile-full-name"
                maxLength={120}
                placeholder="First name Last name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <p className="muted">This name appears on issued certificates.</p>
            </div>
            <button className="primary compact-button" disabled={!profile || profileSaving} type="submit">
              {profileSaving ? "Saving..." : "Save name"}
            </button>
          </form>
          {profileMessage && <p className="muted profile-message">{profileMessage}</p>}
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
                    {lesson.provides_certificate && <p className="certificate-line">Certificate available</p>}
                  </div>
                  <div className="lesson-history-actions">
                    <span
                      className={`lesson-status-chip ${
                        lesson.progress?.quiz_passed ? "complete" : index === 0 || lessons[index - 1]?.progress?.quiz_passed ? "active" : "locked"
                      }`}
                    >
                      {lesson.progress?.quiz_passed ? "Done" : index === 0 || lessons[index - 1]?.progress?.quiz_passed ? "Active" : "Locked"}
                    </span>
                    {lesson.provides_certificate && lesson.progress?.quiz_passed && certificateByLessonId.get(lesson.id) && (
                      <Link className="secondary compact-button" href={`/certificate/${certificateByLessonId.get(lesson.id)?.verification_code}`}>
                        View certificate
                      </Link>
                    )}
                    {lesson.provides_certificate && lesson.progress?.quiz_passed && !certificateByLessonId.get(lesson.id) && (
                      <button className="primary compact-button" disabled={issuingLessonId === lesson.id} type="button" onClick={() => issueCertificate(lesson.id)}>
                        {issuingLessonId === lesson.id ? "Issuing..." : "Issue certificate"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No published lessons yet.</p>
          )}
          {certificateMessage && <p className="muted" style={{ marginTop: 16 }}>{certificateMessage}</p>}
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
