# TugmAI StudyMatch

StudyMatch is a mobile-first peer-learning prototype by TugmAI. It matches students through complementary strengths and learning gaps, then lets them continue in realtime buddy or peer-group spaces.

The project includes a runnable local demo without credentials and production integration points for Supabase Realtime, Supabase Storage, Supabase Auth, and Daily voice/video rooms.

## 1. Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project for production persistence
- A Daily account for production voice/video calls
- Optional Supabase CLI for migrations and Edge Functions

## 2. Install

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The local demo works without an `.env` file.

## 3. Supabase Project

The configured project URL is:

```text
https://puqnwypfdbzqxykamrvj.supabase.co
```

Create or use that project, then run the migration in `supabase/migrations/20260930000000_studymatch.sql`.

With the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref puqnwypfdbzqxykamrvj.supabase.co
npx supabase db push
```

The migration creates profiles, skills, user skills, matches, match requests, peer groups, conversations, members, messages, message reads, notifications, calls, call participants, indexes, triggers, Realtime publication entries, Storage buckets, and RLS policies.

## 4. Authentication

In Supabase Authentication, configure the site URL and redirect URLs for local development and the GitHub Pages URL. Email/password authentication is used by the app. The migration adds an `auth.users` trigger that creates a matching `profiles` row.

The signup metadata fields are passed into the profile trigger. Profile editing updates only the authenticated user's own row.

## 5. Realtime

The migration enables Realtime for `messages`, `match_requests`, `notifications`, and `calls`. The frontend subscribes to conversation-scoped message inserts and user-scoped request, notification, and call events. Typing indicators use Supabase Broadcast and a local `BroadcastChannel` fallback for the demo.

## 6. Storage

The migration creates private `avatars` and `chat-images` buckets. Chat image paths are stored as object paths in PostgreSQL, never as binary data. Storage policies require the authenticated user to belong to the target conversation.

Images are limited to common image formats and 8MB in the client.

## 7. RLS

RLS is enabled for every application table. Private conversation reads and message inserts require conversation membership. Profile updates require `auth.uid()` to equal the profile ID. Match results are read-only to normal clients. Service-role credentials are never used in the browser.

## 8. Daily Setup

Create a Daily domain and API key. Do not place the API key in a `VITE_` variable.

The secure Edge Function creates one private Daily room per call invite, creates a user-scoped meeting token, and returns the room URL to the authenticated participant.

Set the function secrets:

```bash
npx supabase secrets set DAILY_API_KEY=your_daily_api_key DAILY_DOMAIN=your-domain.daily.co SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
npx supabase functions deploy create-daily-room
```

The service-role key is only used inside the Edge Function to persist room details. Never commit it or expose it through Vite.

## 9. Environment Variables

Copy `.env.example` to `.env.local`:

```env
VITE_SUPABASE_URL=https://puqnwypfdbzqxykamrvj.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
VITE_DAILY_DOMAIN=your-domain.daily.co
VITE_BASE_PATH=./
```

The supplied `sb_publishable_...` key is suitable for `VITE_SUPABASE_ANON_KEY`. Do not use a service-role key in the frontend.

## 10. Demo Accounts and Data

The default Demo Login is local and needs no external service. It starts as Alex Johnson with 11 realistic demo students and calculated match data. Use the avatar menu to switch personas. This makes the request flow testable in two browser tabs:

1. Open one tab as Alex.
2. Find a Buddy and connect with Maria.
3. Switch the second tab to Maria from the avatar menu.
4. Accept the realtime-style request toast.
5. Open the created buddy conversation in both tabs.

To create actual Supabase Auth demo accounts, set a service-role key only in your local shell and run:

```bash
$env:SUPABASE_URL="https://puqnwypfdbzqxykamrvj.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
npm run seed:demo
```

The seed creates 11 accounts, profiles, and skills. Its default password is `StudyMatch!2026`; override it with `DEMO_PASSWORD` and change it before sharing the project.

## 11. Buddy Match Test

Use Alex's demo profile. The highest calculated match should be Maria because Maria's Java OOP and inheritance strengths cover Alex's gaps, while Alex's Database and SQL strengths cover Maria's gaps. Open the score breakdown to see the weighted calculation.

Connect does not create a room automatically. The recipient must accept the request first. Acceptance creates the private buddy conversation.

## 12. Peer Match Test

Open Match, switch to Peer group, and select Join Peer Group. The group algorithm searches combinations of at least three students and scores aggregate coverage of each member's weaknesses. It is not a same-subject grouping shortcut.

## 13. Chat Test

Open a Buddy or Peer space. Messages persist in local storage in demo mode and use Supabase Postgres plus Realtime when a configured, non-demo account is signed in. Open two tabs to test cross-tab realtime fallback or two authenticated sessions to test Supabase Realtime.

The composer supports timestamps, read state, typing indicators, date grouping, safe external links, and image sharing.

## 14. Image Sharing Test

Select the paperclip button, choose a PNG, JPEG, WebP, or GIF smaller than 8MB, preview/send it, and tap the image to open the fullscreen viewer. Supabase mode uploads to `chat-images`; demo mode uses a local preview so the flow is still demonstrable.

## 15. Voice and Video Test

Use the phone or camera button in a conversation. Without Daily credentials the app opens an integrated demo room with working controls and elapsed time. With the Edge Function deployed, both participants receive the same private Daily room and can use microphone, camera, screen sharing, participant grid, and leave controls.

To test incoming calls, open the same conversation in two demo tabs, switch personas, and start a call from one tab. The other tab receives an incoming-call overlay through `BroadcastChannel`. Supabase mode uses the `calls` Realtime table.

## 16. Build

```bash
npm run lint
npm run build
npm run preview
```

The build uses `HashRouter`, so it is compatible with static GitHub Pages hosting without server rewrites.

## 17. GitHub Pages

The repository includes `.github/workflows/deploy.yml`. Enable GitHub Pages with **GitHub Actions** as the source, then add these repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DAILY_DOMAIN`

Push to `main`. The workflow installs dependencies, builds the Vite app, uploads `dist`, and deploys the static frontend.

## 18. Architecture

```text
React + TypeScript + Vite + Tailwind
        |
        +-- Supabase Auth
        +-- Supabase PostgreSQL + RLS
        +-- Supabase Realtime + Broadcast
        +-- Supabase Storage
        +-- Weighted matching engine
        +-- Daily Edge Function
              |
              +-- Voice
              +-- Video
```

The matching engine is lightweight and structured. It does not call a generative AI API for compatibility calculations, so cost remains predictable as the student population grows.
