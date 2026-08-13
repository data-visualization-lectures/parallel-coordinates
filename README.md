# Parallel Coordinates

dataviz.jp のパラレルコーディネイトチャート。

## Identity

| 項目 | 値 |
|---|---|
| `appName` / `chartType` | `parallel-coordinates` |
| 公開ホスト | https://parallel-coordinates.dataviz.jp |
| プロジェクト保存 | `dataviz-tool-header` の `setProjectConfig` / `?projectId=` |
| 作成画面の公開 | ヘッダーのシェア（読込・保存の右）。`setShareConfig` / `shareProject()`。チャート領域には置かない |
| シェアテーブル | `parallel_coordinates_shares` |
| publish 関数 | `publish-parallel-coordinates-share` |
| 公開 URL | `/share.html?id=` |
| OG 関数 | `og-parallel-coordinates-share` |
| OG バケット | `parallel-coordinates-og-images` |
| 公開操作 | 編集画面と `share.html` の `#dvz-controls`（軸スケール / ブラシ Reset） |

新しい書き込みは保存済みプロジェクト必須 → Edge Function → `source_project_id` 単位の upsert。クライアントから `parallel_coordinates_shares` へ直接 INSERT しない。既存の `share.html?id=` と OG URL は読み取りのまま残す。

本番への migration / function deploy は、対象・コマンド・ロールバックを出して承認を得てから行う。

## ローカル確認

```bash
python3 -m http.server 8000
```

- `http://127.0.0.1:8000/?auth_debug=1`
- `http://127.0.0.1:8000/share.html?id=<share-id>`
