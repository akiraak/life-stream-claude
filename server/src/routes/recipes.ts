import { Router, Request, Response, NextFunction } from 'express';
import { getUncheckedItems } from '../services/shopping-service';
import { askClaude } from '../services/claude-service';

export const recipesRouter = Router();

interface Recipe {
  title: string;
  ingredients: string[];
  steps: string[];
  note?: string;
}

function buildRecipePrompt(itemNames: string[]): string {
  const list = itemNames.join('、');
  return `あなたは料理の専門家です。以下の買い物リストの食材を使って作れるレシピを3つ提案してください。

買い物リストの食材: ${list}

以下の条件を守ってください:
- リストの食材をできるだけ多く使うレシピを優先する
- 一般的な調味料（塩、胡椒、醤油、砂糖、油など）は手元にあるものとする
- 各レシピには「タイトル」「使用食材」「手順」「ひとことメモ」を含める
- 回答は以下のJSON形式のみで返してください。JSON以外のテキストは含めないでください:

[
  {
    "title": "レシピ名",
    "ingredients": ["食材1", "食材2"],
    "steps": ["手順1", "手順2"],
    "note": "ひとことメモ"
  }
]`;
}

function parseRecipes(raw: string): Recipe[] | null {
  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as Recipe[];
    }
    return null;
  } catch {
    return null;
  }
}

recipesRouter.get('/recommend', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = getUncheckedItems();

    if (items.length === 0) {
      res.status(400).json({
        success: false,
        data: null,
        error: '買い物リストに未購入のアイテムがありません',
      });
      return;
    }

    const itemNames = items.map((item) => item.name);
    const prompt = buildRecipePrompt(itemNames);
    const raw = await askClaude(prompt);
    const recipes = parseRecipes(raw);

    res.json({
      success: true,
      data: {
        items: itemNames,
        recipes: recipes ?? [],
        rawResponse: recipes ? undefined : raw,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});
