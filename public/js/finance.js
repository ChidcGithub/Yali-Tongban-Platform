let user = null;
let allFinance = [];
let _filterYear = null;
let _filterMonth = null;
let _filterDept = '';
let _typeFilter = null;
let _pendingFilter = false;
let _deptList = [];
let _financeCaptcha = null;
// 列表接口瘦身后：图片走 /api/finance/images?ids= 按需拉取，内存缓存
const financeImgCache = {};
const FIN_IMG_FALLBACK = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22200%22><rect fill=%22%23e8eaed%22 width=%22240%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%237f8c8d%22 font-size=%2214%22>图片加载失败</text></svg>";

function getMonthLabel(y, m) {
  return `${y}年${String(m).padStart(2, '0')}月`;
}

function getCurrentYearMonth() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function getMonthFromDate(iso) {
  const d = new Date(iso);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function filterByMonth(list, y, m) {
  if (y == null || m == null) return list;
  return list.filter(f => {
    const ym = getMonthFromDate(f.created_at);
    return ym.y === y && ym.m === m;
  });
}

async function init() {
  const cachedUser = getUser();
  if (cachedUser && isAdmin(cachedUser)) {
    const fab = document.getElementById('fabBtn');
    if (fab) fab.style.display = '';
  }
  user = await requireMember();
  if (!user) return;
  if (isAdmin(user)) {
    const fab = document.getElementById('fabBtn');
    if (fab) fab.style.display = '';
  }
  document.getElementById('financeType')?.addEventListener('change', function() {
    const iaGroup = document.getElementById('internalActivityGroup');
    const chk = document.getElementById('internalActivityCheck');
    const isAdmin = window.isAdmin(user);
    if (iaGroup) iaGroup.style.display = isAdmin && this.value === '支出' ? '' : 'none';
    if (chk && this.value !== '支出') chk.checked = false;
  });
  loadFinance();
}

function openFinanceModal() {
  openModal({
    title: '上传财务记录',
    body: '<form id="financeForm" data-action="uploadFinance"><div class="form-row"><div class="form-group"><label class="form-label" for="financeType">类型 <span class="required">*</span></label><select class="form-input" id="financeType" name="type" required><option value="支出">支出</option><option value="收入">收入</option></select></div><div class="form-group"><label class="form-label">金额 <span class="required">*</span></label><input class="form-input" name="amount" type="number" step="0.01" min="0" placeholder="0.00" required></div></div><div class="form-group" id="internalActivityGroup" style="display:none"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.9rem;color:var(--md-on-surface)"><input type="checkbox" id="internalActivityCheck" style="width:18px;height:18px;cursor:pointer"><span>团委内活动（计入流动资金库）</span></label></div><div class="form-group"><label class="form-label" for="fileInput">图片 <span class="required">*</span></label><div class="upload-zone" id="uploadZone" data-action="clickFileInput"><p style="color:var(--md-on-surface-variant)">点击选择图片</p><p style="font-size:.8rem;color:var(--md-on-surface-variant);margin-top:4px;opacity:.6">支持 JPG / PNG / WebP，最大 25MB，自动压缩</p><img id="previewImg" class="upload-preview" alt="" style="display:none"></div><input type="file" id="fileInput" accept="image/*" style="display:none" onchange="previewFile(event)"></div><div class="form-group"><label class="form-label">标签</label><input class="form-input" name="tags" placeholder="多个标签用逗号隔开，如：活动经费,文体"></div><div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" name="notes" placeholder="备注说明" maxlength="500"></textarea></div><div class="form-group" id="uploadDeptGroup" style="display:none"><label class="form-label" for="uploadDeptSelect">目标部门</label><select class="form-input" id="uploadDeptSelect" style="appearance:auto"><option value="">本部门</option><option value="书记处">书记处</option><option value="团总支">团总支</option><option value="社团部">社团部</option><option value="记者站">记者站</option><option value="宣传部">宣传部</option><option value="组织部">组织部</option><option value="青志协">青志协</option><option value="办公室">办公室</option></select></div><div class="form-group" id="financeCaptchaBox"></div><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="closeActiveModal">取消</button><button type="submit" class="btn btn-primary" id="financeUploadBtn">上传</button></div></form>'
  });
  const isAdmin = window.isAdmin(user);
  const typeSel = document.getElementById('financeType');
  const iaGroup = document.getElementById('internalActivityGroup');
  const deptGroup = document.getElementById('uploadDeptGroup');
  if (deptGroup) deptGroup.style.display = isAdmin ? '' : 'none';
  if (iaGroup) {
    iaGroup.style.display = isAdmin && typeSel.value === '支出' ? '' : 'none';
    const chk = document.getElementById('internalActivityCheck');
    if (chk && typeSel.value !== '支出') chk.checked = false;
  }
  _financeCaptcha = new CaptchaWidget('financeCaptchaBox');
}

function previewFile(e) {
  const zone = document.getElementById('uploadZone');
  previewImageFile(e.target, document.getElementById('previewImg'), zone ? zone.querySelector('p') : null, 25 * 1024 * 1024);
}

async function uploadFinance(dataset, target) {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files || !fileInput.files[0]) {
    toast('请选择图片', 'error');
    return;
  }

  const file = fileInput.files[0];
  if (file.size > 25 * 1024 * 1024) {
    toast('图片不能超过 25MB', 'error');
    return;
  }

  const btn = document.getElementById('financeUploadBtn');
  btn.disabled = true; btn.textContent = '处理中...';
  const fd = new FormData(target);

  try {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImage(dataUrl);
    const tags = fd.get('tags') ? fd.get('tags').split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const deptAdmin = isAdmin(user);
    const deptSelect = document.getElementById('uploadDeptSelect');
    const uploadDept = deptAdmin && deptSelect ? deptSelect.value : '';
    const internalChk = document.getElementById('internalActivityCheck');
    const internalActivity = deptAdmin && internalChk ? internalChk.checked : false;
    const data = await apiPost('/api/finance', {
      image_url: compressed,
      tags,
      notes: fd.get('notes') || '',
      type: fd.get('type') || '支出',
      amount: parseFloat(fd.get('amount')) || 0,
      department: uploadDept,
      internal_activity: internalActivity,
      ...(_financeCaptcha ? _financeCaptcha.getData() : {}),
    });
    allFinance.unshift(data);
    if (data && data.image_url) financeImgCache[data.id] = data.image_url;
    applyCurrentFilter();
    target.reset();
    document.getElementById('previewImg').style.display = 'none';
    document.getElementById('uploadZone').querySelector('p').textContent = '点击选择图片';
    _financeCaptcha.refresh();
    toast('上传成功，可继续上传', 'success');
  } catch (err) {
    toast(err.message, 'error');
    if (_financeCaptcha) _financeCaptcha.refresh();
  } finally {
    btn.disabled = false; btn.textContent = '上传';
  }
}

