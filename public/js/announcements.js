let user = null;
let allAnnouncements = [];
let editingId = null;
let announceCommentsCache = {};
let announceImgCache = {}; // 公告 id → 图片 url 数组（列表接口瘦身后按需分批拉取）
let _formDirty = false;
let _selectedFiles = [];

function markDirty() { _formDirty = true; setPageDirty(true); }

async function init() {
  user = await checkAuth();
  if (user && user.role !== 'pending') {
    const fab = document.getElementById('fabBtn');
    if (fab) fab.style.display = '';
  }
  await loadAnnouncements();
  const params = new URLSearchParams(location.search);
  const editId = params.get('edit');
  if (editId) {
    const a = allAnnouncements.find(x => x.id === Number(editId));
    if (a && (user && (user.name === a.created_by || user.role === 'admin' || user.role === 'owner'))) {
      openEditModal(Number(editId));
    }
  }
}

async function loadAnnouncements() {
  try {
    await fetchWithCache('/api/announcements',
      () => apiGet('/api/announcements'),
      data => { allAnnouncements = data; renderAnnouncements(); },
      2 // 列表结构 v2（has_image 标记、无 image_url 全文）；版本不符自动作废旧缓存
    );
  } catch (err) {
    const el = document.getElementById('announceList');
    if (el) el.innerHTML = EmptyState('', '加载失败：' + err.message);
  }
}

function renderAnnounceImages(imgs) {
  if (imgs.length === 0) return '';
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('personalize') || '{}'); } catch { return {}; }})();
  const useStack = prefs.stack === true && prefs.animation !== false && window.innerWidth >= 768;
  if (useStack && imgs.length > 2) {
    return `<div class="img-stack-card announce-img" data-imgs="${imgs.length}">${imgs.slice(0,4).map(url => `<img src="${attrEscape(url)}" alt="">`).join('')}<span class="img-stack-badge">${imgs.length}</span></div>`;
  }
  return `<div class="img-row">${imgs.map(url => `<img class="img-clickable announce-img" src="${attrEscape(dataUrlToBlobUrl(url))}" alt="公告图片" data-action="openLightbox" data-src="${attrEscape(dataUrlToBlobUrl(url))}" data-items='${attrEscape(JSON.stringify(imgs.map(s => ({ src: s }))))}' onerror="this.style.display='none'">`).join('')}</div>`;
}

