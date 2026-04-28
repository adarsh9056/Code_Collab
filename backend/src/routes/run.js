import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { runHandler } from '../controllers/executionController.js';

const router = express.Router();

// POST /api/run — visible test cases only
router.post('/', authenticate, runHandler);

export default router;
