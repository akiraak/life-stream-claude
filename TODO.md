# TODO

## 機能開発
- [ ] 管理画面の認証をアプリの認証と別にする。Cloudflare Access で行うようにする
  - プラン: [docs/plans/admin-auth-cloudflare.md](docs/plans/admin-auth-cloudflare.md)
  - [ ] Phase 0: 前提確認（Tunnel か Proxied DNS かの特定 → Phase 5-1 の封鎖手段を決定）
  - [ ] Phase 1: Cloudflare Access の設定（Application 作成・Google IdP・AUD/iss 取得・最初は Bypass モード）
  - [ ] Phase 2: サーバ側 `requireCloudflareAccess` ミドルウェア実装（jose + iss/aud/RS256 検証 + JWKS 1h キャッシュ + dev バイパス白リスト + `req.adminEmail` + テスト）
  - [ ] Phase 3: `/api/admin` の認証付け替え（`requireAdmin`/`ADMIN_EMAILS` 撤去、CORS 絞り、`/api/admin/me` 追加、結合テスト一括書き換え）
  - [ ] Phase 4: `web/admin` クライアント改修（`auth_token` 依存撤去、401 で `/cdn-cgi/access/logout` へ、SSE 再接続検証）
  - [ ] Phase 5: 本番ロールアウト（5-1 Origin 直アクセス封鎖必須・5-2 原子的デプロイ順序・5-3 ロールバック手段・5-4 監視）
  - [ ] Phase 6: README / CLAUDE.md / dev-admin の手順更新、TODO → DONE 移動
- [ ] 追加素材（買い物リストから） -> 追加具材（買い物リストから）
- [ ] 料理追加 -> 具材を追加（春キャベツ） -> 料理画面 -> この素材でレシピをAI検索（残り X 回） -> 具材に「春キャベツ」と他の食材が表示されレシピも３つ表示される -> 「レシピをAI検索（残り X 回）」 -> 「春キャベツ」が追加素材（買い物リストから）に表示される。本来は具材の方に表示されるべき

- [ ] アプリ起動直後は右上ハンバーガーのAI使用回数が表示されない
- [ ] 自分のレシピに表示されるレシピの判定基準の調査
- [ ] ライトモードのデザイン追加
- [ ] passkeys認証対応
- [ ] オフラインの時にローカルで変更を保存しておきオンラインになったときに更新
- [ ] アイテム編集ダイアログから削除を削除
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる
- [ ] ハートをフラットなイラストに
- [ ] Google認証を他のアカウントでチェック
- [ ] アプリアイコンのボールをバスケットに