async function renderAnnouncements() {
  const el = document.getElementById('announceList');
  if (!el) return;
  const now = Date.now();

  const visible = allAnnouncements.filter(a => !a.status || a.status === '已通过');

  if (visible.length === 0) {
    el.innerHTML = EmptyState(icon('megaphone'), '暂无公告');
    return;
  }

  await progressiveRender(el, visible, a => {
    const imgs = announceImgCache[a.id] || [];
    const isNew = now - new Date(a.created_at).getTime() < 86400000;
    const canEdit = user && (user.name === a.created_by || user.role === 'admin' || user.role === 'owner');
    const commentCount = a.comment_count || 0;

    return `
    <div class="card announce-card" data-id="${a.id}">
      <div class="card-header">
        <strong style="font-size:1.05rem">${escapeHtml(a.title)}</strong>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${isNew ? Badge('NEW', 'processing') : ''}
          ${canEdit ? `<button class="btn btn-sm btn-outline" style="color:var(--md-primary);border-color:var(--md-outline)" data-action="openEditModal" data-id="${a.id}">编辑</button>` : ''}
          ${canEdit ? `<button class="btn btn-sm btn-outline delete-btn" style="color:var(--accent);border-color:var(--accent)" data-action="deleteAnnouncement" data-id="${a.id}">删除</button>` : ''}
        </div>
      </div>
      <div class="card-body" style="white-space:pre-wrap">${escapeHtml(a.content)}</div>
      ${renderAnnounceImageArea(a, imgs)}
      <div class="card-footer">
        <span>${escapeHtml(a.created_by)}</span>
        <span>${formatTime(a.created_at)}</span>
      </div>
      <div class="issue-comments-toggle" data-action="toggleAnnounceComments" data-id="${a.id}">
        ${icon('message-circle')} <span>评论 (${commentCount})</span>
      </div>
      <div class="issue-comments" id="announce-comments-${a.id}" style="display:none">
        <div class="issue-comments-list" id="announce-comments-list-${a.id}">
          <p style="color:var(--md-on-surface-variant);font-size:.85rem">加载中…</p>
        </div>
        ${user ? `
        <form class="comment-form" style="margin-top:8px">
          <textarea class="form-textarea" id="announce-comment-input-${a.id}" placeholder="写下评论…" required maxlength="500" style="min-height:48px"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:6px">
            <button type="button" class="btn btn-sm btn-primary" data-action="postAnnounceComment" data-announce-id="${a.id}">发表</button>
          </div>
        </form>` : '<p style="color:var(--md-on-surface-variant);font-size:.82rem;margin-top:8px">请<a href="login.html" style="color:var(--md-primary)">登录</a>后评论</p>'}
      </div>
    </div>`;
  });

  el.querySelectorAll('.announce-card').forEach(card => {
    const id = Number(card.dataset.id);
    const a = allAnnouncements.find(x => x.id === id);
    const imgs = a ? (announceImgCache[id] || []) : [];
    card.addEventListener('click', function (e) {
      if (e.target.closest('[data-action]')) return;
      const imgArea = e.target.closest('.announce-img');
      if (imgArea) {
        if (imgs.length > 1) {
          e.stopPropagation();
          showImagePicker(imgs);
        }
        return;
      }
      location.href = `/announcement.html?id=${id}`;
    });
  });

  loadAnnounceImagesLazy();
}

// 列表接口瘦身后：有缓存图 → 直接渲染图片；有图但未加载 → 扫光骨架占位，图片到达后替换
function renderAnnounceImageArea(a, imgs) {
  if (imgs && imgs.length > 0) return renderAnnounceImages(imgs);
  if (a.has_image) return '<div class="img-row announce-img-skeleton"><div class="g-skeleton" style="height:180px;border-radius:var(--md-shape-sm);width:100%"></div></div>';
  return '';
}

// 分批拉取图片（每批 4 条公告），逐批替换扫光占位
async function loadAnnounceImagesLazy() {
  const pending = allAnnouncements.filter(a => a.has_image && !announceImgCache[a.id]).map(a => a.id);
  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4);
    let map = {};
    try {
      map = await apiGet(`/api/announcements/images?ids=${batch.join(',')}`);
    } catch {}
    for (const id of batch) {
      const urls = (map && Array.isArray(map[id]) && map[id].length > 0) ? map[id] : [];
      announceImgCache[id] = urls;
      if (urls.length > 0) replaceAnnounceImgSkeleton(id, urls);
    }
  }
}

// 图片全部就绪后再替换骨架，避免闪烁
function replaceAnnounceImgSkeleton(id, urls) {
  const holder = document.querySelector(`.announce-card[data-id="${id}"] .announce-img-skeleton`);
  if (!holder) return;
  const html = renderAnnounceImages(urls);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const imgs = tmp.querySelectorAll('img');
  if (imgs.length === 0) { holder.remove(); return; }
  let loaded = 0;
  const finish = () => {
    loaded++;
    if (loaded >= imgs.length) holder.outerHTML = html;
  };
  imgs.forEach(img => {
    if (img.complete) finish();
    else { img.onload = finish; img.onerror = finish; }
  });
}

