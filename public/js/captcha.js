/* ═══════════════════════════════════════════════════════
   通用图形验证码组件（自研，替代 Cloudflare Turnstile）
   用法：
     <div id="captchaBox"></div>
     <script src="/js/captcha.js"></script>
     const cap = new CaptchaWidget('captchaBox');
     // 提交时
     const { captcha_token, captcha_code } = cap.getData();
     // 刷新
     cap.refresh();
   ═══════════════════════════════════════════════════════ */
class CaptchaWidget {
  constructor(containerId) {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    this.token = '';
    if (this.container) {
      this.render();
      this.load();
    }
  }

  render() {
    // 初始占位 SVG（灰底 + Loading），避免显示图片裂开图标
    const placeholderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="70" viewBox="0 0 200 70"><rect width="200" height="70" fill="#f4f4f4"/><text x="100" y="40" font-family="system-ui,sans-serif" font-size="13" fill="#8d8d8d" text-anchor="middle">Loading...</text></svg>';
    const placeholderSrc = 'data:image/svg+xml;base64,' + btoa(placeholderSvg);
    this.container.innerHTML =
      '<div class="captcha-wrap">' +
        '<img class="captcha-img" alt="验证码" title="点击刷新验证码" src="' + placeholderSrc + '" />' +
        '<input class="captcha-input" type="text" maxlength="4" placeholder="输入验证码" ' +
               'autocomplete="off" autocorrect="off" spellcheck="false" />' +
      '</div>';
    this.img = this.container.querySelector('.captcha-img');
    this.input = this.container.querySelector('.captcha-input');
    this.img.addEventListener('click', () => this.load());
  }

  async load() {
    try {
      const res = await fetch('/api/captcha/generate', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const resp = await res.json();
      const data = resp.data || resp; // 兼容 {success,data} 包装
      this.token = data.token;
      // SVG → base64 data URI
      this.img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data.svg)));
      this.input.value = '';
    } catch (e) {
      // 加载失败时显示友好占位，而非裂开图标（用 encodeURIComponent 处理中文）
      const failSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="70" viewBox="0 0 200 70"><rect width="200" height="70" fill="#f4f4f4"/><text x="100" y="40" font-family="system-ui,sans-serif" font-size="12" fill="#b00" text-anchor="middle">加载失败 点击重试</text></svg>';
      this.img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(failSvg)));
      this.token = '';
    }
  }

  getData() {
    return { captcha_token: this.token || '', captcha_code: (this.input ? this.input.value.trim() : '') };
  }

  refresh() { this.load(); }

  isValid() {
    return !!this.token && this.input && this.input.value.trim().length === 4;
  }
}

// 暴露到全局
window.CaptchaWidget = CaptchaWidget;
