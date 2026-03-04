/**
 * サムネ撮影用デモデータ投入スクリプト
 * 使い方: cd server && npx ts-node seed-demo.ts
 * DB_PATH 環境変数で出力先を変更可能（デフォルト: ./demo.db）
 */
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'demo.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// スキーマ作成
db.exec(`
  CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', '2');

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    code TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    ingredients_json TEXT,
    recipes_json TEXT,
    position INTEGER,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_dishes_user ON dishes(user_id);

  CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    checked INTEGER DEFAULT 0,
    position INTEGER,
    dish_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_shopping_items_user ON shopping_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_shopping_items_dish ON shopping_items(dish_id);

  CREATE TABLE IF NOT EXISTS purchase_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    purchased_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dish_name TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    ingredients_json TEXT NOT NULL,
    source_dish_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_saved_recipes_user ON saved_recipes(user_id);

  CREATE TABLE IF NOT EXISTS recipe_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    saved_recipe_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (saved_recipe_id) REFERENCES saved_recipes(id) ON DELETE CASCADE,
    UNIQUE(user_id, saved_recipe_id)
  );
  CREATE INDEX IF NOT EXISTS idx_recipe_likes_recipe ON recipe_likes(saved_recipe_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_likes_user ON recipe_likes(user_id);
`);

