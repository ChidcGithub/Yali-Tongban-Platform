function safeGetItem(key) {
  try { const v = localStorage.getItem(key); return v !== null ? v : null; } catch { return null; }
}
function safeSetItem(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}
function safeRemoveItem(key) {
  try { localStorage.removeItem(key); } catch {}
}

function formatTime(t) {
  if (!t || typeof t !== 'string') return t || '';
  const match = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) { const n = new Date(t); return isNaN(n.getTime()) ? t : n.toLocaleString('zh-CN', { hour12: false }); }
  const [, y, mo, d, h, mi] = match;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  const bj = new Date(utc + 8 * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(s || ''));
  return div.innerHTML;
}

function attrEscape(s) {
  if (s == null) return '';
  return String(s).replace(/[&"'\n\r<>]/g, c => ({'&': '&amp;', '"': '&quot;', "'": '&#39;', '\n': '&#10;', '\r': '&#13;', '<': '&lt;', '>': '&gt;'})[c]);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const DEPARTMENTS = ['书记处', '团总支', '社团部', '记者站', '宣传部', '组织部', '青志协', '办公室'];

function isValidClass(cls) {
  const n = Number(cls);
  if (isNaN(n) || !Number.isInteger(n) || String(cls).length !== 4) return false;
  return (n >= 2501 && n <= 2527) || (n >= 2401 && n <= 2429) || (n >= 2301 && n <= 2329);
}

function parseImages(val) {
  if (!val) return [];
  if (typeof val === 'string' && val.startsWith('[')) { try { const a = JSON.parse(val); return Array.isArray(a) ? a : [val]; } catch {} return [val]; }
  if (Array.isArray(val)) return val;
  return [val];
}

async function progressiveRender(container, items, renderItem, chunkSize = 8) {
  const total = items.length;
  if (total === 0) return;
  showNavLoading('加载中...');
  for (let i = 0; i < total; i += chunkSize) {
    await new Promise(r => requestAnimationFrame(r));
    const chunk = items.slice(i, i + chunkSize);
    const html = chunk.map(renderItem).join('');
    container.insertAdjacentHTML('beforeend', html);
    showNavLoadingProgress(Math.min(i + chunkSize, total), total);
  }
  hideNavLoading();
}

function previewImageFile(inputEl, previewEl, labelEl, maxSize) {
  const file = inputEl.files[0];
  if (!file) return;
  if (file.size > maxSize) { toast(`文件过大，最大 ${Math.round(maxSize/1024)}KB`, 'error'); inputEl.value = ''; return; }
  if (labelEl) labelEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { if (previewEl) { previewEl.src = e.target.result; previewEl.style.display = ''; } };
  reader.readAsDataURL(file);
}

function Card(header, body, footer, className) {
  var cls = 'card' + (className ? ' ' + className : '');
  var h = header ? '<div class="card-header">' + header + '</div>' : '';
  var f = footer ? '<div class="card-footer">' + footer + '</div>' : '';
  return '<div class="' + cls + '">' + h + '<div class="card-body">' + body + '</div>' + f + '</div>';
}

function Badge(text, type) {
  var t = type || 'pending';
  var badgeClass = 'badge badge-' + t;
  return '<span class="' + badgeClass + '">' + escapeHtml(text) + '</span>';
}

function Button(config) {
  var cls = 'btn btn-' + (config.variant || 'outline');
  if (config.size) cls += ' btn-' + config.size;
  var attrs = '';
  if (config.data) { for (var k in config.data) { attrs += ' data-' + k + '="' + attrEscape(String(config.data[k])) + '"'; } }
  if (config.action) attrs += ' data-action="' + config.action + '"';
  if (config.disabled) attrs += ' disabled';
  if (config.id) attrs += ' id="' + config.id + '"';
  var iconHtml = config.icon ? '<span style="display:inline-flex;vertical-align:middle">' + config.icon + '</span> ' : '';
  return '<button class="' + cls + '"' + attrs + ' type="' + (config.type || 'button') + '">' + iconHtml + escapeHtml(config.text) + '</button>';
}

function EmptyState(icon, text, subtext) {
  var html = '<div class="empty-state">';
  if (icon) html += '<div class="empty-state-icon">' + icon + '</div>';
  html += '<p>' + escapeHtml(text) + '</p>';
  if (subtext) html += '<p class="empty-state-subtext">' + escapeHtml(subtext) + '</p>';
  return html + '</div>';
}

function MetaRow(items) {
  return items.map(function(item) {
    return '<div class="meta-row"><span class="meta-label">' + escapeHtml(item.label) + '</span><span class="meta-value">' + escapeHtml(item.value || '—') + '</span></div>';
  }).join('');
}

function CommentItem(c) {
  var actionsHtml = '';
  if (c.actions && c.actions.length) {
    actionsHtml = '<div class="comment-actions">' + c.actions.map(function(a) {
      var extraAttrs = '';
      if (a.data) {
        for (var k in a.data) {
          if (Object.prototype.hasOwnProperty.call(a.data, k)) {
            var attrName = k.replace(/([A-Z])/g, '-$1').toLowerCase();
            extraAttrs += ' data-' + attrName + '="' + attrEscape(String(a.data[k])) + '"';
          }
        }
      }
      return '<button class="btn btn-sm btn-text" data-action="' + a.action + '" data-comment-id="' + c.id + '"' + extraAttrs + '>' + escapeHtml(a.text) + '</button>';
    }).join('') + '</div>';
  }
  return '<div class="comment-item" data-comment-id="' + c.id + '"><div class="comment-body"><div class="comment-author">' + escapeHtml(c.author || '') + '</div><div class="comment-text">' + (c.html || escapeHtml(c.text || '')) + '</div><div class="comment-time">' + (c.time || '') + '</div>' + actionsHtml + '</div></div>';
}

function clickFileInput(dataset, target) {
  var id = dataset.target || 'fileInput';
  var input = document.getElementById(id);
  if (input) input.click();
}

function closeActiveModal() {
  closeModal(document.getElementById('modalContainer'));
}

function ImageThumb(url, alt) {
  if (!url) return '';
  var a = alt || '';
  return '<img class="img-thumb" src="' + attrEscape(url) + '" alt="' + attrEscape(a) + '" loading="lazy" style="max-width:120px;max-height:90px;border-radius:var(--md-shape-sm);object-fit:cover;cursor:pointer" data-action="openLightbox" data-src="' + attrEscape(url) + '">';
}
