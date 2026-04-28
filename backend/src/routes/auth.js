import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/index.js';

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, displayName } = req.body;
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm || !password || !username) {
      return res.status(400).json({ message: 'Email, password, and username are required' });
    }
    const existing = await User.findOne({ $or: [{ email: emailNorm }, { username }] });
    if (existing) {
      return res.status(400).json({ message: existing.email === emailNorm ? 'Email already registered' : 'Username taken' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: emailNorm,
      passwordHash,
      username,
      displayName: displayName || username,
    });
    const token = signToken(user._id);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    const u = await User.findById(user._id).select('-passwordHash');
    res.status(201).json({ user: u, accessToken: token });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = signToken(user._id);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    const u = await User.findById(user._id).select('-passwordHash');
    res.json({ user: u, accessToken: token });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { displayName, avatar, username } = req.body;
    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (avatar !== undefined) update.avatar = avatar;
    if (username !== undefined) {
      const taken = await User.findOne({ username, _id: { $ne: req.user._id } });
      if (taken) return res.status(400).json({ message: 'Username taken' });
      update.username = username;
    }
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-passwordHash');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Update failed' });
  }
});

export default router;
