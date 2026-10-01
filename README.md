# TugmAI StudyMatch

StudyMatch is a mobile-first peer-learning prototype by TugmAI. It matches students through complementary strengths and learning gaps, then lets them continue in realtime buddy or peer-group spaces.

The project includes a runnable local demo without credentials and a production random-meet flow for Supabase Auth, Supabase Postgres, Supabase Realtime, Supabase Storage, and Daily voice/video rooms.

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

Create or use that project, then apply all migrations in `supabase/migrations/`.

With the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref puqnwypfdbzqxykamrvj
npx supabase db push
```

The migrations create profiles, skills, user skills, matches, match requests, peer groups, conversations, members, messages, message reads, notifications, calls, call participants, random queue and encounter tables, rule acceptances, blocks, reports, indexes, triggers, Realtime publication entries, Storage buckets, and RLS policies.

The messaging reliability migration also consolidates existing duplicate one-to-one conversations, preserves their messages, and adds secure history clearing and read-receipt RPCs.

## 4. Authentication

In Supabase Authentication, configure the site URL and redirect URLs for local development and `https://johnbenedictjavier.github.io/videocall/`. If Pages is still serving the committed fallback artifact, also allow `https://johnbenedictjavier.github.io/videocall/dist/`. Email/password authentication is used by the app. The migration adds an `auth.users` trigger that creates a matching `profiles` row.

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
npx supabase secrets set --project-ref puqnwypfdbzqxykamrvj DAILY_API_KEY=your_daily_api_key DAILY_DOMAIN=your-domain.daily.co SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
npx supabase functions deploy create-daily-room --project-ref puqnwypfdbzqxykamrvj
```

The service-role key is only used inside the Edge Function to persist room details. Never commit it or expose it through Vite.
The repository also includes `.github/workflows/deploy-supabase-function.yml`; add a `SUPABASE_ACCESS_TOKEN` repository secret to deploy this function automatically when its source changes. Daily and service-role values stay in Supabase Function Secrets.

## 9. Environment Variables

Copy `.env.example` to `.env.local`:

```env
VITE_SUPABASE_URL=https://puqnwypfdbzqxykamrvj.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
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

## 11. Random Meet Test

The production random flow uses a database-backed queue so two authenticated phones can be matched without sending requests. Apply both migrations, deploy the Daily function, and configure the Daily secrets before testing.

1. Open the deployed HTTPS app on two phones.
2. Sign in with two different Supabase accounts. Demo Login is local to one browser and cannot match across phones.
3. Open **Meet**, choose **Study Buddy** or **Peer**, select voice or video, and accept the 18+ rules.
4. Study Buddy pairs exactly two users. Peer rooms open at three users and accept up to five; a full room does not accept a sixth user.
5. **Stop** or `Esc` leaves matching. **Next** or `Right Arrow` ends the encounter and starts another search.
6. When a call ends, each other participant can receive a 1–5 rating; individual ratings can be skipped.

The queue is implemented with a transactional Supabase RPC for the initial release. A Redis/WebSocket gateway can replace it later if traffic requires higher matchmaking throughput.

## 12. Buddy Match Test

Use Alex's demo profile. The highest calculated match should be Maria because Maria's Java OOP and inheritance strengths cover Alex's gaps, while Alex's Database and SQL strengths cover Maria's gaps. Open the score breakdown to see the weighted calculation.

Connect does not create a room automatically. The recipient must accept the request first. Acceptance creates the private buddy conversation.

## 13. Peer Match Test

Open Match, switch to Peer group, and select Join Peer Group. The group algorithm searches combinations of at least three students and scores aggregate coverage of each member's weaknesses. It is not a same-subject grouping shortcut.

## 14. Chat Test

Open a Buddy or Peer space. Messages persist in local storage in demo mode and use Supabase Postgres plus Realtime when a configured, non-demo account is signed in. Open two tabs to test cross-tab realtime fallback or two authenticated sessions to test Supabase Realtime.

The composer supports timestamps, read state, typing indicators, date grouping, safe external links, and image sharing.

## 15. Image Sharing Test

Select the paperclip button, choose a PNG, JPEG, WebP, or GIF smaller than 8MB, preview/send it, and tap the image to open the fullscreen viewer. Supabase mode uploads to `chat-images`; demo mode uses a local preview so the flow is still demonstrable.

## 16. Voice and Video Test

Use the phone or camera button in a conversation for the original StudyMatch call flow. Meet opens a private Daily room after the selected Buddy or Peer room is matched. Demo Login still opens a local simulated room for product exploration, but it cannot match across phones. Authenticated users must have the Edge Function and Daily secrets configured; they receive separate user tokens and can use microphone, camera, screen sharing, safety controls, and leave controls.

To test incoming calls, open the same conversation in two demo tabs, switch personas, and start a call from one tab. The other tab receives an incoming-call overlay through `BroadcastChannel`. Supabase mode uses the `calls` Realtime table. Conversation calls also show the post-call rating step.

## 17. Build

```bash
npm run lint
npm run build
npm run preview
```

The build uses `HashRouter`, so it is compatible with static GitHub Pages hosting without server rewrites.

## 18. GitHub Pages

The repository includes `.github/workflows/deploy.yml`, which builds and deploys the artifact through GitHub Actions. In repository Settings > Pages, select **GitHub Actions** as the source. The root page still redirects to a committed `dist` artifact when Pages is configured for branch-root hosting.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
Push to `main`. The workflow installs dependencies, builds the Vite app, and deploys `dist`. Branch-based Pages hosting requires the generated artifact fallback to be committed as well.

## 19. Architecture

```text
React + TypeScript + Vite + Tailwind
        |
        +-- Supabase Auth
        +-- Supabase PostgreSQL + RLS
        +-- Supabase Realtime + Broadcast
        +-- Supabase Storage
         +-- Random queue and encounter RPCs
        +-- Daily Edge Function
              |
              +-- Voice
              +-- Video
```

The matching engine is lightweight and structured. It does not call a generative AI API for compatibility calculations, so cost remains predictable as the student population grows.