// ========== ヘルパー ==========
const insertUser = db.prepare(`INSERT INTO users (email) VALUES (?)`);
const insertDish = db.prepare(`INSERT INTO dishes (user_id, name, ingredients_json, recipes_json, position) VALUES (?, ?, ?, ?, ?)`);
const insertItem = db.prepare(`INSERT INTO shopping_items (user_id, name, category, checked, position, dish_id) VALUES (?, ?, ?, ?, ?, ?)`);
const insertRecipe = db.prepare(`INSERT INTO saved_recipes (user_id, dish_name, title, summary, steps_json, ingredients_json, source_dish_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertLike = db.prepare(`INSERT INTO recipe_likes (user_id, saved_recipe_id) VALUES (?, ?)`);

function addDish(uid: number, name: string, ingredients: {name:string,category:string}[], recipes: any[] | null, position: number) {
  const r = insertDish.run(uid, name, JSON.stringify(ingredients), recipes ? JSON.stringify(recipes) : null, position);
  return r.lastInsertRowid as number;
}
function addItems(uid: number, dishId: number | null, items: {name:string,category:string,checked:number}[]) {
  items.forEach((item, i) => insertItem.run(uid, item.name, item.category, item.checked, i, dishId));
}

// ========== ユーザー作成 ==========
const userId = insertUser.run('demo@example.com').lastInsertRowid as number;
const user2Id = insertUser.run('tanaka@example.com').lastInsertRowid as number;
const user3Id = insertUser.run('suzuki@example.com').lastInsertRowid as number;
const user4Id = insertUser.run('yamada@example.com').lastInsertRowid as number;

// ========================================
// メインユーザー (demo) の料理・アイテム
// ========================================

// --- カレーライス ---
const curryId = addDish(userId, 'カレーライス', [
  { name: '豚肉', category: '肉類' }, { name: 'じゃがいも', category: '野菜' },
  { name: 'にんじん', category: '野菜' }, { name: '玉ねぎ', category: '野菜' },
  { name: 'カレールー', category: 'その他' }, { name: 'サラダ油', category: 'その他' },
], [
  { title: '定番ポークカレー', summary: '野菜たっぷりの家庭的なカレー',
    steps: ['野菜を一口大に切る', '鍋で豚肉と玉ねぎを炒める', '残りの野菜を加えて炒める', '水を加えて20分煮込む', 'ルーを溶かして10分煮込む'],
    ingredients: [{ name: '豚肉', category: '肉類' }, { name: 'じゃがいも', category: '野菜' }, { name: 'にんじん', category: '野菜' }, { name: '玉ねぎ', category: '野菜' }, { name: 'カレールー', category: 'その他' }] },
  { title: 'スパイスカレー', summary: 'クミンとターメリックで本格的に',
    steps: ['玉ねぎをあめ色になるまで炒める', 'スパイスを加えて香りを出す', '肉と野菜を加えて炒め合わせる', 'トマト缶と水を加えて煮込む'],
    ingredients: [{ name: '豚肉', category: '肉類' }, { name: '玉ねぎ', category: '野菜' }, { name: 'トマト缶', category: 'その他' }] },
  { title: 'キーマカレー', summary: 'ひき肉でさっと作れる時短カレー',
    steps: ['玉ねぎをみじん切りにする', 'ひき肉と玉ねぎを炒める', 'カレー粉とトマトを加える', '水を少量加えて10分煮込む'],
    ingredients: [{ name: '豚肉', category: '肉類' }, { name: '玉ねぎ', category: '野菜' }] },
], 0);
addItems(userId, curryId, [
  { name: '豚こま切れ肉', category: '肉類', checked: 0 },
  { name: 'じゃがいも', category: '野菜', checked: 1 },
  { name: 'にんじん', category: '野菜', checked: 0 },
  { name: '玉ねぎ', category: '野菜', checked: 1 },
  { name: 'カレールー（中辛）', category: 'その他', checked: 0 },
]);

// --- 肉じゃが ---
const nikujagaId = addDish(userId, '肉じゃが', [
  { name: '牛薄切り肉', category: '肉類' }, { name: 'じゃがいも', category: '野菜' },
  { name: '玉ねぎ', category: '野菜' }, { name: 'にんじん', category: '野菜' },
  { name: 'しらたき', category: 'その他' }, { name: '醤油', category: '調味料' }, { name: 'みりん', category: '調味料' },
], [
  { title: '定番の肉じゃが', summary: 'ほっくり煮崩れしない基本のレシピ',
    steps: ['材料を食べやすい大きさに切る', '鍋で牛肉を炒める', '野菜としらたきを加える', 'だし・醤油・みりん・砂糖を加えて煮込む', '落し蓋をして20分煮る'],
    ingredients: [{ name: '牛薄切り肉', category: '肉類' }, { name: 'じゃがいも', category: '野菜' }, { name: '玉ねぎ', category: '野菜' }] },
], 1);
addItems(userId, nikujagaId, [
  { name: '牛薄切り肉', category: '肉類', checked: 0 },
  { name: 'しらたき', category: 'その他', checked: 0 },
  { name: 'さやいんげん', category: '野菜', checked: 0 },
]);

// --- グリーンサラダ ---
const saladId = addDish(userId, 'グリーンサラダ', [
  { name: 'レタス', category: '野菜' }, { name: 'トマト', category: '野菜' },
  { name: 'きゅうり', category: '野菜' }, { name: 'ドレッシング', category: 'その他' },
], null, 2);
addItems(userId, saladId, [
  { name: 'レタス', category: '野菜', checked: 0 },
  { name: 'ミニトマト', category: '野菜', checked: 0 },
  { name: 'きゅうり', category: '野菜', checked: 1 },
  { name: 'ドレッシング', category: 'その他', checked: 0 },
]);

// --- 鶏の唐揚げ ---
const karageId = addDish(userId, '鶏の唐揚げ', [
  { name: '鶏もも肉', category: '肉類' }, { name: '醤油', category: '調味料' },
  { name: '生姜', category: '野菜' }, { name: 'にんにく', category: '野菜' },
  { name: '片栗粉', category: 'その他' }, { name: '揚げ油', category: 'その他' },
], [
  { title: 'カリッとジューシー唐揚げ', summary: '二度揚げでカリッと仕上げる定番レシピ',
    steps: ['鶏もも肉を一口大に切る', '醤油・酒・生姜・にんにくに15分漬ける', '片栗粉をまぶす', '170°Cで3分揚げて取り出す', '180°Cで1分二度揚げする'],
    ingredients: [{ name: '鶏もも肉', category: '肉類' }, { name: '醤油', category: '調味料' }, { name: '生姜', category: '野菜' }, { name: '片栗粉', category: 'その他' }] },
], 3);
addItems(userId, karageId, [
  { name: '鶏もも肉（2枚）', category: '肉類', checked: 0 },
  { name: '生姜', category: '野菜', checked: 0 },
  { name: 'にんにく', category: '野菜', checked: 1 },
  { name: '片栗粉', category: 'その他', checked: 0 },
  { name: 'レモン', category: '野菜', checked: 0 },
]);

// --- 味噌汁 ---
const misoId = addDish(userId, '味噌汁', [
  { name: '豆腐', category: 'その他' }, { name: 'わかめ', category: 'その他' },
  { name: '長ねぎ', category: '野菜' }, { name: '味噌', category: '調味料' },
  { name: 'だしの素', category: '調味料' },
], [
  { title: '基本の味噌汁', summary: '豆腐とわかめの定番味噌汁',
    steps: ['豆腐をさいの目に切る', 'だし汁を沸かす', '豆腐とわかめを入れる', '火を止めて味噌を溶く', '長ねぎを散らす'],
    ingredients: [{ name: '豆腐', category: 'その他' }, { name: 'わかめ', category: 'その他' }, { name: '味噌', category: '調味料' }] },
], 4);
addItems(userId, misoId, [
  { name: '豆腐（絹）', category: 'その他', checked: 0 },
  { name: 'カットわかめ', category: 'その他', checked: 1 },
  { name: '長ねぎ', category: '野菜', checked: 0 },
]);

// --- 単品アイテム ---
addItems(userId, null, [
  { name: '牛乳', category: '乳製品', checked: 0 },
  { name: '食パン', category: '穀類', checked: 1 },
  { name: '卵（10個入）', category: 'その他', checked: 0 },
  { name: 'バター', category: '乳製品', checked: 0 },
  { name: 'ヨーグルト', category: '乳製品', checked: 1 },
]);

// ========================================
// 保存済みレシピ（各ユーザーから投稿）
// ========================================
const recipeIds: number[] = [];

// demo ユーザーのレシピ
recipeIds.push(insertRecipe.run(userId, 'カレーライス', '定番ポークカレー', '野菜たっぷりの家庭的なカレー',
  JSON.stringify(['野菜を一口大に切る', '鍋で豚肉と玉ねぎを炒める', '残りの野菜を加えて炒める', '水を加えて20分煮込む', 'ルーを溶かして10分煮込む']),
  JSON.stringify([{ name: '豚肉', category: '肉類' }, { name: 'じゃがいも', category: '野菜' }, { name: 'にんじん', category: '野菜' }, { name: '玉ねぎ', category: '野菜' }, { name: 'カレールー', category: 'その他' }]),
  curryId).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(userId, '肉じゃが', '定番の肉じゃが', 'ほっくり煮崩れしない基本のレシピ',
  JSON.stringify(['材料を食べやすい大きさに切る', '鍋で牛肉を炒める', '野菜としらたきを加える', 'だし・醤油・みりん・砂糖を加えて煮込む', '落し蓋をして20分煮る']),
  JSON.stringify([{ name: '牛薄切り肉', category: '肉類' }, { name: 'じゃがいも', category: '野菜' }, { name: '玉ねぎ', category: '野菜' }, { name: 'しらたき', category: 'その他' }]),
  nikujagaId).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(userId, '鶏の唐揚げ', 'カリッとジューシー唐揚げ', '二度揚げでカリッと仕上げる定番レシピ',
  JSON.stringify(['鶏もも肉を一口大に切る', '醤油・酒・生姜・にんにくに15分漬ける', '片栗粉をまぶす', '170°Cで3分揚げて取り出す', '180°Cで1分二度揚げする']),
  JSON.stringify([{ name: '鶏もも肉', category: '肉類' }, { name: '醤油', category: '調味料' }, { name: '生姜', category: '野菜' }, { name: '片栗粉', category: 'その他' }]),
  karageId).lastInsertRowid as number);

// tanaka ユーザーのレシピ
recipeIds.push(insertRecipe.run(user2Id, 'ハンバーグ', '煮込みハンバーグ', 'デミグラスソースでじっくり煮込んだ洋食屋さんの味',
  JSON.stringify(['玉ねぎをみじん切りにして炒め、冷ます', 'ひき肉・パン粉・卵・塩こしょうを混ぜてこねる', '小判型に成形し、中央をくぼませる', 'フライパンで両面に焼き色をつける', 'デミグラスソースを加えて蓋をし15分煮込む']),
  JSON.stringify([{ name: '合いびき肉', category: '肉類' }, { name: '玉ねぎ', category: '野菜' }, { name: 'パン粉', category: 'その他' }, { name: '卵', category: 'その他' }, { name: 'デミグラスソース', category: 'その他' }]),
  null).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(user2Id, '親子丼', 'とろとろ親子丼', '半熟卵がとろける本格親子丼',
  JSON.stringify(['鶏もも肉を一口大に切る', '玉ねぎを薄切りにする', 'だし・醤油・みりんで鶏肉と玉ねぎを煮る', '溶き卵を回し入れ蓋をして30秒', '半熟のうちにご飯にのせる']),
  JSON.stringify([{ name: '鶏もも肉', category: '肉類' }, { name: '卵', category: 'その他' }, { name: '玉ねぎ', category: '野菜' }, { name: '三つ葉', category: '野菜' }]),
  null).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(user2Id, '豚の生姜焼き', '豚の生姜焼き', 'ご飯が止まらない甘辛タレの生姜焼き',
  JSON.stringify(['豚ロースに軽く小麦粉をまぶす', 'フライパンで両面を焼く', '醤油・みりん・酒・すりおろし生姜を合わせる', 'タレを加えて絡める', '千切りキャベツと盛り付ける']),
  JSON.stringify([{ name: '豚ロース', category: '肉類' }, { name: '生姜', category: '野菜' }, { name: 'キャベツ', category: '野菜' }]),
  null).lastInsertRowid as number);

// suzuki ユーザーのレシピ
recipeIds.push(insertRecipe.run(user3Id, 'パスタ', 'ペペロンチーノ', 'シンプルだけど奥深いにんにくの香りのパスタ',
  JSON.stringify(['パスタを茹でる（塩多め）', 'にんにくを薄切りにしオリーブオイルで弱火で炒める', '唐辛子を加えて香りを出す', '茹で汁を加えて乳化させる', 'パスタを和えて仕上げる']),
  JSON.stringify([{ name: 'スパゲッティ', category: '穀類' }, { name: 'にんにく', category: '野菜' }, { name: '唐辛子', category: 'その他' }, { name: 'オリーブオイル', category: 'その他' }]),
  null).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(user3Id, '麻婆豆腐', 'ピリ辛麻婆豆腐', '花椒と豆板醤で本格四川風',
  JSON.stringify(['豆腐をさいの目に切り下茹でする', 'ひき肉を炒めて豆板醤を加える', '鶏ガラスープを加えて煮立てる', '豆腐を入れてやさしく混ぜる', '水溶き片栗粉でとろみをつけ花椒をふる']),
  JSON.stringify([{ name: '豆腐', category: 'その他' }, { name: '豚ひき肉', category: '肉類' }, { name: '豆板醤', category: '調味料' }, { name: '長ねぎ', category: '野菜' }, { name: '花椒', category: '調味料' }]),
  null).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(user3Id, 'オムライス', 'ふわとろオムライス', 'チキンライスを半熟卵で包む洋食の定番',
  JSON.stringify(['鶏肉と玉ねぎを炒めてケチャップライスを作る', 'ライスを皿に盛る', '卵3個を溶いてバターで焼く', '半熟のうちにライスの上にのせる', 'ケチャップをかけて完成']),
  JSON.stringify([{ name: '鶏もも肉', category: '肉類' }, { name: '玉ねぎ', category: '野菜' }, { name: '卵', category: 'その他' }, { name: 'ケチャップ', category: '調味料' }, { name: 'バター', category: '乳製品' }]),
  null).lastInsertRowid as number);

// yamada ユーザーのレシピ
recipeIds.push(insertRecipe.run(user4Id, '餃子', '焼き餃子', 'パリッと羽根つき焼き餃子',
  JSON.stringify(['キャベツとニラをみじん切りにし塩もみする', 'ひき肉・野菜・調味料を混ぜてこねる', '餃子の皮で包む', 'フライパンに並べて焼き色をつける', '水を加えて蓋をし蒸し焼きにする']),
  JSON.stringify([{ name: '豚ひき肉', category: '肉類' }, { name: 'キャベツ', category: '野菜' }, { name: 'ニラ', category: '野菜' }, { name: '餃子の皮', category: 'その他' }, { name: '生姜', category: '野菜' }]),
  null).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(user4Id, '豚汁', '具だくさん豚汁', '根菜たっぷりで体が温まる',
  JSON.stringify(['大根・にんじん・ごぼうをいちょう切りにする', '豚バラ肉をごま油で炒める', '野菜を加えて炒め合わせる', 'だし汁を加えて柔らかくなるまで煮る', '味噌を溶いて長ねぎを散らす']),
  JSON.stringify([{ name: '豚バラ肉', category: '肉類' }, { name: '大根', category: '野菜' }, { name: 'にんじん', category: '野菜' }, { name: 'ごぼう', category: '野菜' }, { name: '味噌', category: '調味料' }]),
  null).lastInsertRowid as number);

recipeIds.push(insertRecipe.run(user4Id, 'チャーハン', 'パラパラチャーハン', '強火で一気に仕上げるお店の味',
  JSON.stringify(['ご飯を常温に戻しておく', '卵を溶いてフライパンで半熟に炒める', 'ご飯を加えて強火でほぐしながら炒める', '長ねぎ・チャーシューを加える', '醤油を鍋肌から回し入れて仕上げる']),
  JSON.stringify([{ name: 'ご飯', category: '穀類' }, { name: '卵', category: 'その他' }, { name: '長ねぎ', category: '野菜' }, { name: 'チャーシュー', category: '肉類' }]),
  null).lastInsertRowid as number);

// ========================================
// いいね（みんなのレシピ用）
// ========================================
// recipeIds: [0]定番ポークカレー [1]肉じゃが [2]唐揚げ [3]ハンバーグ [4]親子丼
//            [5]生姜焼き [6]ペペロンチーノ [7]麻婆豆腐 [8]オムライス [9]餃子
//            [10]豚汁 [11]チャーハン

// 定番ポークカレー: 3いいね（人気）
insertLike.run(user2Id, recipeIds[0]);
insertLike.run(user3Id, recipeIds[0]);
insertLike.run(user4Id, recipeIds[0]);

// 煮込みハンバーグ: 3いいね（人気）
insertLike.run(userId, recipeIds[3]);
insertLike.run(user3Id, recipeIds[3]);
insertLike.run(user4Id, recipeIds[3]);

// カリッとジューシー唐揚げ: 2いいね
insertLike.run(user2Id, recipeIds[2]);
insertLike.run(user3Id, recipeIds[2]);

// ふわとろオムライス: 2いいね
insertLike.run(userId, recipeIds[8]);
insertLike.run(user4Id, recipeIds[8]);

// 焼き餃子: 2いいね
insertLike.run(userId, recipeIds[9]);
insertLike.run(user2Id, recipeIds[9]);

// 定番の肉じゃが: 1いいね
insertLike.run(user4Id, recipeIds[1]);

// とろとろ親子丼: 1いいね
insertLike.run(userId, recipeIds[4]);

// ピリ辛麻婆豆腐: 1いいね
insertLike.run(user2Id, recipeIds[7]);

// パラパラチャーハン: 1いいね
insertLike.run(user3Id, recipeIds[11]);

// 豚の生姜焼き: 1いいね
insertLike.run(user4Id, recipeIds[5]);

// ペペロンチーノ、豚汁: 0いいね（バリエーション用）

// ========== JWT & 完了メッセージ ==========
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const token = jwt.sign({ userId, email: 'demo@example.com' }, JWT_SECRET, { expiresIn: '30d' });

const totalItems = db.prepare('SELECT COUNT(*) as c FROM shopping_items').get() as { c: number };
const totalRecipes = db.prepare('SELECT COUNT(*) as c FROM saved_recipes').get() as { c: number };
const totalLikes = db.prepare('SELECT COUNT(*) as c FROM recipe_likes').get() as { c: number };

console.log(`デモDB作成完了: ${DB_PATH}`);
console.log(`  ユーザー: 4人（demo, tanaka, suzuki, yamada）`);
console.log(`  料理: 5件（カレーライス、肉じゃが、グリーンサラダ、鶏の唐揚げ、味噌汁）`);
console.log(`  アイテム: ${totalItems.c}件`);
console.log(`  保存済みレシピ: ${totalRecipes.c}件`);
console.log(`  いいね: ${totalLikes.c}件`);
console.log('');
console.log('起動方法:');
console.log(`  DB_PATH=${DB_PATH} npm run dev`);
console.log('');
console.log('ログイン方法:');
console.log('  ブラウザの開発者ツール(Console)で以下を実行:');
console.log(`  localStorage.setItem('auth_token', '${token}'); localStorage.setItem('auth_email', 'demo@example.com'); location.reload();`);

db.close();
