# dataviz-tool-header プロジェクト管理 API リファレンス

`<dataviz-tool-header>` Web Component に統合されたプロジェクト保存・読み込み機能の開発者向けドキュメントです。

---

## セットアップ

### スクリプトの読み込み

HTML の `<head>` に以下の順序で追加してください。順序が重要です。

```html
<script src="https://app.dataviz.jp/lib/supabase.js"></script>
<script src="https://app.dataviz.jp/lib/dataviz-auth-client.js"></script>
<script src="https://app.dataviz.jp/lib/dataviz-tool-header.js" defer></script>
```

| スクリプト | 役割 |
|---|---|
| `supabase.js` | Supabase クライアントライブラリ |
| `dataviz-auth-client.js` | 認証・グローバルヘッダー。`window.datavizSupabase` を公開 |
| `dataviz-tool-header.js` | ツール固有サブヘッダー + プロジェクト管理UI（本ドキュメントの対象） |

### HTML にコンポーネントを配置

```html
<dataviz-tool-header></dataviz-tool-header>
```

---

## クイックスタート

```javascript
const header = document.querySelector('dataviz-tool-header');

// 1. ヘッダーUI を設定（ロゴ、ボタンなど）
header.setConfig({
  logo: { type: 'text', text: 'My Tool' },
  buttons: [
    { label: '開く',  action: () => header.showLoadModal(), align: 'right' },
    { label: '保存',  action: () => {
      header.showSaveModal({
        name: currentProjectName,
        data: getProjectState(),
        thumbnailDataUri: getCanvasThumbnail(),  // data:image/png;base64,...
        existingProjectId: currentProjectId,
      });
    }, align: 'right' },
  ],
});

// 2. プロジェクト管理を設定
header.setProjectConfig({
  appName: 'my-tool-name',
  onProjectLoad: (projectData) => {
    // projectData = ツールが保存した任意のJSONオブジェクト
    restoreToolState(projectData);
  },
  onProjectSave: (meta) => {
    // meta = { id, name, app_name, created_at, updated_at, ... }
    currentProjectId = meta.id;
    currentProjectName = meta.name;
  },
});
```

これだけで「開く」「保存」ボタンが動作し、モーダル表示 → API呼び出し → トースト通知まですべてヘッダーが処理します。

---

## API リファレンス

### `setProjectConfig(config)`

プロジェクト管理の初期設定。`showLoadModal()` / `showSaveModal()` の前に呼ぶ必要があります。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `config.appName` | `string` | **必須** | アプリ識別子。API の `app_name` フィルタに使用される（例: `'cartogram-japan'`, `'word-cloud'`） |
| `config.apiBaseUrl` | `string` | 任意 | API ベースURL。デフォルト: `window.datavizApiUrl` または `'https://api.dataviz.jp'` |
| `config.onProjectLoad` | `function(projectData)` | **必須** | ユーザーがプロジェクトを選択して読み込んだ時に呼ばれるコールバック |
| `config.onProjectSave` | `function(projectMeta)` | 任意 | 保存成功時に呼ばれるコールバック |
| `config.onProjectDelete` | `function(projectId)` | 任意 | 削除成功時に呼ばれるコールバック |

---

### `showLoadModal()`

プロジェクト一覧のモーダルを開きます。

- `appName` でフィルタされたプロジェクト一覧を API から取得
- サムネイル付きのグリッド表示
- プロジェクトをクリック → データを取得 → `onProjectLoad(projectData)` が呼ばれる
- 各カードに削除ボタンあり（クリック2回で削除確定、3秒でキャンセル）
- ESC キーまたはオーバーレイクリックで閉じる

```javascript
header.showLoadModal();
```

---

### `showSaveModal(options)`

保存モーダルを開きます。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `options.name` | `string` | 任意 | プロジェクト名の初期値（入力欄にプリセット） |
| `options.data` | `object` | **必須** | 保存するプロジェクトデータ（JSON シリアライズ可能な任意のオブジェクト） |
| `options.thumbnailDataUri` | `string \| null` | 任意 | サムネイル画像の Data URI（例: `'data:image/png;base64,iVBOR...'`）。モーダル内にプレビュー表示される |
| `options.existingProjectId` | `string \| null` | 任意 | 指定すると「上書き保存」ボタンが追加表示される。未指定なら「保存」ボタンのみ |

```javascript
header.showSaveModal({
  name: '人口カートグラム 2024',
  data: { version: 1, config: {...}, records: [...] },
  thumbnailDataUri: canvas.toDataURL('image/png'),
  existingProjectId: currentProjectId,  // null なら新規保存のみ
});
```

**モーダルの挙動:**
- `existingProjectId` あり → 「上書き保存」と「新規保存」の2ボタン
- `existingProjectId` なし → 「保存」ボタンのみ
- 保存成功 → モーダルが閉じ、成功トーストが表示され、`onProjectSave(meta)` が呼ばれる
- 保存失敗 → モーダル内にエラー表示 + エラートースト

---

### `showMessage(message, type, duration)`

トースト通知を表示します。プロジェクト管理とは独立して使えます。

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `message` | `string` | — | 表示するメッセージ |
| `type` | `'success' \| 'error' \| 'info'` | `'info'` | トーストの色（緑/赤/青） |
| `duration` | `number` | `3000` | 表示時間（ミリ秒） |

```javascript
header.showMessage('エクスポートが完了しました', 'success');
header.showMessage('ファイル形式が不正です', 'error', 5000);
```

---

### プログラマティック API（モーダルなし）

