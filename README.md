# CodeCollab

Real-time collaborative coding platform for DSA practice, pair programming, and mock interviews.

## Tech stack

- **Frontend**: React (Vite), CodeMirror 6, Socket.IO client, WebRTC (audio), Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO, JWT auth, MongoDB (Mongoose)
- **Code execution**: Node `vm` (JavaScript); placeholder for Python/C++/Java via external runner

## Features

- **Collab mode**: Shared room, real-time code sync, run/submit, chat, optional voice (WebRTC)
- **Contest mode**: 3 random problems, 25-min timer, per-problem editor, leaderboard
- **Mock interview**: Interviewer (read-only + notes + hints + evaluation) / Candidate (editor + hint request), voice, post-interview report
- **AI feedback**: Rule-based complexity and pattern detection, quality score
- **Analytics**: Sessions, problems solved, success rate, suggestions

## Project structure

```
major/
├── ARCHITECTURE.md       # High-level design
├── docs/
│   ├── API_ENDPOINTS.md
│   ├── DATABASE_SCHEMAS.md
│   └── SOCKET_EVENTS.md
├── backend/              # Express + Socket.IO + MongoDB
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── socket/
│   │   ├── scripts/
│   │   ├── app.js
│   │   └── server.js
│   └── package.json
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.jsx
│   └── package.json
├── RUN_INSTRUCTIONS.md
└── DEPLOYMENT.md
```

## Run locally

See [RUN_INSTRUCTIONS.md](RUN_INSTRUCTIONS.md).

## Where things are

- **Images:** Served from Unsplash (external). See [docs/IMAGES.md](docs/IMAGES.md) for URLs and how to use local images.
- **Login/Register data:** Stored in MongoDB `users` collection. View/edit in the app under **Profile**, or in MongoDB Compass/Atlas. See [docs/USER_DATA_AND_DATABASE.md](docs/USER_DATA_AND_DATABASE.md).

## Deploy (GitHub → live link)

See [DEPLOYMENT_GITHUB.md](DEPLOYMENT_GITHUB.md) for deploying frontend (Vercel) and backend (Railway/Render) so that each push gives you a deployable link.

## Production (general)

See [DEPLOYMENT.md](DEPLOYMENT.md).
