import { Request, Response } from 'express';
import { dashboardService } from './dashboard.service';

class DashboardController {
  /**
   * GET /api/dashboard/summary
   * ダッシュボードサマリー
   *
   * クエリパラメータ（省略時は当月）:
   *   date_from  YYYY-MM-DD
   *   date_to    YYYY-MM-DD
   */
  async getSummary(req: Request, res: Response): Promise<void> {
    const { date_from, date_to } = req.query;
    const summary = dashboardService.getSummary({
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
    });
    res.json({ success: true, data: summary });
  }
}

export const dashboardController = new DashboardController();
