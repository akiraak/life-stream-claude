import { Router, Request, Response, NextFunction } from 'express';
import { askClaude } from '../services/claude-service';

export const claudeRouter = Router();

claudeRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({
        success: false,
        data: null,
        error: 'prompt is required',
      });
      return;
    }

    const response = await askClaude(prompt);

    res.json({
      success: true,
      data: { response },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});
