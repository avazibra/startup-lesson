"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { COURSE_ID, DEFAULT_LESSON_ID } from "@/lib/constants";
import { demoLessonBundle, demoProfile } from "@/lib/demo-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Lesson, LessonBundle, Profile, QuizQuestion } from "@/lib/types";

export default function AdminPage() {
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [draft, setDraft] = useState<LessonBundle>(demoLessonBundle);
  const [lessons, setLessons] = useState<Lesson[]>([demoLessonBundle.lesson]);
  const [message, setMessage] = useState("");
  const [activeEditorTab, setActiveEditorTab] = useState<"lesson" | "quiz">("lesson");
  const isAdmin = profile?.role === "admin";
  const isUnsavedLesson = !lessons.some((lesson) => lesson.id === draft.lesson.id);

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

    const [{ data: course }, { data: lesson }, { data: questions }, { data: courseLessons }] = await Promise.all([
      supabase.from("courses").select("*").eq("id", COURSE_ID).single(),
      supabase.from("lessons").select("*").eq("id", DEFAULT_LESSON_ID).single(),
      supabase.from("quiz_questions").select("*").eq("lesson_id", DEFAULT_LESSON_ID).order("question_order"),
      supabase.from("lessons").select("*").eq("course_id", COURSE_ID).order("lesson_order")
    ]);

    if (course && lesson && questions) {
      setDraft({ course, lesson, questions: questions as QuizQuestion[] });
    }

    if (courseLessons) {
      setLessons(courseLessons as Lesson[]);
    }
  }

  async function selectLesson(lessonId: string) {
    if (!supabase) return;

    const [{ data: lesson }, { data: questions }] = await Promise.all([
      supabase.from("lessons").select("*").eq("id", lessonId).single(),
      supabase.from("quiz_questions").select("*").eq("lesson_id", lessonId).order("question_order")
    ]);

    if (lesson && questions) {
      setDraft((current) => ({
        ...current,
        lesson,
        questions: questions as QuizQuestion[]
      }));
    }
  }

  function createLessonDraft() {
    const nextOrder = lessons.length + 1;
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      lesson: {
        id,
        course_id: COURSE_ID,
        title: `Lesson ${nextOrder}`,
        description: "Describe what learners will understand after this lesson.",
        youtube_video_id: "jnqSezTbEb8",
        lesson_order: nextOrder,
        passing_score: 4,
        is_published: false
      },
      questions: [
        {
          id: crypto.randomUUID(),
          lesson_id: id,
          prompt: "New question",
          choice_type: "single",
          options: ["Option A", "Option B", "Option C", "Option D"],
          correct_answers: [0],
          explanation: "Explain why the correct answer is right.",
          question_order: 1
        }
      ]
    }));
    setActiveEditorTab("lesson");
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

  function updateQuestionType(index: number, choiceType: QuizQuestion["choice_type"]) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => {
        if (questionIndex !== index) return question;
        const firstCorrect = question.correct_answers[0] ?? 0;
        return {
          ...question,
          choice_type: choiceType,
          correct_answers: choiceType === "single" ? [firstCorrect] : question.correct_answers.length ? question.correct_answers : [0]
        };
      })
    }));
  }

  function updateQuestionOption(questionIndex: number, optionIndex: number, value: string) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex
          ? {
              ...question,
              options: question.options.map((option, currentOptionIndex) => (currentOptionIndex === optionIndex ? value : option))
            }
          : question
      )
    }));
  }

  function addQuestionOption(questionIndex: number) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex
          ? {
              ...question,
              options: [...question.options, `Option ${question.options.length + 1}`]
            }
          : question
      )
    }));
  }

  function removeQuestionOption(questionIndex: number, optionIndex: number) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length <= 2) return question;

        const options = question.options.filter((_option, currentOptionIndex) => currentOptionIndex !== optionIndex);
        const correctAnswers = question.correct_answers
          .filter((answerIndex) => answerIndex !== optionIndex)
          .map((answerIndex) => (answerIndex > optionIndex ? answerIndex - 1 : answerIndex));

        return {
          ...question,
          options,
          correct_answers: correctAnswers.length ? correctAnswers : [0]
        };
      })
    }));
  }

  function toggleCorrectAnswer(questionIndex: number, optionIndex: number) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        if (question.choice_type === "single") {
          return { ...question, correct_answers: [optionIndex] };
        }

        const isSelected = question.correct_answers.includes(optionIndex);
        const correctAnswers = isSelected
          ? question.correct_answers.filter((answerIndex) => answerIndex !== optionIndex)
          : [...question.correct_answers, optionIndex];

        return {
          ...question,
          correct_answers: correctAnswers.length ? correctAnswers.sort((a, b) => a - b) : [optionIndex]
        };
      })
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

    const { data: refreshedLessons } = await supabase.from("lessons").select("*").eq("course_id", COURSE_ID).order("lesson_order");
    if (refreshedLessons) {
      setLessons(refreshedLessons as Lesson[]);
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

      <main className="admin-grid">
        <aside className="admin-sidebar stack">
          <section className="card card-pad">
            <div className="row">
              <div>
                <p className="eyebrow">Lessons</p>
                <h3>Course structure</h3>
              </div>
            </div>
            <div className="lesson-list">
              {isUnsavedLesson && (
                <div className="lesson-row active unsaved" aria-live="polite">
                  <span>
                    <strong>
                      {draft.lesson.lesson_order}. {draft.lesson.title}
                    </strong>
                    <span>Unsaved draft</span>
                  </span>
                </div>
              )}
              {lessons.map((lesson) => (
                <button
                  className={`lesson-row ${lesson.id === draft.lesson.id ? "active" : ""}`}
                  key={lesson.id}
                  type="button"
                  onClick={() => selectLesson(lesson.id)}
                >
                  <span>
                    <strong>
                      {lesson.lesson_order}. {lesson.title}
                    </strong>
                    <span>{lesson.is_published ? "Published" : "Draft"}</span>
                  </span>
                </button>
              ))}
            </div>
            <button className="secondary full-width" type="button" onClick={createLessonDraft}>
              New lesson
            </button>
          </section>
        </aside>

        <section className="admin-main stack">
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
            <form className="card card-pad form-grid admin-form" onSubmit={saveContent}>
              <div className="editor-hero">
                <div>
                  <p className="eyebrow">Content management</p>
                  <h2>Maintain lesson content</h2>
                  <p className="muted">Choose a lesson, edit its video and quiz, then save the changes.</p>
                </div>
                <span className={`pill ${isAdmin ? "success" : "warning"}`}>{isAdmin ? "Admin access" : "Admin required"}</span>
              </div>

              <div className="admin-subtabs" aria-label="Content editor sections">
                <button
                  aria-pressed={activeEditorTab === "lesson"}
                  className={activeEditorTab === "lesson" ? "active" : ""}
                  type="button"
                  onClick={() => setActiveEditorTab("lesson")}
                >
                  Lesson
                </button>
                <button
                  aria-pressed={activeEditorTab === "quiz"}
                  className={activeEditorTab === "quiz" ? "active" : ""}
                  type="button"
                  onClick={() => setActiveEditorTab("quiz")}
                >
                  Quiz
                </button>
              </div>

              {activeEditorTab === "lesson" && (
              <div className="form-section">
                <div className="section-heading">
                  <div>
                    <h3>Lesson details</h3>
                    <p className="muted">Set the learner-facing title, video, order, and publish state.</p>
                  </div>
                  {isUnsavedLesson && <span className="pill warning">Unsaved draft</span>}
                </div>

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

                <div className="detail-grid">
                  <div className="field">
                    <label htmlFor="lesson-order">Lesson order</label>
                    <input
                      id="lesson-order"
                      min="1"
                      type="number"
                      value={draft.lesson.lesson_order}
                      onChange={(event) => updateLesson({ lesson_order: Number(event.target.value) })}
                    />
                  </div>
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
              </div>
              )}

              {activeEditorTab === "quiz" && (
              <div className="form-section">
                <div className="section-heading">
                  <div>
                    <h3>Quiz questions</h3>
                    <p className="muted">Add questions, accepted answers, and explanations for failed attempts.</p>
                  </div>
                  <button className="secondary" type="button" onClick={addQuestion}>
                    Add question
                  </button>
                </div>

                <div className="question-stack">
                  {draft.questions.map((question, index) => (
                    <div className="admin-question" key={question.id}>
                      <div className="row">
                        <div>
                          <strong>Question {index + 1}</strong>
                          <p className="muted">{question.choice_type === "multiple" ? "Multiple choice" : "Single choice"}</p>
                        </div>
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
                      <div className="question-grid">
                        <div className="field">
                          <label htmlFor={`type-${question.id}`}>Question type</label>
                          <select
                            id={`type-${question.id}`}
                            value={question.choice_type}
                            onChange={(event) => updateQuestionType(index, event.target.value as QuizQuestion["choice_type"])}
                          >
                            <option value="single">Single choice</option>
                            <option value="multiple">Multiple choice</option>
                          </select>
                        </div>
                        <div className="answer-summary" aria-live="polite">
                          <span>Correct answer</span>
                          <strong>{formatCorrectAnswerSummary(question)}</strong>
                        </div>
                      </div>

                      <div className="field">
                        <div className="option-editor-heading">
                          <span id={`options-label-${question.id}`}>Options and correct answer</span>
                          <button className="secondary compact-button" type="button" onClick={() => addQuestionOption(index)}>
                            Add option
                          </button>
                        </div>
                        <div className="answer-options" role="group" aria-labelledby={`options-label-${question.id}`}>
                          {question.options.map((option, optionIndex) => (
                            <div className="answer-option-row" key={`${question.id}-${optionIndex}`}>
                              <label className="correct-control">
                                <input
                                  checked={question.correct_answers.includes(optionIndex)}
                                  name={`correct-${question.id}`}
                                  type={question.choice_type === "single" ? "radio" : "checkbox"}
                                  onChange={() => toggleCorrectAnswer(index, optionIndex)}
                                />
                                <span>Correct</span>
                              </label>
                              <input
                                aria-label={`Option ${optionIndex + 1}`}
                                value={option}
                                onChange={(event) => updateQuestionOption(index, optionIndex, event.target.value)}
                              />
                              <button
                                aria-label={`Remove option ${optionIndex + 1}`}
                                className="danger compact-button"
                                disabled={question.options.length <= 2}
                                type="button"
                                onClick={() => removeQuestionOption(index, optionIndex)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
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
                </div>
              </div>
              )}

              <div className="form-actions">
                <div className="form-actions-meta">
                  <strong>{activeEditorTab === "lesson" ? "Lesson setup" : "Quiz setup"}</strong>
                  <span>{activeEditorTab === "lesson" ? "Editing lesson details" : `${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}`}</span>
                </div>
                <button className="secondary" type="button" onClick={createLessonDraft}>
                  New lesson
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
        </section>
      </main>
    </div>
  );
}

function formatCorrectAnswerSummary(question: QuizQuestion) {
  const labels = question.correct_answers
    .map((answerIndex) => question.options[answerIndex])
    .filter(Boolean);

  return labels.length ? labels.join(", ") : "Choose an answer";
}