モーダルを介さず、コードから直接操作できます。成功/失敗時にトースト通知は自動表示されます。

**重要:** プログラマティック API は `onProjectLoad` / `onProjectSave` / `onProjectDelete` コールバックを**発火しません**。戻り値を直接使ってください。コールバックが発火するのは、モーダル経由（`showLoadModal()` / `showSaveModal()`）の操作時のみです。

#### `await header.saveProject(payload)`

```javascript
const meta = await header.saveProject({
  name: 'Auto-saved project',
  data: getProjectState(),
  thumbnailDataUri: canvas.toDataURL('image/png'),  // 任意
  existingProjectId: currentProjectId,               // null で新規作成
});
// meta = { id, name, app_name, created_at, updated_at, ... }
```

#### `await header.loadProject(projectId)`

```javascript
const projectData = await header.loadProject('uuid-of-project');
// projectData = ツールが保存した任意のJSONオブジェクト
// ※ onProjectLoad は呼ばれないので、呼び出し側でデータを処理すること
```

#### `await header.deleteProject(projectId)`

```javascript
await header.deleteProject('uuid-of-project');
// ※ onProjectDelete は呼ばれない
```

---

## コールバックに渡されるデータ

### `onProjectLoad(projectData)`

`projectData` は、保存時に `data` として渡したオブジェクトがそのまま返されます。

```javascript
// 保存時:
header.showSaveModal({
  data: { version: 1, text: 'hello', settings: { fontSize: 24 } },
  ...
});

// 読み込み時の onProjectLoad に渡される値:
// { version: 1, text: 'hello', settings: { fontSize: 24 } }
```

**注意:** API の GET `/api/projects/{id}` は `data` の中身をそのまま返します（メタデータでラップされません）。

### `onProjectSave(projectMeta)`

保存成功時に、プロジェクトのメタデータが渡されます。

```javascript
{
  id: "550e8400-e29b-41d4-a716-446655440000",  // UUID
  name: "人口カートグラム 2024",
  app_name: "cartogram-japan",
  user_id: "...",
  storage_path: "...",
  thumbnail_path: "..." | null,
  created_at: "2026-03-25T10:30:00.000Z",
  updated_at: "2026-03-25T10:30:00.000Z"
}
```

新規保存時は POST のレスポンス `{ project: {...} }` の `project` が渡されます。
上書き保存時は PUT のレスポンス `{ project: {...} }` の `project` が渡されます。

### `onProjectDelete(projectId)`

削除されたプロジェクトの ID（文字列）が渡されます。

---

## サムネイルの生成例

Canvas 要素からサムネイルを取得する一般的なパターン:

```javascript
function getThumbnailDataUri() {
  const canvas = document.querySelector('#my-canvas');
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}
```

SVG ベースのツールの場合:

```javascript
async function getSvgThumbnailDataUri() {
  const svgEl = document.querySelector('svg');
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}
```

---

## エラー時の挙動

| 状況 | 挙動 |
|---|---|
| 未ログイン（`window.datavizSupabase` なし / セッション切れ） | エラートースト「ログインが必要です」 |
| API 通信エラー | 読み込みモーダル: モーダル内にエラー表示 +「再試行」ボタン。保存モーダル: インラインエラー + エラートースト |
| `setProjectConfig()` 未呼び出しで `showLoadModal()` 等を呼んだ場合 | `console.error` のみ（UIには何も表示しない） |

---

## i18n

モーダルとトーストのテキストはブラウザの言語設定に応じて自動的に日本語/英語で表示されます（`navigator.language` が `ja` で始まる場合は日本語、それ以外は英語）。

ツール開発者側での設定は不要です。

---

## 既存ツールからの移行

段階的に移行できます。新 API を使い始めても、既存の独自モーダルやAPIクライアントはそのまま動作します。

### 移行チェックリスト

1. `dataviz-tool-header.js` が読み込まれていることを確認
2. `header.setProjectConfig({ appName, onProjectLoad, onProjectSave })` を追加
3. 既存の「開く」ボタンのハンドラを `header.showLoadModal()` に変更
4. 既存の「保存」ボタンのハンドラを `header.showSaveModal({...})` に変更
5. 動作確認後、旧モーダルの HTML/コンポーネントと旧 API クライアントファイルを削除



## dataviz-tool-header プロジェクト管理API 移行時の注意

### APIエンドポイントについて

プロジェクト管理APIのバックエンドは **`api.dataviz.jp`** を使用してください。

✅ 正: https://api.dataviz.jp/api/projects
❌ 誤: https://app.dataviz.jp/api/projects



`app.dataviz.jp/api/projects` は旧APIであり、レスポンス形式が異なるため、新しいツールヘッダーの `showLoadModal()` でプロジェクト一覧が正しく表示されません（「保存されたプロジェクトはありません」と表示されてしまいます）。

### 確認方法

お使いのツールで以下のいずれかに該当する場合は修正が必要です：

- `window.datavizApiUrl` が `app.dataviz.jp` を指している
- `setProjectConfig()` の `apiBaseUrl` に `app.dataviz.jp` を指定している
- 旧APIクライアント（`cloud-api.js` 等）が `app.dataviz.jp` にリクエストしている

### 対応

`window.datavizApiUrl` や `apiBaseUrl` の指定を削除するか、`https://api.dataviz.jp` に変更してください。未指定の場合はデフォルトで `api.dataviz.jp` が使われるため、通常は何も指定しなくて構いません。

### 全ツール移行完了後

全ツールの移行が完了次第、`app.dataviz.jp/api/projects` は廃止します。
