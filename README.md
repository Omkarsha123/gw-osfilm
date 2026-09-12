# Frameflow Studio

Photo and video production tracking software for studio teams.

## Requirements

- Node.js 18 or newer
- A browser

## Run locally

From this folder:

```powershell
npm start
```

Open http://localhost:4173.

## Open as local files

You can also open `index.html` directly in a browser. This uses a browser-only demo mode with the default local administrator credentials and localStorage data. It does not run the Node API, SQLite database, real-time updates, or secure server authentication. Use `npm start` for the full application.

## Local login

The first administrator is created automatically when the SQLite database is initialized:

- Email: `admin@frameflow.local`
- Password: `ChangeMe123!`

Change this password implementation before production use. Sessions are stored in SQLite and expire after 12 hours. Project API routes require an active session.

For automatic server restarts while editing:

```powershell
npm run dev
```

The server serves the website and the API from the same origin. Project data is persisted in `data/frameflow.db`, a SQLite database created automatically on first start. The schema is initialized in `database.js`.

## Database model

The SQLite schema is normalized around the production domain:

- `projects`: project identity, schedule, location, album decision, and notes
- `clients` and `project_clients`: client records and project relationships
- `users`, `project_members`, and `sessions`: authentication and project access
- `workflow_stages`: ordered photo/video workflow stages and completion timestamps
- `tasks`: actionable work with status, priority, due date, and assignee
- `vendors` and `vendor_assignments`: external design, printing, editing, and backup partners
- `deliverables`: reels, full videos, albums, photo sets, and other outputs
- `editor_profiles` and `deliverable_assignments`: reel/full-video editors and their assignments
- `attachments`: file metadata linked to tasks or deliverables; binary files belong in object storage
- `activities`: append-only audit trail for project actions

Foreign keys, check constraints, and indexes are created automatically. Existing `videos` data is retained for API compatibility and migrated into `deliverables` on startup.

## Included workflow

- Photo stages: Shoot, Data backup, Album decision, Photo selection, Design vendor, Printing, Deliver
- Album Yes/No routing
- Editable production notes
- Multiple reel and full-length video deliverables
- Status progression for video jobs
- Project tasks
- Browser and server persistence
- Offline fallback to `localStorage` when the API is unavailable

## API

- `GET /api/health`
- `GET /api/projects/aria-rohan`
- `PUT /api/projects/aria-rohan`
- `POST /api/projects/aria-rohan/tasks`
- `POST /api/projects/aria-rohan/videos`
- `PATCH /api/projects/aria-rohan/videos/:videoId`

## Production deployment

### Render deployment

This repository includes `render.yaml` for a Node web service with a persistent disk for SQLite.

1. Push this folder to a GitHub repository.
2. In Render, choose **New + > Blueprint** and select the repository.
3. Set the secret `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` when Render asks for environment values.
4. Deploy the service. Render will run `npm install` and `npm start`.
5. Open the generated `https://...onrender.com` URL and sign in.

The persistent disk is required because SQLite data is stored in `data/frameflow.db`. Do not use the old Netlify-only configuration for this full-stack version; Netlify can host the static frontend but will not run this Node server or persist the SQLite database.

Before going live with multiple users, add user-management screens, role-based authorization, backups, rate limiting, and a managed PostgreSQL database.

The current app is intentionally a single-project MVP. The API shape is already separated around projects so multi-project support can be added without redesigning the frontend workflow.
