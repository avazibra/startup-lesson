# Startup Lesson MVP

This is the next version of the startup academy lesson prototype. It is now a Next.js app with:

- Learner lesson flow
- YouTube video completion gate
- Quiz pass/fail logic
- Registered user profile page
- Quiz attempt history
- Admin content editor
- Supabase-ready auth and database storage

The app still works in demo mode when Supabase environment variables are missing.

## Routes

- `/` - learner lesson flow
- `/profile` - learner progress and quiz attempt history
- `/admin` - admin-only content editor

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql`.
4. Go to `Project Settings -> API`.
5. Copy the project URL and anon key.
6. Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

For simpler MVP testing, use email/password auth:

- `Authentication -> Providers -> Email`: enabled
- Optional during testing: turn off email confirmation so new accounts can sign in immediately

## Make Yourself Admin

After signing in once, run this in Supabase SQL editor with your email:

```sql
update public.profiles
set role = 'admin'
where email = 'your@email.com';
```

## Vercel Setup

Add these environment variables to the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then redeploy the project.

## Content Model

The MVP stores:

- Courses
- Lessons
- Quiz questions
- User profiles
- Video progress
- Quiz attempts

Videos remain hosted on YouTube. The app only stores the YouTube video ID.
