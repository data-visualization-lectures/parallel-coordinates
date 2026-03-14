# サブヘッダー導入時のツール側ファイル仕様

`SUBHEADER_IMPLEMENTATION_PLAN.md`に記載された計画（方針2：新しいコンポーネントとして提供）に基づき、各データ可視化ツール側で用意・変更すべきファイルの仕様は以下の通りです。

---

## 0. 前提（このドキュメントの対象範囲）

このドキュメントは、`dataviz-tool-header.js`（サブヘッダー）導入の仕様です。  
認証自体は `dataviz-auth-client.js` が担当するため、以下の依存スクリプトを先に読み込む必要があります。

```html
<script src="https://auth.dataviz.jp/lib/supabase.js"></script>
<script src="https://auth.dataviz.jp/lib/dataviz-auth-client.js"></script>
```

- 認証のみが必要なツールでは、`dataviz-tool-header.js` の組み込みは不要です。
- `dataviz-tool-header.js` は、保存/読込UIなどのサブヘッダーを表示したい場合のみ追加してください。

---

## 1. HTMLファイルの変更点

各ツールの`index.html`（またはメインとなるHTMLファイル）に、以下の要素とスクリプトタグを追加します。

### a. `dataviz-tool-header.js`スクリプトの読み込み
`<body>`タグの閉じタグの直前、または`<head>`タグ内に、`defer`属性を付けて追加することを推奨します。

```html
<!-- スクリプトの読み込み（CDNまたは適切なパスを指定） -->
<script src="https://auth.dataviz.jp/lib/dataviz-tool-header.js" defer></script>
```
**推奨される配置理由:**
- `defer`属性により、HTMLのパースをブロックせず、バックグラウンドでスクリプトが読み込まれます。
- `DOMContentLoaded`イベント発生後に実行されるため、`<dataviz-tool-header>`要素がDOM上に存在していることを保証できます。

**Next.js (`next/script`) の場合:**
- `supabase.js` は `beforeInteractive` を推奨。
- `dataviz-auth-client.js` / `dataviz-tool-header.js` は `afterInteractive` で読み込んでください。

### b. `<dataviz-tool-header>`要素の配置
共通ヘッダー（`dataviz-header`）のすぐ下、またはサブヘッダーを表示したい任意の場所に配置します。

```html
<!-- 共通ヘッダーのすぐ下に配置する場合 -->
<dataviz-header></dataviz-header>
<dataviz-tool-header></dataviz-tool-header>
<!-- ここにツール本体のコンテンツが続く -->
```
**注意点:**
- この要素はカスタムWebコンポーネントとして機能します。

---

## 2. JavaScriptファイルの変更点

各ツールのメインJavaScriptファイル（またはサブヘッダーの機能を初期化するファイル）に、以下のコードを追加します。

### a. サブヘッダーの設定 (`setConfig`メソッドの呼び出し)
`DOMContentLoaded`イベントリスナー内で`setConfig`メソッドを呼び出し、ボタンの構成とロゴ画像を設定します。

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const toolHeader = document.querySelector('dataviz-tool-header');

  if (toolHeader) {
    toolHeader.setConfig({
      logoUrl: '/path/to/your/tool-logo.png', // オプション: ツールのロゴ画像のURL
      buttons: [
        // ここにボタンの定義を記述します
        // { label: 'ボタンのテキスト', action: () => { /* ボタンクリック時の処理 */ } },
        // { label: 'リンクのテキスト', type: 'link', href: 'リンク先URL' }
      ]
    });
  }
});
```

### b. `config`オブジェクトのトップレベルプロパティの仕様

`setConfig`メソッドに渡す`config`オブジェクトは、以下のトップレベルプロパティを持ちます。

-   **`backgroundColor`** (任意, `string`): ツールヘッダーの背景色を指定するCSS色値（例: `#003355`、`rgb(0,51,85)`）。指定しない場合、デフォルトのダークグレーが適用されます。
-   **`logo`** (任意, `object`): サブヘッダーの左側に表示されるツールのロゴ設定。このオブジェクトは以下のプロパティを持ちます。
    -   **`type`** (任意, `string`, デフォルト: `'image'`): ロゴの種類を指定します。
        -   `'image'`: 画像のみを表示します。
        -   `'text'`: テキストのみを表示します。
        -   `'image-and-text'`: 画像とテキストを並べて表示します。
    -   **`src`** (`type`が`'image'`または`'image-and-text'`の場合必須, `string`): ロゴ画像のURL。
    -   **`text`** (`type`が`'text'`または`'image-and-text'`の場合必須, `string`): ロゴとして表示するテキスト。
    -   **`alt`** (任意, `string`): 画像の代替テキスト。`type`が`'image'`または`'image-and-text'`の場合に有効。
    -   **`textClass`** (任意, `string`): テキストに適用する追加のTailwind CSSクラス（例: `font-bold text-lg`）。
    -   **`imgClass`** (任意, `string`): 画像に適用する追加のTailwind CSSクラス。
-   **`buttons`** (任意, `Array<object>`): サブヘッダーに表示されるボタンまたはリンクの定義を格納した配列。詳細は後述します。

### c. `buttons`配列の構成要素の仕様

`setConfig`メソッドに渡す`config`オブジェクトの`buttons`プロパティは、以下のいずれかの形式のオブジェクトを要素とする配列です。

**注:** ボタンおよびドロップダウンアイテムの背景色とボーダー色は、ツールヘッダーの`backgroundColor`から自動的に派生します。ボタンのデフォルトの背景色はヘッダー背景より10%暗く、ホバー時は20%暗くなります。