async function loadFinance() {
  try {
    const deptParam = _filterDept ? `?department=${_filterDept}` : '';
    await fetchWithCache('/api/finance' + deptParam,
      () => apiGet('/api/finance' + deptParam),
      data => {
        allFinance = data;
        buildDeptTabs();
        applyCurrentFilter();
        loadFinanceImagesLazy();
      },
      2 // 列表结构 v2（has_image 标记、无 image_url 全文）
    );
  } catch (err) {
    document.getElementById('financeGrid').innerHTML =
      `<div style="grid-column:1/-1">${EmptyState('', '加载失败：' + err.message)}</div>`;
  }
}

// 分批拉取图片（每批 8 条），单图解码就绪后替换扫光占位
async function loadFinanceImagesLazy() {
  const pending = allFinance.filter(f => f.has_image && !financeImgCache[f.id]).map(f => f.id);
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8);
    let map = {};
    try {
      map = await apiGet(`/api/finance/images?ids=${batch.join(',')}`);
    } catch {}
    for (const id of batch) {
      const url = map && map[id] ? map[id] : '';
      const holder = document.querySelector(`.img-card[data-id="${id}"] .finance-img-skeleton`);
      if (!url) { if (holder) holder.remove(); continue; }
      financeImgCache[id] = url;
      if (holder) replaceFinanceImgSkeleton(holder, url);
    }
  }
}

