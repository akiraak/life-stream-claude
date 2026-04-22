import { jsonrepair } from 'jsonrepair';

export interface Ingredient {
  name: string;
  category: string;
}

export interface Recipe {
  title: string;
  summary: string;
  steps: string[];
  ingredients: Ingredient[];
}

export interface DishInfo {
  ingredients: Ingredient[];
  recipes: Recipe[];
}

export function buildDishInfoPrompt(dishName: string, extraIngredients?: string[]): string {
  const extraSection = extraIngredients && extraIngredients.length > 0
    ? `\nユーザーが以下の食材を必ず使いたいと指定しています：${extraIngredients.join('、')}
上記の食材は必ずレシピに含めてください。ただし上記以外の食材も自由に追加してください。上記の食材だけに限定せず、料理に必要な食材をすべて含めた本格的なレシピを提案してください。\n`
    : '';

  return `あなたは料理の専門家です。「${dishName}」について以下の情報をJSON形式で返してください。
${extraSection}
おすすめレシピを3つ提案してください。各レシピにはそのレシピで必要な具材リスト（一般的な調味料は含めない、主要な食材のみ）を含めてください。

回答は以下のJSON形式のみで返してください。JSON以外のテキストは含めないでください:

{
  "recipes": [
    {
      "title": "レシピ名",
      "summary": "一行の概要説明",
      "steps": ["手順1", "手順2", "手順3"],
      "ingredients": [
        { "name": "具材名", "category": "野菜|肉類|魚介類|乳製品|穀類|その他" }
      ]
    }
  ]
}`;
}

export function parseDishInfo(raw: string): DishInfo {
  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const repaired = jsonrepair(cleaned);
    const parsed = JSON.parse(repaired);

    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.recipes)) {
      const recipes = (parsed.recipes as Recipe[]).map((r) => ({
        ...r,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      }));
      // レシピごとの食材をマージして全体の食材リストを生成
      const ingredientMap = new Map<string, Ingredient>();
      for (const r of recipes) {
        for (const ing of r.ingredients) {
          if (ing.name && !ingredientMap.has(ing.name)) {
            ingredientMap.set(ing.name, ing);
          }
        }
      }
      // 旧形式の ingredients がトップレベルにある場合もマージ
      if (Array.isArray(parsed.ingredients)) {
        for (const ing of parsed.ingredients as Ingredient[]) {
          if (ing.name && !ingredientMap.has(ing.name)) {
            ingredientMap.set(ing.name, ing);
          }
        }
      }
      return {
        ingredients: Array.from(ingredientMap.values()),
        recipes,
      };
    }
    // 旧形式: 配列のみ（後方互換）
    if (Array.isArray(parsed)) {
      return { ingredients: parsed as Ingredient[], recipes: [] };
    }
    return { ingredients: [], recipes: [] };
  } catch {
    return { ingredients: [], recipes: [] };
  }
}
