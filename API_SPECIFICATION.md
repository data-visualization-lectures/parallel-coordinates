# Dataviz API 仕様書

## 概要
`api.dataviz.jp` で提供されるプロジェクト管理APIの仕様です。
クライアントアプリケーション（各可視化ツール）は、本APIを通じてユーザーのプロジェクトデータの保存、読み込み、更新、削除を行います。

## 認証
全てのエンドポイントで **Bearer Token認証** が必要です。
Supabase Auth (Gotrue) で取得した `access_token` を Authorization ヘッダーに付与してください。

```http
Authorization: Bearer <access_token>
```

---

## エンドポイント一覧

### 1. プロジェクト一覧取得
**GET** `/api/projects`

指定したアプリケーションのプロジェクト一覧を、更新日時の降順で取得します。

**Query Parameters:**
- `app`: (Required) アプリケーション識別子 (例: `voyager`, `kepler.gl`)

**Response (200 OK):**
```json
{
  "projects": [
    {
      "id": "uuid-string",
      "name": "My Project",
      "app_name": "voyager",
      "thumbnail_path": "user_id/uuid.png",
      "created_at": "ISO8601 string",
      "updated_at": "ISO8601 string"
    },
    ...
  ]
}
```

---

### 2. プロジェクト新規作成
**POST** `/api/projects`

新しいプロジェクトを作成し、データを保存します。

**Request Body (JSON):**
```json
{
  "name": "My New Project",           // (Required) プロジェクト名
  "app_name": "voyager",              // (Required) アプリケーション識別子
  "data": { ... },                    // (Required) 保存するJSONデータ本体
  "thumbnail": "data:image/png;..."   // (Optional) サムネイル画像のBase64 Data URI
}
```
*   `thumbnail`: プレフィックス（`data:image/png;base64,` 等）を含むBase64文字列を受け付けます。サーバー側でデコードされ PNG として保存されます。

**Response (200 OK):**
```json
{
  "project": {
    "id": "generated-uuid",
    "name": "My New Project",
    "storage_path": "user_id/uuid.json",
    "thumbnail_path": "user_id/uuid.png",
    ...
  }
}
```

---

### 3. プロジェクト詳細（データ）取得
**GET** `/api/projects/[id]`

指定したプロジェクトの **実データ(JSON)** を取得します。
メタデータではなく、保存されたJSONの中身がそのままレスポンスボディとして返却されます。

**Parameters:**
- `id`: プロジェクトID (UUID)

**Response (200 OK):**
- Content-Type: `application/json`
- Body: 保存されたJSONデータオブジェクト

---

### 4. プロジェクト更新
**PUT** `/api/projects/[id]`

既存プロジェクトの情報を更新します。変更したいフィールドのみを送信してください（Partial Update）。

**Parameters:**
- `id`: プロジェクトID (UUID)

**Request Body (JSON):**
```json
{
  "name": "Updated Name",             // (Optional) プロジェクト名
  "data": { ... },                    // (Optional) 新しいJSONデータ本体
  "thumbnail": "data:image/png;..."   // (Optional) 新しいサムネイル画像(Base64)
}
```
*   `data`: 送信された場合、既存のJSONファイルを上書きします。
*   `thumbnail`: 送信された場合、既存の画像を上書き（または新規作成）し、DBのパス情報を更新します。

**Response (200 OK):**
```json
{
  "project": {
    "id": "uuid",
    "updated_at": "new-timestamp",
    ...
  }
}
```

---

### 5. プロジェクト削除
**DELETE** `/api/projects/[id]`

プロジェクトを削除します。DB上のレコード、JSONファイル、サムネイル画像の全てが削除されます。

**Parameters:**
- `id`: プロジェクトID (UUID)

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 6. サムネイル画像取得
**GET** `/api/projects/[id]/thumbnail`

プロジェクトのサムネイル画像（PNG）をダウンロードします。
`thumbnail_path` が設定されているプロジェクトのみ利用可能です。

