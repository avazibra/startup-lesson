export type ChoiceType = "single" | "multiple";
export type ProfileRole = "admin" | "student";

export type Course = {
  id: string;
  title: string;
  description: string | null;
  created_at?: string;
};

export type Lesson = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  youtube_video_id: string;
  lesson_order: number;
  passing_score: number;
  is_published: boolean;
  provides_certificate: boolean;
  archived_at?: string | null;
  created_at?: string;
};

export type QuizQuestion = {
  id: string;
  lesson_id: string;
  prompt: string;
  choice_type: ChoiceType;
  options: string[];
  correct_answers: number[];
  explanation: string;
  question_order: number;
  created_at?: string;
};

export type LessonProgress = {
  id?: string;
  user_id: string;
  lesson_id: string;
  video_progress_percent: number;
  video_completed: boolean;
  quiz_passed: boolean;
  completed_at: string | null;
  updated_at?: string;
};

export type QuizAttempt = {
  id?: string;
  user_id: string;
  lesson_id: string;
  score: number;
  total_questions: number;
  passed: boolean;
  answers: Record<string, number[]>;
  created_at?: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: ProfileRole;
  created_at?: string;
};

export type Certificate = {
  id: string;
  user_id: string;
  lesson_id: string;
  course_id: string;
  recipient_name: string;
  lesson_title: string;
  course_title: string;
  verification_code: string;
  issued_at: string;
};

export type LessonBundle = {
  course: Course;
  lesson: Lesson;
  questions: QuizQuestion[];
};

export type LessonWithProgress = Lesson & {
  progress?: LessonProgress | null;
  is_locked?: boolean;
};
