import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { Cafe } from '../models/cafe.entity';
import { CafeStatus } from '../types';

/**
 * Sitemap sinh động từ dữ liệu thật.
 *
 * Sitemap tĩnh chỉ liệt kê được vài đường dẫn cố định, trong khi thứ đáng được
 * lập chỉ mục nhất lại là trang của từng cơ sở — đó mới là trang trả lời đúng
 * những truy vấn như "sân xe RC quận 7". Cơ sở thì thêm bớt liên tục, nên danh
 * sách phải đọc từ cơ sở dữ liệu chứ không chép tay.
 *
 * Chỉ liệt kê cơ sở đang hoạt động: đưa cơ sở đã ẩn vào sitemap là chủ động dẫn
 * bot tới một trang sẽ trả về "không tồn tại".
 */

/** Chuỗi trong XML phải thoát ký tự, tên cơ sở có thể chứa `&`. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface SitemapEntry {
  path: string;
  changefreq: string;
  priority: string;
  lastmod?: Date;
}

/** Đường dẫn tĩnh công khai. Khu vực sau đăng nhập cố ý không có mặt ở đây. */
const STATIC_ENTRIES: SitemapEntry[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/cafes', changefreq: 'daily', priority: '0.9' },
  { path: '/contests', changefreq: 'daily', priority: '0.8' },
  { path: '/leaderboards/global', changefreq: 'weekly', priority: '0.5' },
];

export const seoController = {
  // GET /api/v1/seo/sitemap.xml
  async getSitemap(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const base = env.frontendUrl.replace(/\/$/, '');

      const cafes = await AppDataSource.getRepository(Cafe).find({
        where: { status: CafeStatus.ACTIVE },
        select: ['slug', 'updatedAt'],
        order: { updatedAt: 'DESC' },
      });

      const entries: SitemapEntry[] = [
        ...STATIC_ENTRIES,
        ...cafes
          .filter((cafe) => cafe.slug)
          .map((cafe) => ({
            path: `/cafes/${cafe.slug}`,
            changefreq: 'weekly',
            priority: '0.8',
            lastmod: cafe.updatedAt,
          })),
      ];

      const urls = entries
        .map((entry) => {
          const lastmod = entry.lastmod
            ? `\n    <lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod>`
            : '';
          return `  <url>
    <loc>${escapeXml(base + entry.path)}</loc>${lastmod}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
        })
        .join('\n');

      res.type('application/xml');
      // Bot đọc lại sitemap khá thường xuyên; đọc DB mỗi lần là lãng phí, mà
      // sitemap trễ một giờ cũng không ảnh hưởng gì.
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
    } catch (err) {
      next(err);
    }
  },
};