// 图片就绪后再替换骨架，避免闪烁
function replaceFinanceImgSkeleton(holder, url) {
  const img = new Image();
  img.onload = () => {
    holder.outerHTML = `<img class="img-clickable" src="${url}" alt="财务图片" loading="lazy" data-fullsrc="${url}" onerror="this.src='${FIN_IMG_FALLBACK}'">`;
  };
  img.onerror = () => { holder.remove(); };
  img.src = url;
}

function toggleTypeFilter(type) {
  _typeFilter = _typeFilter === type ? null : type;
  _pendingFilter = false;
  applyCurrentFilter();
}

function togglePendingFilter() {
  _pendingFilter = !_pendingFilter;
  _typeFilter = null;
  applyCurrentFilter();
}

function applyCurrentFilter() {
  let filtered = filterByMonth(allFinance, _filterYear, _filterMonth);
  if (_typeFilter) {
    filtered = filtered.filter(f => f.type === _typeFilter);
  }
  if (_pendingFilter) {
    filtered = filtered.filter(f => f.type === '支出' && f.status !== '已报销');
  }
  renderFinance(filtered);
}

function computeSummary(list) {
  let income = 0, expense = 0;
  for (const f of list) {
    const amt = Number(f.amount || 0);
    if (f.type === '收入') income += amt;
    else expense += amt;
  }
  return { income, expense };
}

function buildDeptTabs() {
  const el = document.getElementById('deptTabs');
  if (!el) return;
  const isAdmin = window.isAdmin(user);
  if (!isAdmin) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const depts = ['', ...DEPARTMENTS];
  el.innerHTML = depts.map(d => `
    <button class="btn btn-sm ${_filterDept === d ? 'btn-primary' : 'btn-outline'}" data-action="selectDeptTab" data-dept="${d}">${d || '全部'}</button>
  `).join('');
}

function selectDeptTab(dataset) {
  _filterDept = dataset.dept;
  buildDeptTabs();
  loadFinance();
}

