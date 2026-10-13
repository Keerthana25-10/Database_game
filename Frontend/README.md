# Gaming Tournament Management System — Frontend Starter

## Contents
- `index.html` — dashboard layout and modal dialogs
- `style.css` — responsive dark esports UI
- `script.js` — demo tournament data, filtering, search, detail modal, demo registration, and local admin create flow

## Run it
1. Keep all three files in the same folder.
2. Open `index.html` in a browser, or use VS Code's Live Server extension.
3. The current frontend uses sample data in `script.js`. It does not yet connect to MySQL or an API.

## Backend contract planned
Base URL: `http://localhost:3000/api`

- `GET /tournaments`
- `POST /tournaments`
- `POST /tournaments/:id/register`
- `GET /matches`
- `GET /leaderboard`
- Later: `/auth/register`, `/auth/login`, `/teams`

When the Express backend is ready, set `USE_DEMO_DATA` to `false` and implement the API-loading functions. Do not send plain-text passwords; authentication should use secure password hashing and server-side validation.

## Important
The admin toggle and registrations are only frontend demonstrations. They are not secure authentication and do not persist to MySQL. Real authorization and database writes must be enforced by the backend.
