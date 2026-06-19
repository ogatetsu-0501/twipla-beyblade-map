import { waitRandomDelay } from './utils';

type FetchOptions = {
  userAgent: string;
  minimumDelayMilliseconds: number;
  maximumDelayMilliseconds: number;
};

/**
 * TwiPlaへ連続アクセスしないよう、各取得前に待機してHTMLを取得します。
 */
export class SlowHttpClient {
  private requestCount = 0;

  public constructor(private readonly options: FetchOptions) {}

  public async getText(url: string): Promise<string> {
    const hasPreviousRequest = this.requestCount > 0;

    if (hasPreviousRequest) {
      await waitRandomDelay(
        this.options.minimumDelayMilliseconds,
        this.options.maximumDelayMilliseconds,
      );
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.5',
        'User-Agent': this.options.userAgent,
      },
      redirect: 'follow',
    });

    this.requestCount += 1;

    const isRateLimited = response.status === 429;
    const isAccessDenied = response.status === 403;
    const shouldStop = isRateLimited || isAccessDenied;

    if (shouldStop) {
      throw new Error(`TwiPlaへのアクセスを中止しました: HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`HTMLの取得に失敗しました: HTTP ${response.status} ${url}`);
    }

    return response.text();
  }
}
