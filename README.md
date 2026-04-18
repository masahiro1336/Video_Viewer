# VAULT GitHub Pages版

このフォルダをそのまま GitHub レポジトリに置けば、`Settings > Pages` から公開できる構成です。

## フォルダ構成

```text
vault-github-pages/
├─ index.html
├─ manifest.webmanifest
├─ .nojekyll
├─ README.md
├─ js/
│  ├─ app.js
│  ├─ config.js
│  └─ config.example.js
└─ assets/
   ├─ css/
   │  └─ styles.css
   └─ icons/
      ├─ favicon.svg
      ├─ apple-touch-icon.png
      └─ replace-your-icons-here.txt
```

## GitHub Pages 公開手順

1. GitHub で新しいレポジトリを作成
2. このフォルダ内のファイルを全部アップロード
3. GitHub の **Settings** を開く
4. 左メニューの **Pages** を開く
5. **Build and deployment** で以下を設定
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`
6. Save
7. 数分後に公開URLが表示されます

## 最初に編集するファイル

### `js/config.js`

ここでアプリ名・タイトル・Supabase・アイコンパスを変更します。

```js
window.APP_CONFIG = {
  appName: 'VAULT',
  appTagline: 'Video Management System',
  pageTitle: 'VAULT — Video Manager Pro',
  collectionTitle: 'Collection',
  emptyTitle: 'Your vault is empty',
  emptySub: '上のボタンからローカル動画・音楽・画像を選んでライブラリへ追加してください',
  loginButtonText: 'Enter Vault',
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  favicon: './assets/icons/favicon.svg',
  appleTouchIcon: './assets/icons/apple-touch-icon.png'
};
```

## アイコン差し替え

### favicon
- 置き換え先: `assets/icons/favicon.svg`
- 推奨: SVG
- ブラウザタブに表示されます

### Apple Touch Icon
- 置き換え先: `assets/icons/apple-touch-icon.png`
- 推奨サイズ: `180 x 180`

### 独自アイコンを増やしたい場合
`assets/icons/` に画像を追加して、`index.html` や `js/config.js` から相対パスで参照してください。

例:
- `./assets/icons/logo.svg`
- `./assets/icons/menu/search.png`
- `./assets/icons/menu/play.png`

## この分割で変更しやすくなった点

- `index.html` : 画面の骨組み
- `assets/css/styles.css` : 見た目だけを編集
- `js/app.js` : 機能だけを編集
- `js/config.js` : タイトル・Supabase・アイコン差し替え
- `assets/icons/` : faviconや各種画像差し替え

## 注意

- GitHub Pages は静的ホスティングなので、サーバー側の秘密鍵は置けません
- Supabase の **anon key** は公開サイトで使う前提のキーです
- `config.js` の値はブラウザから見えるので、**service_role key は絶対に入れない** でください

## アップロード後に確認すること

- ページが開くか
- favicon が表示されるか
- `config.js` のタイトル変更が反映されるか
- Supabase ログインが動くか
- 相対パスの画像が読めるか

