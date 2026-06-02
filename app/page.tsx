"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { demoAttempts, demoLessonBundle, demoLessons, demoProfile, emptyDemoProgress } from "@/lib/demo-data";
import { COURSE_ID, DEFAULT_LESSON_ID } from "@/lib/constants";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Lesson, LessonBundle, LessonProgress, LessonWithProgress, Profile, QuizAttempt, QuizQuestion } from "@/lib/types";
import { ThemeToggle } from "./theme-toggle";

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars: Record<string, number>;
          events: { onStateChange: (event: { data: number }) => void };
        }
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayer = {
  getDuration: () => number;
  getCurrentTime: () => number;
  destroy?: () => void;
};

type QuizResult = {
  question: QuizQuestion;
  selected: number[];
  correct: boolean;
};

export default function Home() {
  const [bundle, setBundle] = useState<LessonBundle>(demoLessonBundle);
  const [lessons, setLessons] = useState<LessonWithProgress[]>(demoLessons);
  const [selectedLessonId, setSelectedLessonId] = useState(demoLessonBundle.lesson.id);
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [progress, setProgress] = useState<LessonProgress>(emptyDemoProgress);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(demoAttempts);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number[]>>({});
  const [quizResult, setQuizResult] = useState<QuizResult[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [playerReadyToken, setPlayerReadyToken] = useState(0);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const timerRef = useRef<number | null>(null);

  const videoCompleted = progress.video_completed;
  const quizUnlocked = videoCompleted;
  const quizPassed = progress.quiz_passed;
  const nextLessonUnlocked = quizPassed;
  const lessonProgressPercent = nextLessonUnlocked ? 100 : quizUnlocked ? 50 : 0;
  const isAdmin = profile?.role === "admin";
  const modeLabel = isSupabaseConfigured ? "Supabase mode" : "Demo mode";

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        void loadUserData(user.id, user.email ?? null);
      }
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

    void loadContent(selectedLessonId);

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedLessonId === bundle.lesson.id) return;
    void loadContent(selectedLessonId);
    setSelectedAnswers({});
    setQuizResult(null);
  }, [selectedLessonId]);

  useEffect(() => {
    window.onYouTubeIframeAPIReady = () => setPlayerReadyToken((value) => value + 1);

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    } else if (window.YT) {
      setPlayerReadyToken((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    if (!window.YT) return;

    playerRef.current?.destroy?.();
    playerRef.current = new window.YT.Player("player", {
      videoId: bundle.lesson.youtube_video_id,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        playsinline: 1
      },
      events: {
        onStateChange: handlePlayerStateChange
      }
    });

    return () => {
      stopProgressPolling();
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [playerReadyToken, bundle.lesson.youtube_video_id]);

  async function loadContent(targetLessonId = selectedLessonId) {
    if (!supabase) {
      const selectedDemoLesson = demoLessons.find((lesson) => lesson.id === targetLessonId) ?? demoLessons[0];
      setBundle({
        ...demoLessonBundle,
        lesson: selectedDemoLesson
      });
      return;
    }

    const [{ data: course }, { data: lesson }, { data: questions }, { data: courseLessons }] = await Promise.all([
      supabase.from("courses").select("*").eq("id", COURSE_ID).single(),
      supabase.from("lessons").select("*").eq("id", targetLessonId).eq("is_published", true).single(),
      supabase
        .from("lesson_quiz_questions")
        .select("id, lesson_id, prompt, choice_type, options, explanation, question_order")
        .eq("lesson_id", targetLessonId)
        .order("question_order"),
      supabase.from("lessons").select("*").eq("course_id", COURSE_ID).eq("is_published", true).order("lesson_order")
    ]);

    if (course && lesson && questions) {
      setBundle({
        course,
        lesson,
        questions: (questions as Omit<QuizQuestion, "correct_answers">[]).map((question) => ({
          ...question,
          correct_answers: []
        }))
      });
    }

    if (courseLessons) {
      await loadLessonList((courseLessons as LessonWithProgress[]).filter((courseLesson) => !courseLesson.archived_at));
    }
  }

  async function loadUserData(userId: string, fallbackEmail: string | null) {
    if (!supabase) return;

    const [{ data: userProfile }, { data: userProgress }, { data: userAttempts }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("lesson_progress").select("*").eq("user_id", userId).eq("lesson_id", selectedLessonId).maybeSingle(),
      supabase
        .from("quiz_attempts")
        .select("*")
        .eq("user_id", userId)
        .eq("lesson_id", selectedLessonId)
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
        lesson_id: selectedLessonId
      }
    );
    setAttempts((userAttempts as QuizAttempt[]) ?? []);

    if (supabase) {
      const { data: courseLessons } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", COURSE_ID)
        .eq("is_published", true)
        .order("lesson_order");
      if (courseLessons) await loadLessonList((courseLessons as LessonWithProgress[]).filter((courseLesson) => !courseLesson.archived_at), userId);
    }
  }

  async function loadLessonList(courseLessons: LessonWithProgress[], userId = profile?.id) {
    if (!supabase || !userId) {
      setLessons(courseLessons.map((lesson, index) => ({ ...lesson, is_locked: index > 0 })));
      return;
    }

    const { data: allProgress } = await supabase
      .from("lesson_progress")
      .select("*")
      .eq("user_id", userId)
      .in(
        "lesson_id",
        courseLessons.map((lesson) => lesson.id)
      );

    const progressByLesson = new Map((allProgress as LessonProgress[] | null)?.map((item) => [item.lesson_id, item]) ?? []);
    const enriched = courseLessons.map((lesson, index) => {
      const previousLesson = index > 0 ? courseLessons[index - 1] : null;
      const previousProgress = previousLesson ? progressByLesson.get(previousLesson.id) : null;
      return {
        ...lesson,
        progress: progressByLesson.get(lesson.id) ?? null,
        is_locked: index > 0 && !previousProgress?.quiz_passed
      };
    });

    setLessons(enriched);
  }

  function handlePlayerStateChange(event: { data: number }) {
    if (!window.YT) return;

    if (event.data === window.YT.PlayerState.PLAYING) {
      startProgressPolling();
    }

    if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.BUFFERING) {
      stopProgressPolling();
      void updateVideoProgressFromPlayer();
    }

    if (event.data === window.YT.PlayerState.ENDED) {
      stopProgressPolling();
      void completeVideo();
    }
  }

  function startProgressPolling() {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(() => {
      void updateVideoProgressFromPlayer();
    }, 1000);
  }

  function stopProgressPolling() {
    if (!timerRef.current) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function updateVideoProgressFromPlayer() {
    const player = playerRef.current;
    if (!player) return;

    const duration = player.getDuration();
    const currentTime = player.getCurrentTime();
    if (!duration || duration <= 0) return;

    const percent = Math.min(100, Math.round((currentTime / duration) * 100));
    const bestPercent = Math.max(progress.video_progress_percent, percent);
    const completed = bestPercent >= 95;
    await saveProgress({
      ...progress,
      video_progress_percent: completed ? 100 : bestPercent,
      video_completed: completed || progress.video_completed
    });
  }

  async function completeVideo() {
    await saveProgress({
      ...progress,
      video_progress_percent: 100,
      video_completed: true
    });
    setStatusMessage("Video completed. Quiz unlocked.");
  }

  async function saveProgress(nextProgress: LessonProgress) {
    const normalized = {
      ...nextProgress,
      user_id: profile?.id ?? demoProfile.id,
      lesson_id: bundle.lesson.id
    };

    setProgress(normalized);

    if (!supabase || !profile) return;

    await supabase.rpc("update_video_progress", {
      p_lesson_id: bundle.lesson.id,
      p_video_completed: normalized.video_completed,
      p_video_progress_percent: normalized.video_progress_percent
    });
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setAuthMessage(error ? error.message : "Signed in.");
  }

  async function signUpWithPassword() {
    if (!supabase) return;

    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    setAuthMessage(error ? error.message : "Account created. You can sign in now.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthMessage("Signed out.");
  }

  function toggleAnswer(question: QuizQuestion, optionIndex: number) {
    setSelectedAnswers((current) => {
      const existing = current[question.id] ?? [];
      if (question.choice_type === "single") {
        return { ...current, [question.id]: [optionIndex] };
      }

      const next = existing.includes(optionIndex)
        ? existing.filter((value) => value !== optionIndex)
        : [...existing, optionIndex];

      return { ...current, [question.id]: next.sort((a, b) => a - b) };
    });
  }

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quizUnlocked) {
      setStatusMessage("Complete the video before submitting the quiz.");
      return;
    }

    const missing = bundle.questions.find((question) => !selectedAnswers[question.id]?.length);
    if (missing) {
      setStatusMessage("Please answer every quiz question before submitting.");
      return;
    }

    if (supabase) {
      if (!profile) {
        setStatusMessage("Sign in before submitting the quiz.");
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setStatusMessage("Your session expired. Sign in again before submitting the quiz.");
        return;
      }

      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lessonId: bundle.lesson.id,
          answers: selectedAnswers
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        attempt?: QuizAttempt;
        progress?: LessonProgress;
        results?: QuizResult[];
      };

      if (!response.ok || !payload.attempt || !payload.progress || !payload.results) {
        setStatusMessage(payload.error ?? "Could not submit quiz.");
        return;
      }

      setQuizResult(payload.results);
      setProgress(payload.progress);
      setAttempts((current) => [payload.attempt as QuizAttempt, ...current]);
      void loadUserData(profile.id, profile.email);
      setStatusMessage(payload.attempt.passed ? "Lesson completed. Next lesson unlocked." : "Quiz failed. Review explanations and retake.");
      return;
    }

    const results = bundle.questions.map((question) => {
      const selected = [...(selectedAnswers[question.id] ?? [])].sort((a, b) => a - b);
      const expected = [...question.correct_answers].sort((a, b) => a - b);
      return {
        question,
        selected,
        correct: selected.length === expected.length && selected.every((value, index) => value === expected[index])
      };
    });

    const score = results.filter((result) => result.correct).length;
    const passed = score >= bundle.lesson.passing_score;
    const attempt: QuizAttempt = {
      user_id: profile?.id ?? demoProfile.id,
      lesson_id: bundle.lesson.id,
      score,
      total_questions: bundle.questions.length,
      passed,
      answers: selectedAnswers
    };

    setQuizResult(results);
    setAttempts((current) => [{ ...attempt, created_at: new Date().toISOString() }, ...current]);
    await saveProgress({
      ...progress,
      quiz_passed: passed,
      completed_at: passed ? new Date().toISOString() : progress.completed_at
    });

    setStatusMessage(passed ? "Lesson completed. Next lesson unlocked." : "Quiz failed. Review explanations and retake.");
  }

  function retakeQuiz() {
    setSelectedAnswers({});
    setQuizResult(null);
    setStatusMessage("Quiz reset. Video completion is still saved.");
  }

  const resultSummary = useMemo(() => {
    if (!quizResult) return null;
    const score = quizResult.filter((result) => result.correct).length;
    const passed = score >= bundle.lesson.passing_score;
    return { score, passed };
  }, [quizResult, bundle.lesson.passing_score]);

  return (
    <div className="shell">
      <header className="topbar" aria-label="Course header">
        <div className="topbar-inner">
          <div className="brand">
            <p className="eyebrow">{bundle.course.title}</p>
            <h1>{bundle.lesson.title}</h1>
          </div>
          <div className="top-actions">
            <span className={`pill ${isSupabaseConfigured ? "success" : "warning"}`}>{modeLabel}</span>
            <ThemeToggle />
            <nav className="tabs" aria-label="App sections">
              <Link className="tab active" href="/">
                Lesson
              </Link>
              {isAdmin && (
                <Link className="tab" href="/admin">
                  Admin
                </Link>
              )}
              <Link className="tab" href="/profile">
                Profile
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="grid">
        <section className="stack">
          <LessonList
            lessons={lessons}
            activeLessonId={bundle.lesson.id}
            onSelectLesson={(lesson) => {
              if (lesson.is_locked) {
                setStatusMessage("Pass the previous lesson quiz before opening this lesson.");
                return;
              }
              setSelectedLessonId(lesson.id);
            }}
          />

          <article className="card">
            <div className="hero-copy">
              <p className="eyebrow">Video lesson</p>
              <h2>{bundle.lesson.title}</h2>
              <p>{bundle.lesson.description}</p>
            </div>
            <div className="video-frame">
              <div id="player" aria-label="YouTube lesson video" />
            </div>
            <div className="video-meta">
              <div className="row">
                <span className={`pill ${videoCompleted ? "success" : "warning"}`}>
                  {videoCompleted ? "Video completed" : "Video in progress"}
                </span>
                <button className="secondary" type="button" onClick={completeVideo}>
                  Demo only: mark video complete
                </button>
              </div>
              <div>
                <div className="progress-label">
                  <span>Video progress</span>
                  <span>{progress.video_progress_percent}%</span>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <div className="progress-fill" style={{ width: `${progress.video_progress_percent}%` }} />
                </div>
              </div>
            </div>
          </article>

          <QuizSection
            questions={bundle.questions}
            passingScore={bundle.lesson.passing_score}
            quizUnlocked={quizUnlocked}
            quizPassed={quizPassed}
            selectedAnswers={selectedAnswers}
            quizResult={quizResult}
            resultSummary={resultSummary}
            onToggleAnswer={toggleAnswer}
            onSubmit={submitQuiz}
            onRetake={retakeQuiz}
          />
        </section>

        <aside className="stack">
          <StatusCard
            lessonProgressPercent={lessonProgressPercent}
            videoCompleted={videoCompleted}
            quizUnlocked={quizUnlocked}
            quizPassed={quizPassed}
            nextLessonUnlocked={nextLessonUnlocked}
          />
          <AuthCard
            profile={profile}
            email={email}
            password={password}
            authMessage={authMessage}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSignIn={signInWithPassword}
            onSignUp={signUpWithPassword}
            onSignOut={signOut}
          />
        </aside>
      </main>

      <div className="sr-only" aria-live="polite">
        {statusMessage}
      </div>
      {statusMessage && (
        <div className="card card-pad" style={{ marginTop: 20 }} role="status">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

function LessonList({
  lessons,
  activeLessonId,
  onSelectLesson
}: {
  lessons: LessonWithProgress[];
  activeLessonId: string;
  onSelectLesson: (lesson: LessonWithProgress) => void;
}) {
  return (
    <section className="card card-pad" aria-labelledby="lessons-title">
      <div className="row">
        <div>
          <p className="eyebrow">Course lessons</p>
          <h3 id="lessons-title">Startup Fundamentals</h3>
        </div>
      </div>
      <div className="lesson-list">
        {lessons.map((lesson) => (
          <button
            className={`lesson-row ${lesson.id === activeLessonId ? "active" : ""}`}
            disabled={lesson.is_locked}
            key={lesson.id}
            type="button"
            onClick={() => onSelectLesson(lesson)}
          >
            <span>
              <strong>
                {lesson.lesson_order}. {lesson.title}
              </strong>
              <span>{lesson.progress?.quiz_passed ? "Completed" : lesson.is_locked ? "Locked" : "Available"}</span>
            </span>
            <span className={`pill ${lesson.progress?.quiz_passed ? "success" : lesson.is_locked ? "warning" : ""}`}>
              {lesson.progress?.quiz_passed ? "Done" : lesson.is_locked ? "Locked" : "Open"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StatusCard({
  lessonProgressPercent,
  videoCompleted,
  quizUnlocked,
  quizPassed,
  nextLessonUnlocked
}: {
  lessonProgressPercent: number;
  videoCompleted: boolean;
  quizUnlocked: boolean;
  quizPassed: boolean;
  nextLessonUnlocked: boolean;
}) {
  return (
    <section className="card card-pad" aria-labelledby="status-title">
      <h3 id="status-title">Lesson checklist</h3>
      <div style={{ marginTop: 14 }}>
        <div className="progress-label">
          <span>Lesson progress</span>
          <span>{lessonProgressPercent}%</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${lessonProgressPercent}%` }} />
        </div>
      </div>
      <ul className="checklist">
        <ChecklistItem done={videoCompleted} number="1" title="Watch video" text={videoCompleted ? "Completed" : "Required before quiz"} />
        <ChecklistItem
          done={quizPassed}
          number="2"
          title="Pass quiz"
          text={quizPassed ? "Passed" : quizUnlocked ? "Ready to take" : "Locked until video completion"}
        />
        <ChecklistItem done={nextLessonUnlocked} number="3" title="Continue" text={nextLessonUnlocked ? "Unlocked" : "Next lesson locked"} />
      </ul>
    </section>
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

function AuthCard({
  profile,
  email,
  password,
  authMessage,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignUp,
  onSignOut
}: {
  profile: Profile | null;
  email: string;
  password: string;
  authMessage: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: (event: FormEvent<HTMLFormElement>) => void;
  onSignUp: () => void;
  onSignOut: () => void;
}) {
  if (!isSupabaseConfigured) {
    return (
      <section className="card card-pad">
        <h3>Demo identity</h3>
        <p className="muted">Supabase env vars are not set yet. The app is using a local admin demo user.</p>
      </section>
    );
  }

  return (
    <section className="card card-pad">
      <h3>{profile ? "Signed in" : "Sign in"}</h3>
      {profile ? (
        <div className="stack" style={{ marginTop: 14 }}>
          <p className="muted">{profile.email}</p>
          <span className="pill success">{profile.role}</span>
          <button className="secondary" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      ) : (
        <form className="form-grid" onSubmit={onSignIn} style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
          </div>
          <button className="primary" type="submit">
            Sign in
          </button>
          <button className="secondary" type="button" onClick={onSignUp}>
            Create account
          </button>
        </form>
      )}
      {authMessage && <p className="muted">{authMessage}</p>}
    </section>
  );
}

function QuizSection({
  questions,
  passingScore,
  quizUnlocked,
  quizPassed,
  selectedAnswers,
  quizResult,
  resultSummary,
  onToggleAnswer,
  onSubmit,
  onRetake
}: {
  questions: QuizQuestion[];
  passingScore: number;
  quizUnlocked: boolean;
  quizPassed: boolean;
  selectedAnswers: Record<string, number[]>;
  quizResult: QuizResult[] | null;
  resultSummary: { score: number; passed: boolean } | null;
  onToggleAnswer: (question: QuizQuestion, optionIndex: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetake: () => void;
}) {
  return (
    <section className="card card-pad" aria-labelledby="quiz-title">
      <div className="row">
        <div>
          <h3 id="quiz-title">Lesson quiz</h3>
          <p className="muted">Passing requires {passingScore} correct answers.</p>
        </div>
        <span className={`pill ${quizUnlocked ? "success" : "warning"}`}>{quizUnlocked ? "Unlocked" : "Locked"}</span>
      </div>

      {!quizUnlocked ? (
        <div className="notice" role="status" style={{ marginTop: 18 }}>
          <strong>Quiz locked</strong>
          <span>Complete the video lesson before answering the quiz.</span>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ marginTop: 18 }}>
          {questions.map((question, questionIndex) => (
            <fieldset className="question" key={question.id}>
              <span className="question-type">{question.choice_type === "multiple" ? "Multiple choice" : "Single choice"}</span>
              <legend>
                {questionIndex + 1}. {question.prompt}
              </legend>
              <div className="options">
                {question.options.map((option, optionIndex) => {
                  const checked = selectedAnswers[question.id]?.includes(optionIndex) ?? false;
                  return (
                    <label className="option" key={`${question.id}-${optionIndex}`}>
                      <input
                        type={question.choice_type === "multiple" ? "checkbox" : "radio"}
                        name={question.id}
                        checked={checked}
                        disabled={quizPassed}
                        onChange={() => onToggleAnswer(question, optionIndex)}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="row" style={{ marginTop: 18 }}>
            <p className="muted">You can change answers before submitting.</p>
            <button className="primary" type="submit" disabled={quizPassed}>
              Submit quiz
            </button>
          </div>
        </form>
      )}

      {resultSummary && quizResult && (
        <div style={{ marginTop: 20 }}>
          <div className={`result ${resultSummary.passed ? "pass" : "fail"}`}>
            <strong>{resultSummary.passed ? "Lesson completed" : "Retake required"}</strong>
            <p>
              You scored {resultSummary.score} out of {questions.length}.
            </p>
          </div>
          <ul className="explanations">
            {quizResult.map((result, index) => (
              <li className="explanation" key={result.question.id}>
                <strong>
                  {index + 1}. {result.correct ? "Correct" : "Needs review"}
                </strong>
                <p className="muted">Your answer: {formatAnswer(result.question, result.selected)}</p>
                <p className="muted">Correct answer: {formatAnswer(result.question, result.question.correct_answers)}</p>
                <p>{result.question.explanation}</p>
              </li>
            ))}
          </ul>
          {!resultSummary.passed && (
            <button className="secondary" type="button" onClick={onRetake} style={{ marginTop: 18 }}>
              Retake quiz
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function formatAnswer(question: QuizQuestion, answerIndexes: number[]) {
  if (!answerIndexes.length) return "No answer selected";
  return answerIndexes.map((index) => question.options[index]).join("; ");
}

function AdminPanel({
  draft,
  isAdmin,
  onSave,
  onLessonChange,
  onQuestionChange,
  onAddQuestion,
  onRemoveQuestion
}: {
  draft: LessonBundle;
  isAdmin: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onLessonChange: (patch: Partial<Lesson>) => void;
  onQuestionChange: (index: number, patch: Partial<QuizQuestion>) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
}) {
  return (
    <main className="stack">
      <section className="card card-pad">
        <div className="row">
          <div>
            <p className="eyebrow">Admin panel</p>
            <h2>Maintain lesson content</h2>
            <p className="muted">Edit the video ID, passing score, questions, answers, and explanations.</p>
          </div>
          <span className={`pill ${isAdmin ? "success" : "warning"}`}>{isAdmin ? "Admin access" : "Read-only preview"}</span>
        </div>
      </section>

      <form className="card card-pad form-grid" onSubmit={onSave}>
        <div className="split">
          <div className="field">
            <label htmlFor="lesson-title">Lesson title</label>
            <input id="lesson-title" value={draft.lesson.title} onChange={(event) => onLessonChange({ title: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="video-id">YouTube video ID</label>
            <input
              id="video-id"
              value={draft.lesson.youtube_video_id}
              onChange={(event) => onLessonChange({ youtube_video_id: event.target.value })}
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
              onChange={(event) => onLessonChange({ passing_score: Number(event.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="published">Publish status</label>
            <select
              id="published"
              value={draft.lesson.is_published ? "published" : "draft"}
              onChange={(event) => onLessonChange({ is_published: event.target.value === "published" })}
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
            onChange={(event) => onLessonChange({ description: event.target.value })}
          />
        </div>

        {draft.questions.map((question, index) => (
          <div className="admin-question" key={question.id}>
            <div className="row">
              <strong>Question {index + 1}</strong>
              <button className="danger" type="button" onClick={() => onRemoveQuestion(index)}>
                Remove
              </button>
            </div>
            <div className="field">
              <label htmlFor={`prompt-${question.id}`}>Prompt</label>
              <textarea
                id={`prompt-${question.id}`}
                value={question.prompt}
                onChange={(event) => onQuestionChange(index, { prompt: event.target.value })}
              />
            </div>
            <div className="split">
              <div className="field">
                <label htmlFor={`type-${question.id}`}>Question type</label>
                <select
                  id={`type-${question.id}`}
                  value={question.choice_type}
                  onChange={(event) =>
                    onQuestionChange(index, {
                      choice_type: event.target.value as QuizQuestion["choice_type"],
                      correct_answers: question.choice_type === "multiple" ? [question.correct_answers[0] ?? 0] : question.correct_answers
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
                    onQuestionChange(index, {
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
                onChange={(event) =>
                  onQuestionChange(index, {
                    options: event.target.value.split("\n").filter(Boolean)
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`explanation-${question.id}`}>Explanation</label>
              <textarea
                id={`explanation-${question.id}`}
                value={question.explanation}
                onChange={(event) => onQuestionChange(index, { explanation: event.target.value })}
              />
            </div>
          </div>
        ))}

        <div className="row">
          <button className="secondary" type="button" onClick={onAddQuestion}>
            Add question
          </button>
          <button className="primary" type="submit" disabled={isSupabaseConfigured && !isAdmin}>
            Save content
          </button>
        </div>
      </form>
    </main>
  );
}

function ProfilePanel({
  profile,
  progress,
  attempts
}: {
  profile: Profile | null;
  progress: LessonProgress;
  attempts: QuizAttempt[];
}) {
  return (
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
  );
}
