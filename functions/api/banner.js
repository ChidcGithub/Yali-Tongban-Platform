import { json, error, getBannerData } from './_utils.js';

export async function handleGetBanner(env) {
  try {
    return json(await getBannerData(env));
  } catch {
    return error('横幅数据获取失败', 500);
  }
}
