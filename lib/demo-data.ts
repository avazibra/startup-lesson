import type { LessonBundle, LessonProgress, LessonWithProgress, Profile, QuizAttempt } from "./types";

export const demoLessonBundle: LessonBundle = {
  course: {
    id: "demo-course",
    title: "Startup Fundamentals",
    description: "A practical course for early-stage founders."
  },
  lesson: {
    id: "demo-lesson-1",
    course_id: "demo-course",
    title: "How Great Startup Founders Think",
    description:
      "Learn the mindset, decision-making style, and execution habits of strong startup founders.",
    youtube_video_id: "jnqSezTbEb8",
    lesson_order: 1,
    passing_score: 4,
    is_published: true
  },
  questions: [
    {
      id: "q1",
      lesson_id: "demo-lesson-1",
      prompt: "Networking orqali startap qanday resurslarni jalb qila oladi?",
      choice_type: "single",
      options: [
        "Faqat moliyaviy investitsiya",
        "Birinchi mijozlar, investorlar, xodimlar va hamkorlar",
        "Faqat texnik bilim va kod",
        "Faqat ijtimoiy media kontent"
      ],
      correct_answers: [1],
      explanation:
        "Networking startap uchun birinchi mijozlar, investorlar, xodimlar va hamkorlarni topishga yordam beradi.",
      question_order: 1
    },
    {
      id: "q2",
      lesson_id: "demo-lesson-1",
      prompt: "LinkedIn profilingizni 10 soniyada tushunarli qilish uchun eng muhim element qaysi?",
      choice_type: "single",
      options: [
        "Ko'p sertifikatlar va kurslar ro'yxati",
        "Aniq sarlavha (headline) va professional foto",
        "Maksimal darajada to'ldirilgan tajriba bo'limi",
        "Ko'p ko'nikmalar (skills) qo'shish"
      ],
      correct_answers: [1],
      explanation: "Aniq headline va professional foto profil kim uchun va nima haqida ekanini tez anglatadi.",
      question_order: 2
    },
    {
      id: "q3",
      lesson_id: "demo-lesson-1",
      prompt: "Qaysi networking yondashuvi uzoq muddatda eng ko'p foyda keltiradi?",
      choice_type: "single",
      options: [
        "Imkon qadar tez pitch qilish va foyda so'rash",
        "Katta tadbirlarda ko'proq vizitka tarqatish",
        "Avval boshqalarga qiymat yaratib, keyin ishonch qurish",
        "Faqat yuqori lavozimli odamlar bilan tanishish"
      ],
      correct_answers: [2],
      explanation: "Uzoq muddatli networking avval qiymat yaratish, so'ng ishonch qurish orqali kuchayadi.",
      question_order: 3
    },
    {
      id: "q4",
      lesson_id: "demo-lesson-1",
      prompt: "Offline tadbirlarda samarali networking uchun to'g'ri tartib qaysi?",
      choice_type: "single",
      options: [
        "Tadbirda ko'proq odam bilan suhbatlashish, vizitka berish, unutish",
        "Avval kimlar borligini aniqlash, sifatli suhbat, 24 soat ichida aloqa",
        "Tadbir tugagandan keyin LinkedIn'da hammani qo'shish",
        "Faqat o'z sohasidagi odamlar bilan gaplashish"
      ],
      correct_answers: [1],
      explanation: "Tayyorgarlik, sifatli suhbat va tez follow-up offline networking natijasini oshiradi.",
      question_order: 4
    },
    {
      id: "q5",
      lesson_id: "demo-lesson-1",
      prompt: "'Connector' bo'lish strategiyasi nima uchun kuchli hisoblanadi? Ikkita to'g'ri javobni tanlang.",
      choice_type: "multiple",
      options: [
        "Ko'proq kontakt yig'ishning o'zi asosiy maqsad bo'lgani uchun",
        "Foydali odamlarni tanishtirish orqali ishonch va obro' yaratilgani uchun",
        "Qaytib keladigan yangi imkoniyatlar paydo bo'lgani uchun",
        "LinkedIn algoritmida doimiy yuqori ko'rinish kafolatlangani uchun"
      ],
      correct_answers: [1, 2],
      explanation: "Connector foydali tanishtiruvlar orqali ishonch, obro' va kelajakdagi imkoniyatlarni yaratadi.",
      question_order: 5
    }
  ]
};

export const demoProfile: Profile = {
  id: "demo-user",
  full_name: "Demo learner",
  email: "demo@startup.lesson",
  role: "admin"
};

export const emptyDemoProgress: LessonProgress = {
  user_id: demoProfile.id,
  lesson_id: demoLessonBundle.lesson.id,
  video_progress_percent: 0,
  video_completed: false,
  quiz_passed: false,
  completed_at: null
};

export const demoAttempts: QuizAttempt[] = [];

export const demoLessons: LessonWithProgress[] = [
  {
    ...demoLessonBundle.lesson,
    progress: emptyDemoProgress,
    is_locked: false
  },
  {
    id: "demo-lesson-2",
    course_id: "demo-course",
    title: "Finding Your First Customers",
    description: "A placeholder lesson for the next step in Startup Fundamentals.",
    youtube_video_id: "jnqSezTbEb8",
    lesson_order: 2,
    passing_score: 4,
    is_published: true,
    progress: null,
    is_locked: true
  }
];
