# ベイブレードイベントマップ

TwiPla上の「ベイブレード」検索結果を1日1回取得し、開催場所を地図へ表示する非公式の静的サイトです。

## 主な動作

- GitHub Actionsを毎日03:00（JST）に実行
- TwiPlaの検索結果を`limit~1000`で取得
- 各イベント詳細を8〜15秒間隔で1件ずつ取得
- TwiPla内の座標、住所、施設名、詳細本文を順番に解析
- 座標がなければNominatimで補完
- 公開データを変換済みの`events.bin`として生成
- `dist`だけをGitHub Pages用artifactとして公開
- リポジトリへ取得データをcommitしない
- マーカーのマウスオーバーで大会名と開催日時を表示
- マーカーのクリックでTwiPlaを新しいタブで表示
- 座標を取得できないイベントを地図外に一覧表示
- 現在地を許可された場合は現在地へ移動
- 現在地を利用できない場合は「東京都世田谷区北沢2丁目4−5 mosia 4F」を中心に表示

## 初期設定

### 1. 依存関係をインストール

```bash
npm install
```

初回インストール後に生成される`package-lock.json`もリポジトリへcommitしてください。GitHub Actionsは`npm ci`を使います。

### 2. ローカル確認

実際にTwiPlaへアクセスするため、スクレイピングには時間がかかります。

```bash
npm run scrape
npm run check
npm run dev -- --host 0.0.0.0
```

`npm run dev`を使う場合は、`package.json`へ次を追加しても構いません。

```json
"dev": "vite"
```

### 3. GitHub Pagesを有効化

GitHubのリポジトリ設定で、次の順番に操作します。

1. `Settings`
2. `Pages`
3. `Build and deployment`
4. `Source`を`GitHub Actions`に変更

その後、`Actions`から`Scrape and deploy GitHub Pages`を手動実行してください。

## 取得間隔

GitHub Actionsでは次の環境変数を設定しています。

```text
REQUEST_DELAY_MIN_MS=8000
REQUEST_DELAY_MAX_MS=15000
SEARCH_LIMIT=1000
```

新規または再取得対象が多い場合は、詳細取得に時間がかかります。403または429を受けた場合は処理を中止します。

## 公開データについて

`public/data/events.bin`はActions実行中に生成され、GitHub Pagesのartifactへだけ含まれます。リポジトリ履歴には残りません。

ブラウザ側に表示処理がある静的サイトのため、完全な秘匿を目的としたものではありません。JSONをそのまま配置せず、ファイルを直接開いた際に内容を読みにくくするための処理です。

## 変更しやすい箇所

検索キーワード、初期表示住所、待機時間などは以下にまとまっています。

```text
src/scraper/constants.ts
.github/workflows/deploy-pages.yml
```


### 詳細SNSリンクによる除外

非表示対象のXアカウントURLは、次の定数で管理します。

```text
src/scraper/constants.ts
EXCLUDED_DETAIL_SOCIAL_LINK_PATTERNS
```

例:

```ts
export const EXCLUDED_DETAIL_SOCIAL_LINK_PATTERNS = [
  'x.com/takashi',
  'x.com/another_account',
];
```

`twitter.com`のURLも比較時に`x.com`へ正規化されます。

## 注意事項

- 本サイトはTwiPlaおよび運営会社とは関係のない非公式サイトです。
- イベント本文、画像、参加者名、コメントは公開データへ保存しません。
- 取得するのはイベント名、日時、URL、場所情報、座標など必要最小限です。
- TwiPla側のHTML構造が変更された場合はパーサーの修正が必要です。
- 地図タイルはOpenStreetMapを使用します。
- 座標補完にはNominatimを低速で使用し、結果をGitHub Actionsのキャッシュへ保存します。
