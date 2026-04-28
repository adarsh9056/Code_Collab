import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { submitHandler } from '../controllers/executionController.js';

const router = express.Router();

// POST /api/submit — all test cases, saved to DB
router.post('/', authenticate, submitHandler);

export default router;