async function renderFinance(filteredList) {
  const list = filteredList || allFinance;
  const el = document.getElementById('financeGrid');
  if (!el) return;
  const countEl = document.getElementById('financeCount');
  if (countEl) countEl.textContent = `共 ${list.length} 条记录`;
  let title = '';
  if (_typeFilter) {
    title = _typeFilter === '收入' ? '收入记录' : '支出记录';
  } else if (_pendingFilter) {
    title = '未报销支出';
  } else if (_filterYear && _filterMonth) {
    title = getMonthLabel(_filterYear, _filterMonth);
  } else {
    title = '全部记录';
  }
  const titleEl = document.getElementById('financeSectionTitle');
  if (titleEl) titleEl.textContent = title;

  // Update 2 summary cards from full month data (not type-filtered)
  const monthData = filterByMonth(allFinance, _filterYear, _filterMonth);
  const summary = computeSummary(monthData);
  const incEl = document.getElementById('summaryIncome');
  const expEl = document.getElementById('summaryExpense');
  if (incEl) incEl.textContent = `¥${summary.income.toFixed(2)}`;
  if (expEl) expEl.textContent = `¥${summary.expense.toFixed(2)}`;

  // 近30天已报销比例
  const isAdmin = window.isAdmin(user);
  const ratioCard = document.getElementById('reimburseRatioCard');
  if (isAdmin) {
    const now = Date.now();
    const thirtyDays = now - 30 * 24 * 60 * 60 * 1000;
    const recent = allFinance.filter(f => new Date(f.created_at).getTime() >= thirtyDays);
    const eligible = recent.filter(f => f.type === '支出');
    const reimbursed = eligible.filter(f => f.status === '已报销');
    const total = eligible.length;
    const done = reimbursed.length;
    const pct = total > 0 ? (done / total * 100) : 0;
    const ratioText = document.getElementById('reimburseRatioText');
    const ratioBar = document.getElementById('reimburseRatioBar');
    if (ratioText) ratioText.textContent = `${done} / ${total} (${pct.toFixed(0)}%)`;
    if (ratioBar) ratioBar.style.width = `${pct}%`;
    ratioCard.style.display = '';
  } else {
    ratioCard.style.display = 'none';
  }

  if (list.length === 0) {
    el.innerHTML = `<div style="grid-column:1/-1">${EmptyState(icon('wallet'), '暂无记录')}</div>`;
    return;
  }

  el.innerHTML = '';
  await progressiveRender(el, list, (f, i) => {
    let tags = [];
    try { tags = JSON.parse(f.tags || '[]'); } catch { tags = (f.tags || '').split(',').filter(Boolean); }
    const statusLabel = f.status === '已报销' ? '已报销' : (f.status === '已完成' ? '已完成' : '待完成');
    const statusBadgeCls = f.status === '已报销' ? 'badge-pass' : (f.status === '已完成' ? 'badge-done' : 'badge-pending');
    const isReimbursed = f.status === '已报销';
    const imgSrc = financeImgCache[f.id];
    const imgArea = imgSrc
      ? `<img class="img-clickable" src="${imgSrc}" alt="财务图片" loading="lazy" data-lb-index="${i}" data-fullsrc="${imgSrc}" onerror="this.src='${FIN_IMG_FALLBACK}'">`
      : (f.has_image ? '<div class="finance-img-skeleton"><div class="g-skeleton"></div></div>' : '');
    return `
    <div class="img-card" data-id="${f.id}">
      ${imgArea}
      <div class="img-card-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          ${Badge((f.type === '收入' ? icon('trending-up') : icon('trending-down')) + ' ' + f.type, f.type === '收入' ? 'done' : 'pending')}
          <strong style="font-size:1.1rem;color:${f.type === '收入' ? 'var(--success)' : 'var(--accent)'}">${f.type === '收入' ? '+' : '-'}¥${Number(f.amount || 0).toFixed(2)}</strong>
        </div>
        ${f.department ? `<div style="margin-bottom:4px">${Badge(escapeHtml(f.department), 'processing')}</div>` : ''}
        ${tags.length > 0 ? `<div class="img-card-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${f.notes ? `<div class="img-card-notes">${escapeHtml(f.notes)}</div>` : ''}
        <div class="img-card-footer" style="justify-content:space-between">
          <span>${escapeHtml(f.created_by)}</span>
          ${Badge(statusLabel, statusBadgeCls === 'badge-pass' ? 'pass' : statusBadgeCls === 'badge-done' ? 'done' : 'pending')}
        </div>
        ${isAdmin && !isReimbursed ? `<button class="btn btn-sm btn-primary" style="margin-top:8px;width:100%" data-action="reimburseFinance" data-id="${f.id}">标记已报销</button>` : ''}
        ${isAdmin && isReimbursed ? `<button class="btn btn-sm btn-danger" style="margin-top:8px;width:100%" data-action="unreimburseFinance" data-id="${f.id}">取消报销</button>` : ''}
        ${isAdmin ? `<button class="btn btn-sm btn-danger-outline" style="margin-top:4px;width:100%" data-action="deleteFinanceItem" data-id="${f.id}">删除</button>` : ''}
      </div>
    </div>`;
  });

  // 灯箱用容器级事件委托：懒加载替换出的新 img 无需重复绑定
  if (!el.dataset.lbBound) {
    el.dataset.lbBound = '1';
    el.addEventListener('click', function (ev) {
      const img = ev.target.closest('.img-clickable');
      if (!img || !el.contains(img)) return;
      const src = img.dataset.fullsrc || img.dataset.src || '';
      if (!src) return;
      const items = Array.from(el.querySelectorAll('.img-clickable')).map(im => ({ src: im.dataset.fullsrc || im.dataset.src || '' }));
      openLightbox(src, items);
    });
  }

  // Update active state on summary cards and ratio card
  document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
  ratioCard.classList.remove('active');
  if (_typeFilter) {
    const cls = _typeFilter === '收入' ? 'summary-income' : 'summary-expense';
    const card = document.querySelector(`.${cls}`);
    if (card) card.classList.add('active');
  }
  if (_pendingFilter) {
    ratioCard.classList.add('active');
  }
}

async function reimburseFinance(dataset) {
  try {
    await apiPut(`/api/finance/${dataset.id}/reimburse`);
    const f = allFinance.find(x => x.id === dataset.id);
    if (f) f.status = '已报销';
    applyCurrentFilter();
    toast('已标记报销', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function unreimburseFinance(dataset) {
  try {
    await apiPut(`/api/finance/${dataset.id}/unreimburse`);
    const f = allFinance.find(x => x.id === dataset.id);
    if (f) f.status = '待完成';
    applyCurrentFilter();
    toast('已取消报销', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteFinanceItem(dataset) {
  confirmAction('确定删除此财务记录（含图片）吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/finance/${dataset.id}`);
      allFinance = allFinance.filter(x => x.id !== dataset.id);
      delete financeImgCache[dataset.id];
      applyCurrentFilter();
      toast('已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function updateRatioCard() {
  const now = Date.now();
  const thirtyDays = now - 30 * 24 * 60 * 60 * 1000;
  const recent = allFinance.filter(f => new Date(f.created_at).getTime() >= thirtyDays);
  const eligible = recent.filter(f => f.type === '支出');
  const reimbursed = eligible.filter(f => f.status === '已报销');
  const total = eligible.length;
  const done = reimbursed.length;
  const pct = total > 0 ? (done / total * 100) : 0;
  const ratioText = document.getElementById('reimburseRatioText');
  const ratioBar = document.getElementById('reimburseRatioBar');
  if (ratioText) ratioText.textContent = `${done} / ${total} (${pct.toFixed(0)}%)`;
  if (ratioBar) ratioBar.style.width = `${pct}%`;
}

function openMonthPicker() {
  const now = new Date();
  openModal({
    title: '选择月份',
    body: '<div style="display:flex;gap:12px;margin-bottom:16px"><select id="monthYear" class="form-input" aria-label="选择年份" style="flex:1"></select><select id="monthMonth" class="form-input" aria-label="选择月份" style="flex:1"></select></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" id="quickMonths"></div>',
    maxWidth: '340px',
    footer: [
      { text: '全部记录', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); _filterYear = null; _filterMonth = null; _typeFilter = null; _pendingFilter = false; applyCurrentFilter(); } },
      { text: '查看', variant: 'primary', onClick: function() { _filterYear = parseInt(document.getElementById('monthYear').value, 10); _filterMonth = parseInt(document.getElementById('monthMonth').value, 10); closeModal(document.getElementById('modalContainer')); applyCurrentFilter(); } }
    ]
  });

  const yearSel = document.getElementById('monthYear');
  const monthSel = document.getElementById('monthMonth');
  const quickEl = document.getElementById('quickMonths');
  yearSel.innerHTML = '';
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '年';
    yearSel.appendChild(opt);
  }
  monthSel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = (m < 10 ? '0' : '') + m + '月';
    monthSel.appendChild(opt);
  }
  if (_filterYear) yearSel.value = _filterYear;
  if (_filterMonth) monthSel.value = _filterMonth;

  const ymSet = new Set();
  for (const f of allFinance) {
    const ym = getMonthFromDate(f.created_at);
    ymSet.add(ym.y + '-' + ym.m);
  }
  const sorted = Array.from(ymSet).sort().reverse().slice(0, 6);
  quickEl.innerHTML = sorted.map(function(k) {
    const parts = k.split('-');
    const y = Number(parts[0]), m = Number(parts[1]);
    return '<button class="btn btn-sm btn-outline" data-action="selectQuickMonth" data-year="' + y + '" data-month="' + m + '">' + getMonthLabel(y, m) + '</button>';
  }).join('');
}

function selectQuickMonth(dataset) {
  _filterYear = Number(dataset.year);
  _filterMonth = Number(dataset.month);
  closeModal(document.getElementById('modalContainer'));
  applyCurrentFilter();
}

init();