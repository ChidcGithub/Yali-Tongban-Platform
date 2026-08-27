import { json, error } from './_utils.js';

export async function handleGetPublicSettings(env) {
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('site_closed', 'site_closed_message')").all();
    const s = {};
    rows.results.forEach(r => { s[r.key] = r.value; });
    return json({ site_closed: s.site_closed === 'true', site_closed_message: s.site_closed_message || '' });
  } catch {
    return json({ site_closed: false, site_closed_message: '' });
  }
}
