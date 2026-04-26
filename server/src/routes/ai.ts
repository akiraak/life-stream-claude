import { Router, Request, Response, NextFunction } from 'express';
import { askGemini } from '../services/gemini-service';
import { buildDishInfoPrompt, parseDishInfo } from '../services/dish-ai';
import { rateLimitAi } from '../middleware/rate-limit-ai';
import { getAiLimits } from '../services/settings-service';
import {
  getAiQuotaSnapshot,
  getJstResetAtIso,
  hashDeviceId,
} from '../services/ai-quota-service';

export const aiRouter = Router();

// POST /api/ai/suggest — 料理名からレシピと具材を生成（カウント加算あり）
aiRouter.post('/suggest', rateLimitAi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dishName, extraIngredients } = req.body;
    if (!dishName || typeof dishName !== 'string' || dishName.trim() === '') {
      res.status(400).json({ success: false, data: null, error: 'dishName は必須です' });
      return;
    }

    const extras = Array.isArray(extraIngredients)
      ? (extraIngredients as unknown[]).filter((e): e is string => typeof e === 'string' && e.trim() !== '')
      : [];

    const prompt = buildDishInfoPrompt(dishName.trim(), extras.length > 0 ? extras : undefined);
    const raw = await askGemini(prompt);
    const info = parseDishInfo(raw);

    res.json({
      success: true,
      data: { ingredients: info.ingredients, recipes: info.recipes },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/quota — 当日の AI 残量を読み取り専用で返す（カウント加算なし）
// X-Device-Id 未送信のゲストは 400 にせず remaining: null を返す（表示専用なので寛容に扱う）
aiRouter.get('/quota', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user: limitUser, guest: limitGuest } = getAiLimits();

    if (req.userId) {
      const snapshot = getAiQuotaSnapshot(`user:${req.userId}`, limitUser);
      res.json({ success: true, data: snapshot, error: null });
      return;
    }

    const raw = req.headers['x-device-id'];
    const rawDeviceId = Array.isArray(raw) ? raw[0] : raw;
    if (!rawDeviceId || typeof rawDeviceId !== 'string' || rawDeviceId.trim() === '') {
      res.json({
        success: true,
        data: { remaining: null, limit: null, resetAt: getJstResetAtIso() },
        error: null,
      });
      return;
    }

    const hashed = hashDeviceId(rawDeviceId.trim());
    const snapshot = getAiQuotaSnapshot(`device:${hashed}`, limitGuest);
    res.json({ success: true, data: snapshot, error: null });
  } catch (err) {
    next(err);
  }
});
