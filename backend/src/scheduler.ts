/**
 * スケジューラー
 *
 * node-cron を使って材料費自動取込を定期実行する。
 * デフォルト: 毎日 06:00 (Asia/Tokyo)
 *
 * 設定:
 *   SCRAPER_CRON=0 6 * * *  (cron式, デフォルト)
 *
 * 将来: サーバー cron（systemd timer / crontab）へ移行しやすいよう
 *       ロジックは scraper.service に閉じ込め、ここは起動のみ担当する。
 */

import cron from 'node-cron';
import { logger } from './utils/logger';
import { runKakenUpdate } from './modules/delivery-imports/delivery-imports.service';

const DEFAULT_CRON = '0 6 * * *'; // 毎日 06:00

export function startScheduler(): void {
  const schedule = process.env.SCRAPER_CRON ?? DEFAULT_CRON;

  if (!cron.validate(schedule)) {
    logger.warn(`Scheduler: 無効な cron 式 "${schedule}"。スケジューラーを起動しません。`);
    return;
  }

  cron.schedule(
    schedule,
    async () => {
      logger.info('Scheduler: 自動材料費取込を開始します...');
      try {
        const result = await runKakenUpdate();
        logger.info(
          `Scheduler: 完了 fetched=${result.fetched_count} imported=${result.imported_count} failed=${result.failed_count}`
        );
      } catch (e) {
        logger.error(`Scheduler: 自動取込に失敗しました: ${(e as Error).message}`);
      }
    },
    { timezone: 'Asia/Tokyo' }
  );

  logger.info(`Scheduler: 起動 スケジュール="${schedule}" (Asia/Tokyo)`);
}
