import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';

const roomStates = new Map(); // roomCode -> { language, userCodes, selectedProblemId, lastExecution }
const roomUsers = new Map(); // roomCode -> [{ socketId, user }]

function createEmptyCodeState() {
  return { javascript: '', python: '', cpp: '', java: '' };
}

function ensureRoomState(roomCode) {
  if (!roomStates.has(roomCode)) {
    roomStates.set(roomCode, {
      language: 'javascript',
      userCodes: {},
      selectedProblemId: null,
      lastExecution: null,
    });
  }
  return roomStates.get(roomCode);
}

export function attachSocketHandlers(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.userId).select('username displayName avatar').lean();
      if (!user) return next(new Error('User not found'));
      socket.userId = decoded.userId.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('auth_ok', { user: socket.user });

    socket.on('join_room', async (payload, callback) => {
      const { roomCode } = payload || {};
      if (!roomCode) {
        if (callback) callback({ error: 'roomCode required' });
        return;
      }

      try {
        const room = await Room.findOne({ roomCode });
        if (!room) {
          if (callback) callback({ error: 'Room not found' });
          return;
        }

        const roomName = `room:${roomCode}`;
        await socket.join(roomName);
        socket.roomCode = roomCode;

        if (!roomUsers.has(roomCode)) {
          roomUsers.set(roomCode, []);
        }
        
        const currentUsers = roomUsers.get(roomCode);
        const filtered = currentUsers.filter(u => u.user._id?.toString() !== socket.userId);
        filtered.push({ socketId: socket.id, user: socket.user });
        roomUsers.set(roomCode, filtered);

        const state = ensureRoomState(roomCode);
        if (!state.userCodes[socket.userId]) {
          state.userCodes[socket.userId] = createEmptyCodeState();
        }
        state.selectedProblemId = room.problemId ? room.problemId.toString() : state.selectedProblemId;

        const responseData = {
          room: room.toObject(),
          participants: filtered,
          codeState: state.userCodes[socket.userId],
          userCodes: state.userCodes,
          language: state.language,
          selectedProblemId: state.selectedProblemId,
          lastExecution: state.lastExecution,
        };

        socket.emit('room_joined', responseData);
        if (callback) callback({ success: true, ...responseData });

        io.to(roomName).emit('roomUsers', filtered);
        socket.to(roomName).emit('user_joined', { user: socket.user });

      } catch (err) {
        if (callback) callback({ error: err.message || 'Join failed' });
      }
    });

    socket.on('leave_room', (payload) => {
      const roomCode = payload?.roomCode || socket.roomCode;
      if (!roomCode) return;
      const roomName = `room:${roomCode}`;
      socket.leave(roomName);

      if (roomUsers.has(roomCode)) {
        const filtered = roomUsers.get(roomCode).filter(u => u.socketId !== socket.id);
        roomUsers.set(roomCode, filtered);
        io.to(roomName).emit('roomUsers', filtered);
      }
      socket.roomCode = null;
    });

    socket.on('codeChange', (payload) => {
      const { roomCode, language, code } = payload || {};
      if (!roomCode || roomCode !== socket.roomCode) return;
      
      const state = ensureRoomState(roomCode);
      if (!state.userCodes[socket.userId]) {
        state.userCodes[socket.userId] = createEmptyCodeState();
      }
      if (state.userCodes[socket.userId]) {
        state.userCodes[socket.userId][language] = code;
      }

      socket.to(`room:${roomCode}`).emit('codeUpdate', {
        language,
        code,
        senderSocketId: socket.id,
        senderUserId: socket.userId,
      });
    });

    socket.on('language_change', (payload) => {
      const { roomCode, language } = payload || {};
      if (!roomCode || roomCode !== socket.roomCode) return;
      const state = roomStates.get(roomCode);
      if (state) state.language = language;
      socket.to(`room:${roomCode}`).emit('language_change', { language });
    });

    socket.on('problem_change', (payload) => {
      const { roomCode, problemId, language, codeState } = payload || {};
      if (!roomCode || roomCode !== socket.roomCode) return;

      const state = ensureRoomState(roomCode);
      if (language) state.language = language;
      if (problemId) state.selectedProblemId = problemId;

      if (codeState && typeof codeState === 'object') {
        const users = roomUsers.get(roomCode) || [];
        users.forEach(({ user }) => {
          const uid = user?._id?.toString?.();
          if (uid) state.userCodes[uid] = { ...codeState };
        });
        if (!state.userCodes[socket.userId]) {
          state.userCodes[socket.userId] = { ...codeState };
        }
      }

      io.to(`room:${roomCode}`).emit('problem_change', {
        problemId: state.selectedProblemId,
        language: state.language,
        codeState: codeState && typeof codeState === 'object' ? codeState : undefined,
        changedBy: socket.userId,
      });
    });

    socket.on('execution_result', (payload) => {
      const { roomCode, result } = payload || {};
      if (!roomCode || roomCode !== socket.roomCode || !result) return;
      const state = ensureRoomState(roomCode);
      state.lastExecution = { result, by: socket.userId, at: Date.now() };
      io.to(`room:${roomCode}`).emit('execution_result', state.lastExecution);
    });

    socket.on('sendMessage', (payload) => {
      const { roomCode, message } = payload || {};
      if (!roomCode || roomCode !== socket.roomCode || !message) return;
      
      const msgData = {
        user: socket.user,
        message,
        timestamp: Date.now()
      };
      
      io.to(`room:${roomCode}`).emit('newMessage', msgData);
    });

    // WebRTC signaling
    socket.on('webrtc_offer', (payload) => {
      const { roomCode, targetUserId, offer } = payload || {};
      if (!roomCode || !offer) return;
      socket.to(`room:${roomCode}`).emit('webrtc_offer', { fromUserId: socket.userId, offer });
    });
    socket.on('webrtc_answer', (payload) => {
      const { roomCode, targetUserId, answer } = payload || {};
      if (!roomCode || !answer) return;
      socket.to(`room:${roomCode}`).emit('webrtc_answer', { fromUserId: socket.userId, answer });
    });
    socket.on('webrtc_ice', (payload) => {
      const { roomCode, targetUserId, candidate } = payload || {};
      if (!roomCode || !candidate) return;
      socket.to(`room:${roomCode}`).emit('webrtc_ice', { fromUserId: socket.userId, candidate });
    });

    socket.on('disconnect', () => {
      const roomCode = socket.roomCode;
      if (roomCode) {
        const roomName = `room:${roomCode}`;
        if (roomUsers.has(roomCode)) {
          const filtered = roomUsers.get(roomCode).filter(u => u.socketId !== socket.id);
          roomUsers.set(roomCode, filtered);
          io.to(roomName).emit('roomUsers', filtered);
        }
        socket.to(roomName).emit('user_left', { userId: socket.userId });
        socket.to(roomName).emit('webrtc_leave', { userId: socket.userId });
      }
    });
  });
}
