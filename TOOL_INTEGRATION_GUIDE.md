# クライアントツール連携実装ガイド

## 概要
`auth.dataviz.jp` (認証・管理サイト) から、保存されたプロジェクトIDを受け取り、各ツール（RawGraphs, SVG Texturesなど）の起動時に自動的にデータをロードする機能を実装するためのガイドラインです。

## 1. 連携の仕組み
1.  ユーザーが `auth.dataviz.jp` で「開く」をクリック。
2.  各ツールのURLへ `?project_id={UUID}` 付きで遷移 (例: `https://rawgraphs.dataviz.jp/?project_id=...`)。
3.  ツール側で、URLクエリから `project_id` を検知。
4.  `auth.dataviz.jp` のAPIを叩いてプロジェクトデータを取得し、アプリの状態を復元 (`hydrate`)。

## 2. API 仕様
認証サイト側に以下のAPIを用意しました。

- **Endpoint**: `GET https://auth.dataviz.jp/api/projects/:id`
- **Authentication**: Cookie (Cross-Origin)
    - リクエスト時に `credentials: 'include'` が **必須** です。
    - 認証はCookie（`dataviz.jp`ドメイン共有）で行われます。
    - ログインしていない場合や、サブスクリプションが無効な場合はエラー (401/403) が返ります。
- **Response**: 保存されたプロジェクトのJSONデータ
    - 各ツールが保存時にPOSTしたJSONオブジェクトがそのまま返却されます。

## 3. 実装のポイント
アプリケーションの初期化フロー（`App.js` や `index.js` 等）に以下のロジックを追加してください。

### コードスニペット例

**1. API呼び出し関数**
```javascript
// utils/cloudApi.js (または適切な場所)
const AUTH_API_BASE = 'https://auth.dataviz.jp/api/projects';

export async function fetchProjectFromAuthApi(projectId) {
  const endpoint = `${AUTH_API_BASE}/${projectId}`;
  
  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'include', // 重要: これがないとCookieが送信されず401エラーになります
    headers: {
        'Content-Type': 'application/json',
    }
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
        throw new Error("認証エラー: ログインまたはサブスクリプションが必要です。");
    }
    throw new Error(`Failed to load project: ${response.status}`);
  }
  
  return await response.json();
}
```

**2. 起動時の読み込みロジック (Reactの例)**
```javascript
// App.js

function App() {
  // ... existing code ...

  useEffect(() => {
    // URLからパラメータを取得
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project_id');

    if (projectId) {
      console.log("Loading project from Cloud:", projectId);
      
      // 必要に応じてローディングUIを表示
      // setLoading(true);

      fetchProjectFromAuthApi(projectId)
        .then(projectData => {
           // 各ツール固有の復元ロジックを呼び出す
           // 例: restoreState(projectData);
           // 例: hydrateFromSavedProject(projectData);
           
           console.log("Project loaded successfully");
           
           // URLからIDを削除してスッキリさせる (任意)
           window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(err => {
          console.error("Project Load Error:", err);
          alert("プロジェクトの読み込みに失敗しました。\nauth.dataviz.jp でログインしているか確認してください。");
        })
        .finally(() => {
          // setLoading(false);
        });
    }
  }, []); // 初回マウント時のみ実行

  // ...
}
```

## 4. 注意点
- **CORS設定**: 
  - `auth.dataviz.jp` 側で、登録済みのツールURL（例: `https://rawgraphs.dataviz.jp`, `https://svg-textures.dataviz.jp`）からのアクセスを許可しています。
  - 新しいツールを追加する場合は、`auth.dataviz.jp` の許可リストに追加設定が必要です。
- **データ形式**: 
  - APIは保存されたJSONをそのまま返します。データ構造のバリデーションやマイグレーションが必要な場合は、ツール側で行ってください。
