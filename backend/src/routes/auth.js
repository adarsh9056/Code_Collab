import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { sendOtpEmail } from '../services/emailService.js';

const router = express.Router();
const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function generateOtp() {
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) otp += Math.floor(Math.random() * 10).toString();
  return otp;
}

// POST /api/auth/send-otp - send OTP to email for registration
router.post('/send-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await Otp.deleteMany({ email });
    await Otp.create({ email, otp, expiresAt });
    const { sentViaEmail } = await sendOtpEmail(email, otp);
    res.json({
      message: sentViaEmail ? 'OTP sent to your email' : 'OTP generated. Check the backend server console/terminal for your code (SMTP not configured).',
      sentViaEmail,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
    });
  } catch (err) {
    const msg = err?.message || String(err) || 'Failed to send OTP';
    console.error('[send-otp]', msg, err);
    res.status(500).json({ message: msg });
  }
});

// POST /api/auth/register - requires valid OTP for email
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, displayName, otp } = req.body;
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm || !password || !username) {
      return res.status(400).json({ message: 'Email, password, and username are required' });
    }
    if (!otp || String(otp).trim().length !== OTP_LENGTH) {
      return res.status(400).json({ message: 'Valid 6-digit OTP is required. Please request a new OTP from the register page.' });
    }
    const otpDoc = await Otp.findOne({ email: emailNorm }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'No OTP found for this email. Please request a new OTP.' });
    if (otpDoc.otp !== String(otp).trim()) return res.status(400).json({ message: 'Invalid OTP.' });
    if (new Date() > otpDoc.expiresAt) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({ message: 'OTP has expired. Please request a new OTP.' });
    }
    await Otp.deleteOne({ _id: otpDoc._id });
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
