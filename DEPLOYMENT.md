# CodeCollab — Production Deployment

## Backend

- **Host**: Any Node.js host (Railway, Render, Fly.io, AWS, etc.).
- **Environment variables**:
  - `PORT` (default 5000)
  - `NODE_ENV=production`
  - `MONGODB_URI` (e.g. MongoDB Atlas)
  - `JWT_SECRET` (strong random string)
  - `JWT_EXPIRES_IN` (e.g. 7d)
  - `CLIENT_URL` (frontend origin, e.g. https://yourapp.com)
- **Socket.IO**: Use the same server instance; for multi-instance, use Redis adapter (`@socket.io/redis-adapter`).
- **Code execution**: Current runner uses Node `vm` (JavaScript only). For Python/C++/Java use a separate worker or external execution API.

## Frontend

- **Build**: `npm run build` in `frontend/`. Output in `frontend/dist`.
- **Env**: Set `VITE_SOCKET_URL` to the backend URL (e.g. `https://api.yourapp.com`) if the frontend is served from a different origin; otherwise Socket.IO will use the same origin.
- **Host**: Any static host (Vercel, Netlify, S3+CloudFront, etc.). Point API and WebSocket to the backend.

## Security checklist

- Use HTTPS everywhere.
- Strong `JWT_SECRET`; rotate if compromised.
- CORS: `CLIENT_URL` must match the frontend origin.
- Code execution: timeout and no filesystem/network in sandbox; consider moving to isolated workers or containers.