#### i. アクションボタン (クリック時にJavaScript関数を実行)

-   **`label`** (必須, `string`): ボタンに表示されるテキスト。
-   **`action`** (必須, `function`): ボタンがクリックされたときに実行されるJavaScript関数。この関数は、ツール固有のロジック（データの読み込み、エクスポート処理など）を実装します。
-   **`type`** (任意, `'button'`): 明示的にボタンとして定義する場合。デフォルトは`'button'`として扱われます。
-   **`align`** (任意, `'left'|'right'`): ボタンの配置位置。`'right'`を指定すると右側に配置されます。デフォルトは`'left'`です。
-   **`id`** (任意, `string`): 必要であればボタンに一意のIDを設定できます。

**例:**
```javascript
{
  label: 'サンプルデータをロード',
  action: () => {
    console.log('サンプルデータ読み込み処理を実行します...');
    // ここにツール固有のサンプルデータ読み込みロジックを実装
  }
}
```

#### ii. リンクボタン (クリック時に指定のURLへ遷移)

-   **`label`** (必須, `string`): リンクに表示されるテキスト。
-   **`type`** (必須, `'link'`): リンクとして定義することを示します。
-   **`href`** (必須, `string`): リンク先のURL。相対パス、絶対パス、`_blank`を指定する外部URLなどが指定可能です。
-   **`target`** (任意, `string`): リンクのターゲット属性（例: `_blank`で新しいタブを開く）。
-   **`id`** (任意, `string`): 必要であればリンクに一意のIDを設定できます。

**例:**
```javascript
{
  label: 'ヘルプドキュメント',
  type: 'link',
  href: './docs/help.html',
  target: '_blank' // 新しいタブで開く
},
{
  label: 'お問い合わせ',
  type: 'link',
  href: 'mailto:support@dataviz.jp'
}
```

#### iii. ドロップダウンボタン (複数の選択肢をまとめる)

-   **`label`** (必須, `string`): ドロップダウンボタンのメインテキスト。
-   **`type`** (必須, `'dropdown'`): ドロップダウンとして定義することを示します。
-   **`items`** (必須, `Array<object>`): ドロップダウン内に表示される選択肢の配列。各要素は「i. アクションボタン」または「ii. リンクボタン」のいずれかの形式に従います。`id`は自動生成されます。

**例:**
```javascript
{
  label: 'サンプル',
  type: 'dropdown',
  items: [
    {
      label: 'シンプル',
      action: () => loadSimpleSample()
    },
    {
      label: '詳細なレポート',
      type: 'link',
      href: './reports/detail.html'
    }
  ]
}
```

---

## 補足事項

-   **Web Componentsのサポート:** 最新のブラウザはWeb Componentsをネイティブでサポートしていますが、古いブラウザをサポートする必要がある場合は、Web Components用のPolyfill（例：`webcomponents-loader.js`）の導入を検討してください。
-   **レイアウト調整（重なり回避）:** `dataviz-header` は `height: 48px` の固定ヘッダーです。`dataviz-tool-header` も `position: fixed; top: 48px;` で表示されるため、メインコンテンツに上余白を設定してください。`dataviz-tool-header` の高さは内容により可変ですが、現行スタイルでは約 `56px` が目安です。開始値として `padding-top: 104px`（`48 + 56`）を推奨します。
-   **スタイル:** サブヘッダーの基本的なスタイルはWebコンポーネント内でカプセル化されているため、ツール側のCSSに影響されません。
-   **エラーハンドリング:** `toolHeader`が存在しない場合（例：HTMLに`<dataviz-tool-header>`タグが記述されていない場合）に備え、`if (toolHeader)`によるチェックを推奨します。

```css
/* 認証のみ */
main { padding-top: 48px; }

/* 認証 + ツールヘッダー */
main { padding-top: 104px; } /* 必要に応じて増減 */
```

## 3. Toast UIの利用 (プロジェクト保存・呼び出し結果通知用)

プロジェクトの保存や呼び出しの結果をユーザーに通知するため、ツールヘッダー内に表示され自動的に消える共通のトーストUIを提供します。

### a. トースト表示メソッド (`showMessage`の呼び出し)
ツールのJavaScriptから、以下のメソッドを呼び出すことでトーストを表示できます。

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const toolHeader = document.querySelector('dataviz-tool-header');

  if (toolHeader) {
    // 成功メッセージの例
    toolHeader.showMessage('プロジェクトが正常に保存されました！', 'success');

    // エラーメッセージの例
    toolHeader.showMessage('プロジェクトの読み込みに失敗しました。', 'error');

    // 情報メッセージの例 (デフォルト)
    toolHeader.showMessage('プロジェクトを保存しています...');
  }
});
```

### b. `showMessage`メソッドの仕様

-   **`message`** (必須, `string`): トーストに表示されるテキストメッセージ。
-   **`type`** (任意, `string`): メッセージの種類を示します。以下の値が利用可能です。
    -   `'success'` (デフォルト): 成功を示すメッセージ。緑色の背景など、成功を連想させるスタイルで表示されます。
    -   `'error'`: エラーを示すメッセージ。赤色の背景など、エラーを連想させるスタイルで表示されます。
    -   `'info'`: 一般的な情報メッセージ。
-   **`duration`** (任意, `number`): トーストが表示される時間（ミリ秒単位）。デフォルトは3000ミリ秒（3秒）です。

**表示場所:** トーストはツールヘッダーの内部に表示され、一定時間後に自動的にフェードアウトします。
