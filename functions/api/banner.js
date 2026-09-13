import { json, error, getBannerData } from './_utils.js';

// 默认返回含图片全文的完整版（旧页面与 sync.js 离线缓存依赖它）；
// 带 ?slim=1 时只返回 has_image 标记，体积从数百 KB 降到 1KB 以内。
// 新页面统一用 slim=1，图片改走 /api/announcements/images?ids= 按需取。
export async function handleGetBanner(env, url) {
  try {
    const slim = url && url.searchParams.get('slim') === '1';
    return json(await getBannerData(env, { slim }));
  } catch {
    return error('横幅数据获取失败', 500);
  }
}