**Parameters:**
- `id`: プロジェクトID (UUID)

**Response (200 OK):**
- Content-Type: `image/png`
- Body: PNG画像バイナリデータ

**Response (Errors):**
- `404 thumbnail_not_found`: プロジェクトにサムネイルが設定されていない
```

---

## エラー応答

エラー発生時はステータスコードとともに以下の形式でJSONが返却されます。

```json
{
  "error": "error_code",
  "detail": "Detailed error message (Optional)"
}
```

**主なエラーコード:**
- `400 missing_required_fields`: 必須パラメータ不足
- `401 not_authenticated`: 認証トークンが無効または期限切れ
- `403 subscription_required`: 有効なサブスクリプションがない
- `404 project_not_found`: 指定IDのプロジェクトが存在しない、またはアクセス権がない
- `500 internal_error`: サーバー内部エラー

---

### 7. 署名付きアップロードURL取得（大容量データ用）
**POST** `/api/projects-upload-url`

Vercel Serverless Functions のリクエストボディ上限（4.5MB）を超えるデータを保存する場合に使用します。
Supabase Storage への直接アップロード用の署名付きURLを発行します。

**Request Body (JSON):**
```json
{
  "project_id": "existing-uuid",   // (Optional) 既存プロジェクトの更新時に指定。省略時は新規UUID生成
  "type": "data"                   // (Required) "data" または "thumbnail"
}
```

**Response (200 OK):**
```json
{
  "upload_url": "https://xxx.supabase.co/storage/v1/...",
  "storage_path": "user_id/project_id.json",
  "project_id": "uuid-string"
}
```

**エラー:**
- `400 missing_or_invalid_type`: `type` パラメータが不正
- `404 project_not_found`: 指定した `project_id` が存在しないか、所有権がない

---

### 大容量データの保存フロー

4.5MBを超えるプロジェクトデータを保存する場合、以下の3ステップで行います。

**Step 1: 署名付きURLを取得**
```javascript
const res = await fetch("https://api.dataviz.jp/api/projects-upload-url", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "data" })  // 更新時は project_id も指定
});
const { upload_url, storage_path, project_id } = await res.json();
```

**Step 2: データを直接 Storage へアップロード**
```javascript
await fetch(upload_url, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(projectData)
});
```

**Step 3: メタデータのみ API へ送信**
```javascript
// 新規作成
await fetch("https://api.dataviz.jp/api/projects", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "My Project",
    app_name: "kepler-gl",
    storage_path,
    project_id,
    storage_uploaded: true,
    thumbnail: thumbnailBase64  // サムネイルは小さいのでそのまま送信可
  })
});

// 更新
await fetch(`https://api.dataviz.jp/api/projects/${project_id}`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Updated Name",
    storage_uploaded: true,
    thumbnail: thumbnailBase64
  })
});
```

**POST `/api/projects` の `storage_uploaded` モード:**
- `storage_uploaded: true` が指定された場合、`data` フィールドは不要
- 代わりに `project_id` と `storage_path` が必須
- サーバー側で Storage にファイルが存在するか確認してからDB登録

**PUT `/api/projects/[id]` の `storage_uploaded` モード:**
- `storage_uploaded: true` が指定された場合、`data` フィールドは不要
- サーバー側での Storage アップロードをスキップし、DBのメタデータのみ更新

> **Note:** 従来のフロー（`data` フィールド付き POST/PUT）は引き続き利用可能です。4.5MB以下のデータであれば従来フローの方がシンプルです。

---

## クライアント実装仕様

### URLパラメータ

各アプリケーションは、以下のURLパラメータをサポートすることを推奨します。

- **`project_id`**: プロジェクトID (UUID)
  - アプリケーション起動時にこのパラメータが付与されている場合、自動的に当該プロジェクトのデータをサーバーから読み込み、復元します。
  - 例: `https://app.dataviz.jp/?project_id=uuid-string`
