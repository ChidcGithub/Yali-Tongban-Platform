<div align="center">

<img src="./public/images/emblem.png" alt="" height="72" />

# Yali Youth League Platform

[![version](https://img.shields.io/badge/version-2.6.0.0--beta-blue?style=flat-square)]()
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square&logo=node.js&logoColor=white)]()
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-Functions-f38020?style=flat-square&logo=cloudflare&logoColor=white)]()
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS%20%7C%20CSS%20%7C%20HTML-f7df1e?style=flat-square)]()

**A comprehensive school management platform for the Yali High School Youth League Committee.**

[Features](#features) · [Architecture](#architecture) · [Security](#security) · [Project Structure](#project-structure) · [Quick Start](#quick-start) · [Deployment](#deployment) · [API Overview](#api-overview) · [Achievements](#achievement-system) · [Personalization](#personalization) · [Acknowledgements](#acknowledgements)

</div>

> [!NOTE]
> This is a demonstration project and is not the official Yali High School platform.

---

## Features

### Maintenance Requests

Users can submit facility repair tickets and track their progress in real time.

- **Categorized submission**: Select issue type (desk/chair, lighting, multimedia, doors/windows, other)
- **Image evidence**: Upload photos to help identify the problem
- **Status workflow**: Pending → In Progress → Resolved, with a traceable update log
- **Admin assignment**: Admins assign handlers and add processing notes
- **Ticket comments**: Users and admins communicate through ticket comments

### Announcements

A publishing platform for notices and activity announcements with rich text and images.

- **Rich media**: Multiple image uploads with inline display
- **Review workflow**: Submissions enter a pending state; admins approve before publication
- **Comment system**: Users can comment, edit, and delete their own comments
- **Categories**: Announcements can be organized by category

### Feed

A real-time activity feed for Youth League updates.

- **Real-time timeline**: Chronological feed of activities
- **Image support**: Posts can include images
- **Cursor pagination**: Infinite scroll based on cursor-based pagination
- **Comments**: Comment on feed messages

### Polls

Create and participate in polls with flexible question types.

- **Question types**: Single choice, multiple choice, and subjective (open-ended) questions
- **Image options**: Poll options can include images
- **Anonymous mode**: Optional anonymity for voters
- **CSV export**: Export poll results as CSV files
- **Anti-spam**: Turnstile CAPTCHA protection on voting

### Finance

Income/expense tracking and reimbursement management.

- **Transaction records**: Per-entry tracking of income and expenses
- **Monthly summaries**: Auto-generated monthly charts and trends
- **Tag filtering**: Filter by type (income/expense) and tags
- **Reimbursement workflow**: Submit → Approve → Mark complete
- **Department isolation**: Non-admins only see their own department's records

### Hall Booking

Visual timeline booking and review system for the school auditorium.

- **Timeline selection**: Visual interface to pick available time slots
- **Conflict detection**: Automatic conflict detection with adjustment suggestions
- **Review workflow**: Bookings require reviewer approval
- **Withdrawal**: Users can withdraw pending bookings
- **Gantt chart**: Conflicts displayed in a Gantt chart during review

### Duty Attendance

A two-person duty sign-in/out system with automatic scoring.

- **Dual sign-in**: Each shift has two duty staff members who sign in and out independently
- **Auto scoring**: Scores calculated based on sign-in duration (calculated on sign-out)
- **Schedule generation**: Auto-generates 60 weekdays of schedules (skipping weekends)
- **Auto-absent marking**: System automatically marks absences and deducts points after a shift ends
- **CSV export**: Export schedules and attendance records
- **Score management**: Admins can manually adjust scores or cancel records

### Review System

Image and announcement moderation.

- **Image moderation**: User-uploaded images enter pending review; admins approve before public visibility
- **Announcement review**: New announcements require admin approval before publication
- **Review notes**: Rejections include feedback for the submitter
- **Status tracking**: Submitters can check review progress

### Member Management

User registration, role assignment, and batch management.

- **Role hierarchy**: Public → Member → Officer → Teacher → Admin → Owner
  - `public`: Duty dashboard only
  - `member`: Access to most features
  - `officer`: Officer-level permissions
  - `teacher`: Teacher permissions (finance, duty management)
  - `admin`: Full admin panel access
  - `owner`: Super admin (site owner)
- **Registration approval**: New users require admin approval
- **Batch import**: Three-phase import (validation → batch dedup → concurrent bcrypt hashing) for fast bulk user creation
- **Department management**: 8 preset Youth League departments with user assignment
- **Password reset**: Admins can reset any user's password

### Achievement System

34 hidden achievements unlocked through specific user actions.

| Category | Example Achievements |
|---|---|
| Discovery | Night Owl, Early Bird, Time Traveler, Archaeologist |
| Interaction | High Five!, Intruder, Screenshot Taker, Developer |
| Accumulation | Chatty, Commenter, Proposer, Regular Reader |
| Time-based | Perfect Attendance, Moonlighter, Anniversary, Pigeon |
| Easter Eggs | Color Freak, OCD, Did Anyone Actually Read This? |

See the [Achievement System](#achievement-system) section for complete details.

### Personalization

Users can customize the interface appearance and interaction effects.

- **Theme**: Light mode, dark mode, system-following
- **Theme style**: Material (default Material 3), Newspaper (modern newspaper style — Gothic headers + Georgia serif, pure black/white/gray; early-access feature, requires admin invitation)
- **Accent colors**: 6 accent colors (blue, green, purple, orange, red, cyan)
- **Font size**: Three levels (small, medium, large)
- **Super Graphic**: Particle effects, card tilt, fireworks, confetti

### Feedback

Users can submit suggestions and bug reports.

- **Submission**: Fill in feedback content for admin review
- **Admin management**: Admins can view and delete feedback entries

---

## Architecture

### Frontend Architecture

| Layer | Technology | Details |
|---|---|---|
| **Core** | Vanilla HTML5 + CSS3 + JavaScript (ES Modules) | No framework, zero build step |
| **Design System** | Material 3 (Material You) | Dynamic theming via CSS custom properties |
| **Routing** | Multi-Page Application (MPA) | 20+ static HTML pages served by Cloudflare Pages |
| **Navigation** | Fixed top nav + adaptive bottom capsule bar | Usage-frequency sorted, scroll hide/show |
| **Caching** | localStorage LRU cache | 3-day TTL with hash-based change detection (`/api/sync`) |
| **Animation** | View Transitions API | Cross-page smooth transitions |
| **Icons** | Inline SVGs (~50, Lucide-style) | Zero external requests |

### Backend Architecture

| Layer | Technology | Details |
|---|---|---|
| **Runtime** | Cloudflare Workers (ES Modules) | Edge computing, global distribution |
| **Routing** | `[[path]].js` catch-all pattern | Matches ~106 API route endpoints |
| **Auth** | JWT (`jose` library) | Stateless auth via HTTP-only cookies |
| **Passwords** | bcryptjs (10 rounds) | Password hashing and verification |
| **Database** | Cloudflare D1 (SQLite) | Auto-replication, strong consistency |
| **Storage** | Cloudflare R2 | Image uploads, S3-compatible API |
| **CAPTCHA** | Cloudflare Turnstile | Frontend widget + server-side verification |
| **Security** | CSP headers + Rate Limiting | Token bucket algorithm, per-IP limits |

### Data Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Browser     │    │  Cloudflare  │    │  Workers Runtime  │    │   D1 / R2        │
│  fetch()      │───→│  CDN Edge    │───→│  JWT Verify →     │───→│  SQL / Object    │
│  Cache Lookup │    │  (Cache/Gzip)│    │  Router → Handler  │    │  Storage         │
└──────────────┘    └──────────────┘    └──────────────────┘    └──────────────────┘
       ↑                                       │
       └─────────── Cache Response ─────────────┘
                      (localStorage Sync)
```

---

## Security

| Layer | Measures |
|---|---|
| **Authentication** | JWT (`jose`), HTTP-only + Secure + SameSite=Strict Cookie |
| **Authorization** | 6-level role hierarchy (public < member < officer < teacher < admin < owner) |
| **CAPTCHA** | Turnstile protection on login, registration, voting, and finance |
| **XSS Prevention** | `escapeHtml()` text escaping, `attrEscape()` attribute escaping, `data-*` attributes + event delegation |
| **SQL Injection** | D1 parameterized queries (`?` placeholder binding) |
| **Rate Limiting** | Token bucket algorithm per IP address |
| **Transport** | CSP security headers, CORS whitelist, HSTS |
| **Idle Timeout** | Auto-logout after 20 minutes of inactivity, warning at 18 minutes |
| **Password Security** | bcryptjs (10 salt rounds), min 6 / max 50 characters |
| **Data Isolation** | Role-based access control with department-level visibility |

> [!TIP]
> All user input is handled via server-side parameterized queries. XSS protection is applied at the rendering layer using `escapeHtml` + `attrEscape` for double coverage.

---

## Project Structure

```
├── functions/api/                     Backend API (18 domain modules)
│   ├── [[path]].js                     Router entry (~106 endpoints)
│   ├── _utils.js                       Shared utilities (DB init, JWT, bcrypt, rate limiting)
│   ├── auth.js                         Authentication (login, register, JWT, profile)
│   ├── admin.js                        Admin panel (members, roles, batch ops, settings)
│   ├── announcements.js                Announcements CRUD, review, images
│   ├── issues.js                       Maintenance tickets CRUD, status
│   ├── polls.js                        Polls CRUD, voting, CSV export
│   ├── finance.js                      Finance CRUD, reimbursement
│   ├── halls.js                        Hall booking CRUD, conflict detection, review
│   ├── duty.js                         Duty attendance (staff, schedule, sign-in, scores)
│   ├── reviews.js                      Image/announcement review
│   ├── feed.js                         Feed messages, comments
│   ├── comments.js                     Comments CRUD
│   ├── activities.js                   Activities CRUD, volunteer signup
│   ├── achievements.js                 Achievement unlock, count checks
│   ├── banner.js                       Banner data
│   ├── settings.js                     Public settings (site status)
│   ├── sync.js                         Data sync (hash change detection)
│   ├── feedback.js                     Feedback submission, management
│
├── public/                             Frontend static files
│   ├── index.html                      Splash page (auto-redirects after 1.8s)
│   ├── services.html                   Service panel (tickets, banner, quick actions)
│   ├── login.html                      Login/register (Turnstile)
│   ├── moment.html                     Feed (infinite scroll)
│   ├── announcements.html              Announcements list
│   ├── announcement.html               Announcement detail + comments
│   ├── polls.html                      Polls list
│   ├── poll.html                       Poll detail + voting (Turnstile)
│   ├── finance.html                    Finance dashboard (records, charts, reimbursement)
│   ├── activities.html                 Activities + volunteer signup
│   ├── duty.html                       Duty attendance (no login required)
│   ├── duty-admin.html                 Duty admin (staff, schedule, scores)
│   ├── admin.html                      Admin panel (members, registrations, danger zone)
│   ├── settings.html                   User settings
│   ├── personalize.html                Personalization (theme, colors, effects)
│   ├── feedback.html                   Feedback form
│   ├── about.html                      About (system status, easter egg)
│   ├── changelog.html                  Changelog
│   ├── thanks.html                     Open-source credits
│   ├── 404.html                        404 page (with intruder achievement)
│   ├── 410.html                        410 page (deleted features)
│   ├── debug.html                      Debug page
│   │
│   ├── css/
│   │   ├── style.css                   Global style entry (@import theme files)
│   │   ├── graphic.css                 Super Graphic effects CSS
│   │   ├── material/                   Material 3 theme (default)
│   │   │   ├── style.css               Theme entry (@import tokens/base/components/pages)
│   │   │   ├── theme-light.css         Light theme Design Tokens
│   │   │   ├── theme-dark.css          Dark theme Design Tokens and component overrides
│   │   │   ├── base/                   Base styles (reset, typography, utilities)
│   │   │   ├── components/             Component styles (buttons, cards, forms, nav, modals)
│   │   │   └── pages/                  Page styles (duty, personalization, finance, etc.)
│   │   └── newspaper/                  Newspaper theme (optional)
│   │       ├── style.css               Theme entry (@import tokens/base/components/pages)
│   │       ├── theme-tokens.css        .theme-newspaper variable overrides (B/W/gray, Gothic, sharp)
│   │       ├── base/                   Paper-texture background, underlined links, double-rule dividers
│   │       ├── components/             Masthead nav, hairline cards, sharp buttons, Gothic badges
│   │       └── pages/                  Asymmetric headlines, announcement banners, mobile adaptation
│   │
│   ├── js/
│   │   ├── api.js                      Core API client, icons, modals, achievements, personalization
│   │   ├── nav.js                      Navigation, capsule bar, usage sorting
│   │   ├── auth.js                     Auth guards (requireAuth / requireAdmin / requireMember)
│   │   ├── utils.js                    Utilities (time format, HTML escape, class validation)
│   │   ├── services.js                 Services page logic
│   │   ├── moment.js                   Feed page logic (cursor pagination, comments)
│   │   ├── announcements.js            Announcements list logic
│   │   ├── announcement.js             Announcement detail logic
│   │   ├── polls.js                    Polls list logic
│   │   ├── poll.js                     Poll detail logic
│   │   ├── finance.js                  Finance page (filtering, charts, modals)
│   │   ├── activities.js              Activities page (volunteer signup, CRUD)
│   │   ├── duty.js                     Duty dashboard (state machine)
│   │   ├── duty-admin.js               Duty admin (CRUD, schedule generation)
│   │   ├── admin.js                    Admin panel (members, registrations, settings)
│   │   ├── settings.js                 User settings logic
│   │   ├── feedback.js                 Feedback form logic
│   │   ├── changelog-data.js           Changelog data (version history)
│   │   ├── lightbox.js                 Image lightbox (zoom, pan, keyboard nav)
│   │   └── graphic.js                  Super Graphic particle engine (fireworks, confetti, card tilt)
│   │
│   └── images/
│       ├── emblem.png                  Yali school emblem (logo)
│       ├── league-emblem.png           Communist Youth League emblem
│       └── the-office.png              "The Office" easter egg
│
├── wrangler.toml                       Cloudflare Pages config (D1 binding, env vars, routes)
├── package.json                        npm config (dependencies, scripts)
├── setup.ps1                           One-click deployment script (PowerShell 7+)
└── LICENSE                             AGPL-3.0
```

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20 LTS or later
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Git

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/ChidcGithub/Yali-Tongban-Platform.git
cd Yali-Tongban-Platform

# 2. Install dependencies
npm install

# 3. Log in to Cloudflare (for D1 database access)
npx wrangler login

# 4. Start the local dev server
npm run dev
```

> [!TIP]
> During local development, D1 and R2 use wrangler's simulation layer — no need to create real remote resources to start developing.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server (with hot reload) |
| `npm run deploy` | Build and deploy to Cloudflare Pages |
| `npm run db:init` | Manually initialize the database (handled automatically by the deploy script) |

---

## Deployment

### Manual Deployment

```bash
# Log in to Cloudflare
npx wrangler login

# Deploy to Cloudflare Pages
npm run deploy
```

### One-Click Setup

The project includes a `setup.ps1` PowerShell script for new project initialization:

```powershell
# Run from the project root
.\setup.ps1
```

The script automates the following:

1. Creates the D1 database `yali-tongban-db`
2. Creates the R2 bucket `yali-tongban-images`
3. Generates and sets the `JWT_SECRET` environment variable
4. Initializes all database tables
5. Creates a default admin account
6. Deploys to Cloudflare Pages

### Environment Variables

These must be set in the Cloudflare Pages dashboard (Settings → Environment variables):

| Variable | Description | Required |
|---|---|---|
| `JWT_SECRET` | JWT signing key (any long random string) | Yes |
| `TURNSTILE_SECRET` | Cloudflare Turnstile server secret key | Yes |
| `R2_BUCKET` | R2 bucket name | Yes |
| `R2_ACCESS_KEY_ID` | R2 API access key ID | Yes |
| `R2_SECRET_ACCESS_KEY` | R2 API access key secret | Yes |

> [!IMPORTANT]
> Never commit these secrets to version control. Use variable names in `wrangler.toml` and set actual values in the Cloudflare dashboard.

### Database

The D1 database is automatically initialized by `initDB()` in `functions/api/_utils.js` on the first request. It creates:

- `users` table (with `achievements` JSON column)
- Business tables for announcements, issues, polls, finance, comments, chat messages
- 5 duty attendance tables (`duty_staff`, `duty_schedule`, `duty_attendance`, `duty_score_record`, `duty_period_config`)
- Default duty period configuration data

---

## API Overview

The system exposes approximately **106 API endpoints** grouped by module.

<details>
<summary><b>Authentication (10 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | User login (returns JWT Cookie) | No |
| POST | `/api/auth/signin` | Login alias | No |
| POST | `/api/auth/register` | User registration (requires approval) | No |
| GET | `/api/auth/me` | Get current user info | Yes |
| GET | `/api/auth/check-name` | Check username availability | No |
| POST | `/api/auth/logout` | Logout (clear cookie) | No |
| POST | `/api/auth/change-password` | Change password | Yes |
| POST | `/api/auth/change-name` | Change display name | Yes |
| POST | `/api/auth/change-class` | Change class | Yes |
| POST | `/api/auth/change-department` | Change department | Yes |

</details>

<details>
<summary><b>Maintenance Tickets (4 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/issues` | List issues (public data for guests) | No |
| POST | `/api/issues` | Create an issue | No |
| PUT | `/api/issues/{id}/status` | Update issue status | admin |
| DELETE | `/api/issues/{id}` | Delete an issue | admin |

</details>

<details>
<summary><b>Announcements (7 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/announcements` | List announcements | No |
| GET | `/api/announcements/{id}` | Get announcement detail | No |
| POST | `/api/announcements` | Create announcement | Yes |
| PUT | `/api/announcements/{id}` | Edit announcement (resets review status) | Yes |
| DELETE | `/api/announcements/{id}` | Delete announcement | owner/admin |
| PUT | `/api/announcements/{id}/status` | Review announcement (approve/reject) | admin |
| POST | `/api/announcements/{id}/images` | Add announcement images | Yes |

</details>

<details>
<summary><b>Polls (8 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/polls` | List polls | No |
| POST | `/api/polls` | Create poll | admin |
| GET | `/api/polls/{id}` | Get poll detail | No |
| POST | `/api/polls/{id}/vote` | Submit vote | No (Turnstile) |
| GET | `/api/polls/{id}/results` | Get poll results | creator/admin |
| GET | `/api/polls/{id}/export` | Export CSV results | creator/admin |
| GET | `/api/polls/{id}/my-vote` | Get my vote | No |
| DELETE | `/api/polls/{id}` | Delete poll | creator/admin |

</details>

<details>
<summary><b>Finance (6 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/finance` | List finance records | Yes |
| POST | `/api/finance` | Create finance record | Yes |
| PUT | `/api/finance/{id}/complete` | Mark as complete | admin |
| PUT | `/api/finance/{id}/reimburse` | Mark as reimbursed | admin |
| PUT | `/api/finance/{id}/unreimburse` | Reverse reimbursement | admin |
| DELETE | `/api/finance/{id}` | Delete record | admin |

</details>

<details>
<summary><b>Hall Booking (6 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/hall/bookings` | List bookings | Yes |
| POST | `/api/hall/bookings` | Create booking | Yes |
| POST | `/api/hall/bookings/{id}/withdraw` | Withdraw pending booking | Yes |
| DELETE | `/api/hall/bookings/{id}` | Delete booking | Yes |
| POST | `/api/hall/bookings/{id}/review` | Review booking | reviewer |
| GET | `/api/hall/bookings/pending` | Pending bookings (with conflicts) | reviewer |

</details>

<details>
<summary><b>Duty Attendance (18 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/duty/staff` | List all duty staff | No |
| POST | `/api/duty/staff` | Add duty staff | admin |
| POST | `/api/duty/staff/upload` | Batch import duty staff | admin |
| DELETE | `/api/duty/staff/{id}` | Delete duty staff | admin |
| POST | `/api/duty/schedule/generate` | Auto-generate 60-day schedule | admin |
| GET | `/api/duty/schedule` | Get schedule (date range) | No |
| GET | `/api/duty/schedule/export` | Export schedule CSV | No |
| GET | `/api/duty/attendance/today` | Today's schedule + attendance (auto-absent) | No |
| POST | `/api/duty/attendance/sign-in` | Sign in | No |
| POST | `/api/duty/attendance/sign-out` | Sign out (calculate score) | No |
| GET | `/api/duty/scores` | Get score records | No |
| POST | `/api/duty/scores/modify` | Manually modify score | admin |
| POST | `/api/duty/scores/cancel` | Cancel score (admin password required) | admin |
| POST | `/api/duty/schedule/manual` | Manually set day's schedule | admin |
| DELETE | `/api/duty/schedule/manual` | Delete day's schedule | admin |
| POST | `/api/duty/schedule/clear-all` | Clear all schedules/attendance/scores | admin |
| GET | `/api/duty/periods` | Get period config | No |
| PUT | `/api/duty/periods` | Update period config | admin |
| GET | `/api/duty/admins` | List admin users | No |

</details>

<details>
<summary><b>Feed (4 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/chat/messages` | Get feed messages (cursor pagination) | Yes |
| DELETE | `/api/chat/messages/{id}` | Delete feed message | admin |
| POST | `/api/feed/{id}/comment` | Add feed comment | Yes |
| GET | `/api/feed/{id}/comments` | Get feed comments | Yes |

</details>

<details>
<summary><b>Comments (5 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/comments/{type}/{id}` | Get comments (type: announcement/issue) | No |
| POST | `/api/comments` | Create comment | Yes |
| PUT | `/api/comments/{id}` | Edit comment | Yes |
| DELETE | `/api/comments/{id}` | Delete comment | Yes/admin |

</details>

<details>
<summary><b>Activities (6 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/activities` | List activities | No |
| POST | `/api/activities` | Create activity | Yes |
| DELETE | `/api/activities/{id}` | Delete activity | admin |
| POST | `/api/activities/{id}/volunteer` | Sign up as volunteer | No (Turnstile) |
| DELETE | `/api/activities/{id}/volunteer` | Cancel volunteer signup | Yes |
| GET | `/api/activities/{id}/volunteers` | List volunteers | No |

</details>

<details>
<summary><b>Review (4 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/reviews` | List review items | Yes |
| POST | `/api/reviews` | Submit for review | Yes |
| PUT | `/api/reviews/{id}/review` | Approve/reject review | admin |
| DELETE | `/api/reviews/{id}` | Delete review record | admin |

</details>

<details>
<summary><b>Admin Panel (20 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/admin/members` | List approved members | admin |
| GET | `/api/admin/registrations` | List pending registrations | admin |
| POST | `/api/admin/registrations/{id}/approve` | Approve registration | admin |
| POST | `/api/admin/registrations/{id}/reject` | Reject registration | admin |
| GET | `/api/admin/users/{id}` | Get user details | admin |
| DELETE | `/api/admin/users/{id}` | Delete user | admin |
| GET | `/api/admin/users` | List all users | admin |
| PUT | `/api/admin/users/{id}/role` | Change user role | admin |
| PUT | `/api/admin/users/{id}/reset-password` | Reset user password | admin |
| PUT | `/api/admin/users/{id}/name` | Change user name | admin |
| PUT | `/api/admin/users/{id}/department` | Set user department | admin |
| POST | `/api/admin/users/batch-import` | Batch import users | admin |
| POST | `/api/admin/users/batch-approve` | Batch approve registrations | admin |
| GET | `/api/admin/settings` | Get site settings | admin |
| PUT | `/api/admin/settings` | Update site settings | owner |
| GET | `/api/admin/storage` | Get storage statistics | admin |
| POST | `/api/admin/clear-all` | Clear all data | owner |
| DELETE | `/api/admin/finance/{id}` | Delete any finance record | admin |
| GET | `/api/admin/feedback` | List feedback | admin |
| DELETE | `/api/admin/feedback/{id}` | Delete feedback | admin |

</details>

<details>
<summary><b>Other (4 endpoints)</b></summary>

<br>

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/achievements/unlock` | Unlock achievement | Yes |
| POST | `/api/achievements/check-counts` | Check count-based achievements | Yes |
| GET | `/api/banner` | Get banner data | No |
| GET | `/api/settings` | Get public settings (site status) | No |
| POST | `/api/sync` | Data sync (hash change detection) | No |

</details>

---

## Achievement System

The system features 34 hidden achievements unlocked through specific user behaviors.

### Unlock Mechanism

Achievements use a **client-side detection + server-side verification** dual confirmation approach:

1. **Client detection**: Frontend code detects when a condition is met during user interaction
2. **Server verification**: Calls `POST /api/achievements/unlock`, server validates legitimacy and persists to database
3. **Offline fallback**: When offline, achievements queue in localStorage and sync on next login
4. **Count-based checks**: Accumulation achievements (message count, comment count) are verified server-side via `POST /api/achievements/check-counts`

### Full Achievement List

| ID | Name | Trigger Condition | Detection Location |
|---|---|---|---|
| `read_all_changelog` | Did Anyone Actually Read This? | Expand all changelog entries and wait 30s | changelog.html |
| `color_freak` | Color Freak | Switch accent colors 6+ times in 10 seconds | personalize.html |
| `night_owl` | Night Owl | Log in between 00:00–05:00 | api.js |
| `early_bird` | Early Bird | Log in between 06:00–08:00 | api.js |
| `high_five` | High Five! | Click the logo 10 times in a row | nav.js |
| `collector` | Collector | Unlock 17+ achievements (half) | api.js |
| `chatty` | Social Butterfly | Send 50+ feed messages | Server count |
| `commenter` | Keyboard Warrior | Submit 10+ comments or issues | Server count |
| `proposer` | Proposal King | Create 5+ issues | Server count |
| `time_traveler` | Time Traveler | View content older than 90 days | announcement.js |
| `intruder` | Intruder | Trigger a 403 error on 404 page | 404.html |
| `reset_master` | Reset Master | Reset all settings on personalize page | personalize.html |
| `locked_out` | Locked Out | Enter wrong password 3 times in a row | login.html |
| `reader` | Regular Reader | View 50+ announcements | announcement.js |
| `power` | Power...?Point. | Become an admin or owner | api.js |
| `extrovert` | Extrovert | Send 100+ feed messages | Server count |
| `introvert` | Introvert | Browse feed 5+ times without posting | Not implemented |
| `lightning` | Lightning | Delete a message within 3 seconds | Not implemented |
| `archaeologist` | Archaeologist | View announcements older than 180 days | api.js |
| `ocd` | OCD Freak | Toggle dark/light mode 20+ times | personalize.html |
| `night_owl2` | Night Owl 2.0 | Log in at midnight 3 consecutive days | api.js |
| `novice` | Newcomer | Submit first issue, comment, or vote | api.js |
| `pigeon` | Pigeon | Don't log in for 31+ days after registration | login.html |
| `dev` | Developer | Type a specific command in the console | api.js |
| `easter_egg` | Not an Easter Egg | Click the school emblem 5 times on the about page | about.html |
| `screenshot` | Screenshot Taker | Try to copy an image from the page | api.js |
| `frequent_404` | Frequent 404 Visitor | Visit the 404 page 3+ times | 404.html |
| `super_graphic` | Super Graphic | Enable Super Graphic effects | personalize.html |
| `attendance` | Perfect Attendance | Log in 7 consecutive days | login.html |
| `moonlight` | Moonlighter | Log in on the last day of the month | login.html |
| `anniversary` | Anniversary | Log in on the one-year anniversary of registration | login.html |
| `cookie_monster` | Cookie Monster | Accept the cookie consent notice | api.js |
| `feedback_first` | I Have Something to Say | Submit first feedback | feedback.html |
| `feedback_tenth` | Feedback Feedback Feedback! | Submit 10 feedback entries | feedback.html |

### Unlock Feedback

- **Toast notification**: A toast pops up showing the achievement name and icon on unlock
- **Server sync**: All achievements are synced server-side via JWT token updates, automatically restored on next login

---

## Personalization

### Theme System

Three theme modes and two theme styles are supported:

**Theme modes** (light/dark):

| Mode | Implementation | Description |
|---|---|---|
| Light | CSS variables + `data-theme="light"` | Default light theme |
| Dark | `data-theme="dark"` | Material 3 dark palette |
| System | `prefers-color-scheme` media query | Auto-match system setting |

**Theme styles** (design language):

| Style | Implementation | Description |
|---|---|---|
| Material | Default, no extra class | Material 3 (Material You) design system |
| Newspaper | `.theme-newspaper` class on `<html>` | Modern newspaper style: Gothic (UnifrakturCook) headlines + Georgia serif body, pure black/white/gray palette, asymmetric layout, sharp corners and hairline dividers. Can stack with dark mode (`.theme-newspaper.dark`). **Early-access feature**: gated by the feature-toggle system — admin must enable and invite users before it appears in personalization |

Theme CSS uses a layered architecture — each theme lives in its own folder (`css/material/`, `css/newspaper/`), internally organized into `base/components/pages` layers, loaded via `@import` from a `style.css` entry point.

User preference is stored in `localStorage['personalize']` (including `theme` and `style` fields) and applied on page load.

### Accent Colors

| Color | CSS Variable `--md-source` | Feel |
|---|---|---|
| Blue | `#1562ff` | Default, professional |
| Green | `#2e7d32` | Natural |
| Purple | `#7b1fa2` | Elegant |
| Orange | `#e65100` | Energetic |
| Red | `#c62828` | Bold |
| Cyan | `#00838f` | Fresh |

### Super Graphic

When Super Graphic is enabled, the `<html>` element receives the `super-graphic` class, activating:

- **Particle fireworks**: Canvas-based particle system triggered on page interactions
- **Card tilt**: CSS 3D transforms on hover over cards
- **Confetti**: Dynamically generated DOM fragments with CSS animations
- **Button shatter**: Buttons split into 4 quadrants via `clip-path` on click

The Super Graphic toggle is stored in `localStorage['personalize']` under the `super-graphic` key.

---

## Acknowledgements

This project uses a number of open-source libraries. The full list is available at [`/thanks`](https://yali-tongban.pages.dev/thanks.html).

---

## License

[GNU Affero General Public License v3.0](LICENSE) — see the LICENSE file for details.