function showImagePicker(imgs) {
  if (!imgs || imgs.length === 0) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0);z-index:9999;display:flex;align-items:center;justify-content:center;transition:background .35s';
  const container = document.createElement('div');
  container.style.cssText = 'width:100%;height:100%;touch-action:none';
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'img-picker-close';
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  closeBtn.onclick = () => closePicker();
  overlay.appendChild(closeBtn);

  requestAnimationFrame(() => { overlay.style.background = 'rgba(0,0,0,.7)'; });

  let mounted = true, scene, camera, renderer, group, animId;
  const cards = [];
  let scrollOffset = 0, velocity = 0, isDragging = false, prevX = 0, dragDist = 0;
  let transitioning = null;

  function dispose() {
    mounted = false;
    if (animId) cancelAnimationFrame(animId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    cards.forEach(c => {
      if (c.mesh) { c.mesh.geometry.dispose(); if (c.mesh.material) { if (c.mesh.material.map) c.mesh.material.map.dispose(); c.mesh.material.dispose(); } }
    });
  }

  function closePicker(cb) {
    overlay.style.background = 'rgba(0,0,0,0)';
    setTimeout(() => { dispose(); overlay.remove(); if (cb) cb(); }, 380);
  }

  function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 0, 450);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .8;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, .35));
    const dl = new THREE.DirectionalLight(0xffffff, .7); dl.position.set(80, 120, 200); scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x8888ff, .2); dl2.position.set(-100, -30, -50); scene.add(dl2);

    group = new THREE.Group();
    scene.add(group);

    const n = imgs.length;
    const cardW = Math.min(200, Math.max(110, 320 / Math.pow(n, .35)));
    const spacing = Math.max(120, cardW * 1.1);
    scrollOffset = -(n - 1) / 2 * spacing;

    imgs.forEach((url, i) => {
      const img = new Image();
      img.onload = () => {
        if (!mounted) return;
        const aspect = img.naturalWidth / img.naturalHeight;
        const w = cardW, h = w / aspect;
        const tex = new THREE.Texture(img); tex.needsUpdate = true;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshStandardMaterial({ map: tex, roughness: .2, metalness: 0 })
        );
        const idx = i - (n - 1) / 2;
        mesh.position.set(idx * spacing, -Math.abs(idx) * 6, Math.abs(idx) * 20);
        mesh.rotation.y = idx * 0.15;
        mesh.scale.set(.01, .01, .01);
        mesh.userData = { url, i, idx, baseZ: mesh.position.z, baseY: mesh.position.y };
        group.add(mesh);
        cards.push({ mesh, delay: i * 50 });
      };
      img.onerror = () => {};
      img.src = url;
    });

    const rc = new THREE.Raycaster(), mv = new THREE.Vector2();
    let hoveredMesh = null;

    container.addEventListener('mousedown', e => { isDragging = true; prevX = e.clientX; dragDist = 0; });
    window.addEventListener('mousemove', e => {
      mv.x = (e.clientX / window.innerWidth) * 2 - 1;
      mv.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (isDragging) { const dx = prevX - e.clientX; dragDist += Math.abs(dx); velocity += dx * 0.6; prevX = e.clientX; }
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    container.addEventListener('touchstart', e => { if (e.touches[0]) { isDragging = true; prevX = e.touches[0].clientX; dragDist = 0; } }, { passive: true });
    container.addEventListener('touchmove', e => {
      if (e.touches[0]) {
        mv.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        mv.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
        if (isDragging) { const dx = prevX - e.touches[0].clientX; dragDist += Math.abs(dx); velocity += dx * 0.6; prevX = e.touches[0].clientX; }
      }
    }, { passive: true });
    container.addEventListener('touchend', () => { isDragging = false; });

    container.addEventListener('click', e => {
      if (dragDist > 5 || transitioning) return;
      rc.setFromCamera(mv, camera);
      const meshes = cards.filter(c => c.mesh).map(c => c.mesh);
      const hits = rc.intersectObjects(meshes);
      if (hits.length) {
        const obj = hits[0].object;
        const u = obj.userData.url;
        if (u) transitioning = { mesh: obj, url: u, start: Date.now(), duration: 700 };
      }
    });

    const start = Date.now();

    function anim() {
      if (!mounted) return;
      animId = requestAnimationFrame(anim);
      const t = Date.now() - start;

      // Entrance
      cards.forEach(c => {
        if (!c.mesh || c.mesh.scale.x >= 1) return;
        const p = Math.max(0, Math.min(1, (t - c.delay) / 500));
        const ease = 1 - Math.pow(1 - p, 3);
        c.mesh.scale.set(ease, ease, ease);
      });

      // Scroll with momentum, no spring-back
      if (!isDragging) velocity *= 0.92;
      scrollOffset += velocity;
      const maxScroll = (n - 1) / 2 * spacing + 50;
      const minScroll = -(n - 1) / 2 * spacing - 50;
      if (scrollOffset > maxScroll) { scrollOffset = maxScroll; velocity = 0; }
      if (scrollOffset < minScroll) { scrollOffset = minScroll; velocity = 0; }

      // Update card positions based on scroll
      cards.forEach(c => {
        if (!c.mesh) return;
        if (transitioning && c.mesh === transitioning.mesh) return;
        const idx = c.mesh.userData.idx;
        const offset = idx * spacing - scrollOffset;
        const absOff = Math.abs(offset);

        const x = offset;
        const z = absOff * 0.25 + Math.min(absOff, 200) * 0.06;
        const y = -absOff * 0.04;
        c.mesh.position.x += (x - c.mesh.position.x) * 0.1;
        c.mesh.position.y += (y - c.mesh.position.y) * 0.1;
        c.mesh.position.z += (z - c.mesh.position.z) * 0.1;
        c.mesh.rotation.y += (offset * 0.003 - c.mesh.rotation.y) * 0.1;

        // Scale based on distance (center = largest)
        const distScale = Math.max(.6, 1 - absOff * 0.002);
        c.mesh.scale.z = distScale;
      });

      // Transition: clicked card scales to center, fills screen
      if (transitioning) {
        if (!transitioning.targetScale) {
          const gw = transitioning.mesh.geometry.parameters.width;
          const gh = transitioning.mesh.geometry.parameters.height;
          const vfov = 40 * Math.PI / 180;
          const vh = 2 * 450 * Math.tan(vfov / 2);
          const vw = vh * (window.innerWidth / window.innerHeight);
          transitioning.targetScale = Math.max(vw / gw, vh / gh);
        }
        const targetScale = transitioning.targetScale;
        const t = Math.min(1, (Date.now() - transitioning.start) / transitioning.duration);
        const ease = 1 - Math.pow(1 - t, 3);
        const mesh = transitioning.mesh;
        const speed = 0.035 * (1 + ease * 6);
        mesh.position.x += (0 - mesh.position.x) * speed;
        mesh.position.y += (0 - mesh.position.y) * speed;
        mesh.position.z += (0 - mesh.position.z) * speed;
        mesh.rotation.y += (0 - mesh.rotation.y) * speed;
        const ns = mesh.scale.x + (targetScale - mesh.scale.x) * speed;
        mesh.scale.set(ns, ns, 1);
        cards.forEach(c => {
          if (c.mesh && c.mesh !== mesh) {
            c.mesh.material.transparent = true;
            c.mesh.material.opacity = Math.max(0, 1 - t * 2.5);
          }
        });
        overlay.style.background = `rgba(0,0,0,${0.7 + t * 0.3})`;
        if (mesh.scale.x >= targetScale * 0.9) {
          const url = transitioning.url;
          transitioning = null;
          openLightbox(url, imgs.map(s => ({ src: s })));
          dispose();
          overlay.remove();
          return;
        }
      }

      // Hover
      rc.setFromCamera(mv, camera);
      const meshes = cards.filter(c => c.mesh).map(c => c.mesh);
      const hits = rc.intersectObjects(meshes);
      cards.forEach(c => {
        if (!c.mesh || !c.mesh.material) return;
        c.mesh.material.emissive = new THREE.Color(0x000000);
        if (hoveredMesh && hoveredMesh === c.mesh && (!hits.length || hits[0].object !== c.mesh)) {
          hoveredMesh = null;
        }
      });
      if (hits.length && hits[0].object.material) {
        const obj = hits[0].object;
        obj.material.emissive = new THREE.Color(0x222222);
        hoveredMesh = obj;
        container.style.cursor = 'pointer';
      } else container.style.cursor = 'grab';

      renderer.render(scene, camera);
    }
    anim();

    window.addEventListener('resize', () => {
      if (!mounted) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  if (typeof THREE !== 'undefined') initThree();
  else {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = initThree;
    s.onerror = () => { overlay.remove(); toast('3D预览加载失败', 'error'); };
    document.head.appendChild(s);
  }
}

var _announceFormHtml = '<form id="announceForm" data-action="postAnnouncement"><div class="form-group"><label class="form-label">标题 <span class="required">*</span></label><input class="form-input" name="title" placeholder="公告标题" required maxlength="200"></div><div class="form-group"><label class="form-label">内容 <span class="required">*</span></label><textarea class="form-textarea" name="content" placeholder="公告内容" style="min-height:120px" required maxlength="5000"></textarea></div><div class="form-group"><label class="form-label" for="announceFileInput">图片（选填，可多张）</label><div class="upload-zone" id="announceUploadZone" data-action="clickFileInput" data-target="announceFileInput"><p style="color:var(--text-secondary)">点击选择图片（可多选）</p><div id="announcePreviews" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div></div><input type="file" id="announceFileInput" accept="image/*" multiple style="display:none" onchange="previewAnnounceFiles(event)"></div><div class="modal-actions"><button type="button" class="btn btn-outline" id="announceCancelBtn">取消</button><button type="submit" class="btn btn-primary" id="postBtn">发布公告</button></div></form>';

function openAnnounceModal() {
  editingId = null;
  _formDirty = false;
  _selectedFiles = [];
  openModal({
    title: '发布公告',
    body: _announceFormHtml,
    dirtyCheck: function() {
      if (_formDirty) { confirmAction('有未保存的更改，确定关闭吗？', function(ok) { if (ok) { _formDirty = false; setPageDirty(false); closeModal(document.getElementById('modalContainer')); } }); return true; }
      return false;
    }
  });
  document.getElementById('announceCancelBtn').onclick = function() {
    if (_formDirty) { confirmAction('有未保存的更改，确定关闭吗？', function(ok) { if (ok) { _formDirty = false; setPageDirty(false); closeModal(document.getElementById('modalContainer')); } }); return; }
    closeModal(document.getElementById('modalContainer'));
  };
  const form = document.getElementById('announceForm');
  form.reset();
  document.getElementById('announcePreviews').innerHTML = '';
  document.getElementById('announceUploadZone').querySelector('p').textContent = '点击选择图片（可多选）';
  form.querySelector('[name="title"]').addEventListener('input', markDirty, { once: true });
  form.querySelector('[name="content"]').addEventListener('input', markDirty, { once: true });
}

function previewAnnounceFiles(e) {
  _selectedFiles = [];
  _formDirty = true;
  const previews = document.getElementById('announcePreviews');
  previews.innerHTML = '';
  const files = Array.from(e.target.files);
  if (files.length === 0) { document.getElementById('announceUploadZone').querySelector('p').textContent = '点击选择图片（可多选）'; return; }
  document.getElementById('announceUploadZone').querySelector('p').textContent = `已选 ${files.length} 张图片`;
  files.forEach((file, idx) => {
    if (file.size > 25 * 1024 * 1024) { toast(`图片 ${file.name} 超过 25MB，已跳过`, 'error'); return; }
    const reader = new FileReader();
    reader.onload = function (ev) {
      _selectedFiles.push({ file, dataUrl: ev.target.result });
      const img = document.createElement('img');
      img.className = 'upload-preview';
      img.src = ev.target.result;
      img.style.cssText = 'height:80px;width:auto;border-radius:var(--md-shape-sm);object-fit:cover';
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.innerHTML = `<button type="button" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--accent);color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;z-index:1" data-action="removeAnnouncePreview" data-idx="${_selectedFiles.length - 1}">${icon('x')}</button>`;
      wrap.appendChild(img);
      previews.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

function removeAnnouncePreview(dataset, target) {
  var idx = Number(dataset.idx);
  target.parentElement.remove();
  _selectedFiles.splice(idx, 1);
  _formDirty = true;
}

async function deleteAnnouncement(dataset, target) {
  const id = Number(dataset.id);
  confirmAction('确定要删除此公告吗？', async ok => {
    if (!ok) return;
    try {
      await apiDel(`/api/announcements/${id}`);
      allAnnouncements = allAnnouncements.filter(a => a.id !== id);
      delete announceImgCache[id];
      cacheDel('/api/announcements');
      renderAnnouncements();
      toast('公告已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function openEditModal(id, _target) {
  if (typeof id === 'object' && id !== null) id = Number(id.id);
  const a = allAnnouncements.find(x => x.id === id);
  if (!a) return;
  editingId = id;
  _formDirty = false;
  _selectedFiles = [];
  openModal({
    title: '编辑公告',
    body: _announceFormHtml,
    dirtyCheck: function() {
      if (_formDirty) { confirmAction('有未保存的更改，确定关闭吗？', function(ok) { if (ok) { _formDirty = false; setPageDirty(false); closeModal(document.getElementById('modalContainer')); } }); return true; }
      return false;
    }
  });
  // openModal 替换了 modal body，需在此之后获取新 form 并回填值
  const form = document.getElementById('announceForm');
  form.querySelector('[name="title"]').value = a.title;
  form.querySelector('[name="content"]').value = a.content;
  const previews = document.getElementById('announcePreviews');
  previews.innerHTML = '';
  const imgs = announceImgCache[id] || [];
  if (imgs.length > 0) {
    document.getElementById('announceUploadZone').querySelector('p').textContent = `现有 ${imgs.length} 张图片（重新选择将替换）`;
    imgs.forEach(url => {
      const img = document.createElement('img');
      img.className = 'upload-preview';
      img.src = url;
      img.style.cssText = 'height:80px;width:auto;border-radius:var(--md-shape-sm);object-fit:cover';
      previews.appendChild(img);
    });
  } else {
    document.getElementById('announceUploadZone').querySelector('p').textContent = '点击选择图片（可多选）';
  }
  document.getElementById('announceCancelBtn').onclick = function() {
    if (_formDirty) { confirmAction('有未保存的更改，确定关闭吗？', function(ok) { if (ok) { _formDirty = false; setPageDirty(false); closeModal(document.getElementById('modalContainer')); } }); return; }
    closeModal(document.getElementById('modalContainer'));
  };
  document.getElementById('postBtn').textContent = '保存修改';
  form.querySelector('[name="title"]').addEventListener('input', markDirty, { once: true });
  form.querySelector('[name="content"]').addEventListener('input', markDirty, { once: true });
}

async function postAnnouncement(dataset, target) {
  const fd = new FormData(target);
  const btn = document.getElementById('postBtn');
  btn.disabled = true; btn.textContent = editingId ? '保存中...' : '发布中...';

  try {
    if (editingId) {
      let image_urls = [];
      if (_selectedFiles.length > 0) {
        for (const item of _selectedFiles) {
          const compressed = await compressImage(item.dataUrl);
          image_urls.push(compressed);
        }
      } else {
        image_urls = announceImgCache[editingId] || [];
      }
      const data = await apiPut(`/api/announcements/${editingId}`, {
        title: fd.get('title'),
        content: fd.get('content'),
        image_urls,
      });
      announceImgCache[editingId] = parseImages(data.image_url);
      const idx = allAnnouncements.findIndex(a => a.id === editingId);
      if (idx >= 0) allAnnouncements[idx] = data;
      cacheDel('/api/announcements');
      renderAnnouncements();
      toast('公告已更新，等待审核', 'success');
    } else {
      const data = await apiPost('/api/announcements', {
        title: fd.get('title'),
        content: fd.get('content'),
        image_urls: [],
      });
      allAnnouncements.unshift(data);
      cacheDel('/api/announcements');
      for (const item of _selectedFiles) {
        const compressed = await compressImage(item.dataUrl);
        await apiPost(`/api/announcements/${data.id}/images`, { image_url: compressed });
      }
      const final = await apiGet(`/api/announcements/${data.id}`);
      announceImgCache[final.id] = parseImages(final.image_url);
      allAnnouncements[0] = final;
      renderAnnouncements();
      toast('公告已发布', 'success');
    }
    _formDirty = false; setPageDirty(false);
    _selectedFiles = [];
    target.reset();
    document.getElementById('announcePreviews').innerHTML = '';
    document.getElementById('announceUploadZone').querySelector('p').textContent = '点击选择图片（可多选）';
    closeModal(document.getElementById('modalContainer'));
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? '保存修改' : '发布公告';
  }
}

// ────── Announcement comments ──────

async function toggleAnnounceComments(dataset, target) {
  const announceId = Number(dataset.id);
  const container = document.getElementById(`announce-comments-${announceId}`);
  const list = document.getElementById(`announce-comments-list-${announceId}`);
  const isOpen = container.style.display !== 'none';
  container.style.display = isOpen ? 'none' : '';
  if (!isOpen && !announceCommentsCache[announceId]) {
    try {
      await fetchWithCache(`/api/comments/announcement/${announceId}`,
        () => apiGet(`/api/comments/announcement/${announceId}`),
        data => { announceCommentsCache[announceId] = data; renderAnnounceComments(announceId, data); }
      );
    } catch {
      list.innerHTML = '<p style="color:var(--md-on-surface-variant);font-size:.85rem">加载失败</p>';
    }
  }
}

function renderAnnounceComments(announceId, comments) {
  const list = document.getElementById(`announce-comments-list-${announceId}`);
  if (!comments || comments.length === 0) {
    list.innerHTML = '<p style="color:var(--md-on-surface-variant);font-size:.85rem">暂无评论</p>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const cu = user;
    const canEdit = cu && cu.name === c.created_by;
    const canDelete = cu && (cu.name === c.created_by || cu.role === 'admin' || cu.role === 'owner');
    const actions = [];
    if (canEdit) actions.push({ action: 'editAnnounceComment', text: '编辑', data: { commentId: c.id, announceId: announceId } });
    if (canDelete) actions.push({ action: 'deleteAnnounceComment', text: '删除', data: { commentId: c.id, announceId: announceId } });
    return CommentItem({
      id: `announce-comment-${announceId}-${c.id}`,
      author: c.created_by,
      text: c.content,
      time: formatTime(c.created_at),
      actions: actions
    });
  }).join('');
}

async function editAnnounceComment(dataset, target) {
  const commentId = Number(dataset.commentId);
  const announceId = Number(dataset.announceId);
  const contentEl = document.getElementById(`announce-comment-content-${announceId}-${commentId}`);
  const cache = announceCommentsCache[announceId];
  const currentText = cache?.find(c => c.id === commentId)?.content || '';
  contentEl.innerHTML = `<textarea class="form-textarea" id="announce-comment-edit-input-${announceId}-${commentId}" maxlength="500" placeholder="编辑评论..." style="min-height:40px;font-size:.85rem">${escapeHtml(currentText)}</textarea>
    <div style="display:flex;gap:4px;margin-top:2px">
      <button class="btn btn-xs btn-primary" data-action="saveEditAnnounceComment" data-comment-id="${commentId}" data-announce-id="${announceId}">保存</button>
      <button class="btn btn-xs btn-outline" data-action="cancelEditAnnounceComment" data-comment-id="${commentId}" data-announce-id="${announceId}">取消</button>
    </div>`;
  const actions = document.getElementById(`announce-comment-actions-${announceId}-${commentId}`);
  if (actions) actions.style.display = 'none';
}

async function saveEditAnnounceComment(dataset, target) {
  const commentId = Number(dataset.commentId);
  const announceId = Number(dataset.announceId);
  const input = document.getElementById(`announce-comment-edit-input-${announceId}-${commentId}`);
  const content = input.value.trim();
  if (!content || content.length > 500) return toast('评论内容为1-500字', 'error');
  try {
    const updated = await apiPut(`/api/comments/${commentId}`, { content });
    if (!announceCommentsCache[announceId]) announceCommentsCache[announceId] = [];
    const idx = announceCommentsCache[announceId].findIndex(c => c.id === commentId);
    if (idx >= 0) announceCommentsCache[announceId][idx] = updated;
    renderAnnounceComments(announceId, announceCommentsCache[announceId]);
    toast('评论已更新', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function cancelEditAnnounceComment(dataset, target) {
  const announceId = Number(dataset.announceId);
  renderAnnounceComments(announceId, announceCommentsCache[announceId]);
}

async function deleteAnnounceComment(dataset, target) {
  const commentId = Number(dataset.commentId);
  const announceId = Number(dataset.announceId);
  const actions = document.getElementById(`announce-comment-actions-${announceId}-${commentId}`);
  if (!actions) return;
  if (actions.dataset.confirming === 'true') {
    try {
      await apiDel(`/api/comments/${commentId}`);
      if (announceCommentsCache[announceId]) {
        announceCommentsCache[announceId] = announceCommentsCache[announceId].filter(c => c.id !== commentId);
      }
      renderAnnounceComments(announceId, announceCommentsCache[announceId]);
      const toggle = document.querySelector(`.announce-card[data-id="${announceId}"] .issue-comments-toggle span`);
      if (toggle) toggle.textContent = `评论 (${(announceCommentsCache[announceId] || []).length})`;
      toast('评论已删除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  actions.dataset.confirming = 'true';
  actions.innerHTML = `
    <span style="font-size:.75rem;color:var(--md-on-surface-variant)">确认删除？</span>
    <button class="btn btn-xs btn-primary" data-action="deleteAnnounceComment" data-comment-id="${commentId}" data-announce-id="${announceId}">确认</button>
    <button class="btn btn-xs btn-outline" data-action="cancelDeleteAnnounceComment" data-comment-id="${commentId}" data-announce-id="${announceId}">取消</button>
  `;
}

function cancelDeleteAnnounceComment(dataset, target) {
  const announceId = Number(dataset.announceId);
  renderAnnounceComments(announceId, announceCommentsCache[announceId]);
}

async function postAnnounceComment(dataset, target) {
  const announceId = Number(dataset.announceId);
  const input = document.getElementById(`announce-comment-input-${announceId}`);
  const content = input.value.trim();
  if (!content) return;
  try {
    const c = await apiPost('/api/comments', {
      target_type: 'announcement',
      target_id: announceId,
      content,
    });
    if (!announceCommentsCache[announceId]) announceCommentsCache[announceId] = [];
    announceCommentsCache[announceId].push(c);
    renderAnnounceComments(announceId, announceCommentsCache[announceId]);
    input.value = '';
    const toggle = document.querySelector(`.announce-card[data-id="${announceId}"] .issue-comments-toggle span`);
    if (toggle) toggle.textContent = `评论 (${announceCommentsCache[announceId].length})`;
    toast('评论已发表', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

init();
