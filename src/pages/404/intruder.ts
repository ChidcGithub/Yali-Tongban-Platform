/* 404 页的「伪装入侵」彩蛋
   由旧 public/404.html 原样移植（代码逻辑未改写，仅去掉外层 IIFE 与
   触发条件判断，改由 ErrorPage 在 ?from= 存在时调用）。
   触发时会展示设备指纹伪造终端 + 全屏红色接管动画，并解锁
   intruder 与 frequent_404 两个成就。 */

export const INTRUDER_MARKUP = "<div id=\"intrSeq\" style=\"display:none;position:fixed;inset:0;z-index:99998;background:#5c0e0e;color:#ffb3b3;font-family:var(--md-font-body);align-items:center;justify-content:center;text-align:center;padding:32px;flex-direction:column;opacity:0\">\n  <div id=\"intrTerm\" style=\"position:absolute;inset:0;overflow-y:scroll;z-index:-1;padding:20px 24px;font-family:Consolas,'Courier New',monospace;font-size:.72rem;line-height:1.5;color:rgba(255,179,179,.25);text-align:left;white-space:pre;pointer-events:none;user-select:none\"></div>\n  <div id=\"intrSeqContent\" style=\"max-width:600px\">\n    <div id=\"intrSeqIcon\" style=\"font-size:4rem;margin-bottom:24px;opacity:.7\">\n      <svg viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3 2 21h20L12 3z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/></svg>\n    </div>\n    <div id=\"intrSeqLine1\" style=\"font-size:3.125rem;font-weight:800;line-height:1.3;opacity:0;transform:translateY(16px)\"></div>\n    <div id=\"intrSeqLine2\" style=\"font-size:1.5rem;font-weight:600;line-height:1.4;margin-top:20px;opacity:0;transform:translateY(16px);color:rgba(255,179,179,.6)\"></div>\n  </div>\n</div>"

/** @param from 旧页面 URL 上的 ?from= 值，用于生成「你要越权访问 xxx？」这句文案 */
export function startIntruder(from?: string | null): void {
  const seq = document.getElementById('intrSeq');
  // 标记没渲染出来就直接跳过，避免整段动画在半路抛错
  if (!seq) return

  var line1 = document.getElementById('intrSeqLine1');
  var line2 = document.getElementById('intrSeqLine2');
  var icon = document.getElementById('intrSeqIcon');
  var bodyEl = document.body;

  function animate(el, keyframes, opts) {
    if (el.animate) return el.animate(keyframes, opts).finished;
    return new Promise(function(r){ setTimeout(r, opts.duration || 300); });
  }

  function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  function generateDeviceLines() {
    var lines = [];
    function ts() { var d=new Date();return d.toISOString().replace('T',' ').slice(0,19)+'.'+String(d.getMilliseconds()).padStart(3,'0'); }
    function hex(n){return n.toString(16).toUpperCase();}
    var ua = navigator.userAgent;
    var os = 'Unknown'; if(ua.indexOf('Windows NT')>-1) os='Windows'; else if(ua.indexOf('Mac OS X')>-1) os='macOS'; else if(ua.indexOf('Linux')>-1) os='Linux'; else if(ua.indexOf('Android')>-1) os='Android'; else if(ua.indexOf('iPhone')>-1||ua.indexOf('iPad')>-1) os='iOS';
    var browser = 'Unknown'; var bv='?'; var m; if((m=ua.match(/Edg\/([\d.]+)/))){browser='Edge';bv=m[1]}else if((m=ua.match(/Chrome\/([\d.]+)/))){browser='Chrome';bv=m[1]}else if((m=ua.match(/Firefox\/([\d.]+)/))){browser='Firefox';bv=m[1]}else if((m=ua.match(/Safari\/([\d.]+)/))){browser='Safari';bv=m[1]}
    var engine = ua.indexOf('Gecko')>-1?'Gecko':ua.indexOf('WebKit')>-1?'WebKit':'Blink';
    var cpuCores = navigator.hardwareConcurrency;
    var deviceMem = navigator.deviceMemory;
    var con = navigator.connection;
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var tzOff = -new Date().getTimezoneOffset()/60;
    var lang = navigator.language;
    var langs = navigator.languages||[];
    var plugins = Array.from(navigator.plugins);
    var canvasFp = 'unavailable';
    try {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      var ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0,0,256,256);
      ctx.fillStyle = '#fff';
      ctx.font = '18px Arial';
      ctx.fillText('Cwm fjordbank glyphs vext quiz 0123456789', 2, 2);
      ctx.fillStyle = '#333';
      ctx.font = '16px Times New Roman';
      ctx.fillText('Sphinx of black quartz, judge my vow!', 4, 30);
      ctx.fillRect(50,60,100,60);
      ctx.fillStyle = '#00f';
      ctx.font = 'bold 20px Georgia';
      ctx.fillText('AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz', 2, 80);
      canvasFp = hex(c.toDataURL().length) + hex(c.toDataURL().charCodeAt(100));
    } catch(e){}
    var wglRenderer = 'unavailable';
    var wglVendor = 'unavailable';
    try {
      var wc = document.createElement('canvas');
      var gl = wc.getContext('webgl') || wc.getContext('experimental-webgl');
      if (gl) { wglRenderer = gl.getParameter(gl.RENDERER); wglVendor = gl.getParameter(gl.VENDOR); }
    } catch(e){}
    var sessionId = hex(Date.now()%1000000)+'-'+hex(Math.floor(Math.random()*65536));
    var batchId = hex(Math.floor(Math.random()*16777216)).padStart(6,'0');
    function L(t,p){lines.push({text:t,pause:p||1});}
    L('[ '+ts()+' ] === SYSTEM AUDIT INITIATED ===',300);
    L('[ '+ts()+' ] AUDIT v5.0.0 | Session: '+sessionId+' | Batch: '+batchId,200);
    L('[ '+ts()+' ] Target: '+location.hostname+location.pathname);
    L('[ '+ts()+' ] Referrer: '+(document.referrer||'(none/direct)'));
    L('[ '+ts()+' ] Page loaded: '+new Date().toISOString());
    L('[ '+ts()+' ] === NETWORK INFORMATION ===',250);
    L('[ '+ts()+' ] Online status: '+(navigator.onLine?'CONNECTED':'OFFLINE'));
    L('[ '+ts()+' ] Connection type: '+(con?con.effectiveType:'unavailable'));
    L('[ '+ts()+' ] Round-trip time: '+(con?con.rtt+'ms':'unavailable'));
    L('[ '+ts()+' ] Downlink speed: '+(con?con.downlink+' Mbps':'unavailable'));
    L('[ '+ts()+' ] Data saver: '+(con&&con.saveData?'active':'inactive'));
    L('[ '+ts()+' ] === HARDWARE IDENTIFICATION ===',250);
    L('[ '+ts()+' ] Operating system: '+os);
    L('[ '+ts()+' ] Platform: '+(navigator.platform||'unknown'));
    L('[ '+ts()+' ] CPU architecture: '+(ua.indexOf('x64')>-1||ua.indexOf('Win64')>-1?'x86-64':ua.indexOf('ARM')>-1?'ARM':'x86')+(os==='macOS'?' (Apple Silicon)':''));
    L('[ '+ts()+' ] Logical processors: '+cpuCores+' cores');
    L('[ '+ts()+' ] Device memory: '+(deviceMem?deviceMem+' GB':'unavailable'));
    L('[ '+ts()+' ] Max touch points: '+navigator.maxTouchPoints);
    L('[ '+ts()+' ] === BROWSER IDENTIFICATION ===',250);
    L('[ '+ts()+' ] Browser: '+browser+' '+bv);
    L('[ '+ts()+' ] Engine: '+engine);
    L('[ '+ts()+' ] User-Agent: '+ua,500);
    L('[ '+ts()+' ] WebDriver active: '+(navigator.webdriver?'yes':'no'));
    L('[ '+ts()+' ] PDF viewer: '+(navigator.pdfViewerEnabled?'enabled':'disabled'));
    L('[ '+ts()+' ] Do Not Track: '+(navigator.doNotTrack||'unspecified'));
    L('[ '+ts()+' ] Cookie enabled: '+(navigator.cookieEnabled?'yes':'no'));
    L('[ '+ts()+' ] Plugins ('+plugins.length+'): '+(plugins.length?plugins.map(function(p){return p.name}).join(', '):'none'),200);
    L('[ '+ts()+' ] === DISPLAY INFORMATION ===',250);
    L('[ '+ts()+' ] Resolution: '+screen.width+'x'+screen.height);
    L('[ '+ts()+' ] Color depth: '+(screen.colorDepth||24)+'-bit');
    L('[ '+ts()+' ] Pixel depth: '+(screen.pixelDepth||24)+'-bit');
    L('[ '+ts()+' ] Available space: '+screen.availWidth+'x'+screen.availHeight);
    L('[ '+ts()+' ] Device pixel ratio: '+(window.devicePixelRatio||1).toFixed(2)+'x');
    L('[ '+ts()+' ] Viewport: '+window.innerWidth+'x'+window.innerHeight);
    L('[ '+ts()+' ] Orientation: '+(screen.orientation?screen.orientation.type:'unavailable'));
    L('[ '+ts()+' ] Color gamut: '+(window.matchMedia('(color-gamut:p3)').matches?'Display P3':'sRGB'));
    L('[ '+ts()+' ] HDR: '+(window.matchMedia('(dynamic-range:high)').matches?'supported':'standard'));
    L('[ '+ts()+' ] === TIME & LOCALE ===',250);
    L('[ '+ts()+' ] Time zone: '+tz+' (UTC'+(tzOff>=0?'+':'')+tzOff+')');
    L('[ '+ts()+' ] System time: '+new Date().toLocaleString('en-US',{hour12:false,timeZoneName:'short'}));
    L('[ '+ts()+' ] UTC time: '+new Date().toUTCString());
    L('[ '+ts()+' ] Language: '+lang);
    L('[ '+ts()+' ] Accepted languages: '+langs.join(', '));
    L('[ '+ts()+' ] === STORAGE SCAN ===',250);
    L('[ '+ts()+' ] Cookies: '+document.cookie.length+' bytes');
    L('[ '+ts()+' ] localStorage: '+localStorage.length+' entries');
    for(var i=0;i<Math.min(localStorage.length,10);i++){(function(k,v){L('[ '+ts()+' ]   > '+k+' = '+v.slice(0,80));})(localStorage.key(i),localStorage.getItem(localStorage.key(i))||'');}
    L('[ '+ts()+' ] sessionStorage: '+sessionStorage.length+' entries');
    L('[ '+ts()+' ] === FINGERPRINT ANALYSIS ===',300);
    L('[ '+ts()+' ] Canvas fingerprint: '+canvasFp+' ('+(canvasFp!=='unavailable'?'256x256 render':'failed')+')',200);
    L('[ '+ts()+' ] WebGL renderer: '+wglRenderer,200);
    L('[ '+ts()+' ] WebGL vendor: '+wglVendor);
    L('[ '+ts()+' ] === ENVIRONMENT SCAN ===',250);
    L('[ '+ts()+' ] Service worker: '+(navigator.serviceWorker?'registered':'not registered'));
    L('[ '+ts()+' ] Touch support: '+('ontouchstart' in window?'yes ('+navigator.maxTouchPoints+' points)':'no'));
    L('[ '+ts()+' ] Battery: '+(navigator.getBattery?'API available':'unsupported'));
    L('[ '+ts()+' ] Geolocation: '+('geolocation' in navigator?'API available':'unsupported'));
    L('[ '+ts()+' ] Clipboard: '+('clipboard' in navigator?'API available':'unsupported'));
    L('[ '+ts()+' ] Bluetooth: '+('bluetooth' in navigator?'API available':'unsupported'));
    L('[ '+ts()+' ] USB: '+('usb' in navigator?'API available':'unsupported'));
    L('[ '+ts()+' ] WebGL: '+('WebGLRenderingContext' in window?'supported':'unsupported'));
    L('[ '+ts()+' ] WebAssembly: '+('WebAssembly' in window?'supported':'unsupported'));
    L('[ '+ts()+' ] Web Workers: '+('Worker' in window?'supported':'unsupported'));
    L('[ '+ts()+' ] WebSocket: '+('WebSocket' in window?'supported':'unsupported'));
    L('[ '+ts()+' ] WebRTC: '+('RTCPeerConnection' in window?'supported':'unsupported'));
    L('[ '+ts()+' ] === ACTIVE MONITORS ===',250);
    L('[ '+ts()+' ] CSS media queries evaluated');
    L('[ '+ts()+' ]   > Prefers color scheme: '+(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
    L('[ '+ts()+' ]   > Prefers contrast: '+(window.matchMedia('(prefers-contrast:more)').matches?'more':window.matchMedia('(prefers-contrast:less)').matches?'less':'no-preference'));
    L('[ '+ts()+' ]   > Prefers reduced motion: '+(window.matchMedia('(prefers-reduced-motion:reduce)').matches?'reduce':'no-preference'));
    L('[ '+ts()+' ]   > Prefers reduced transparency: '+(window.matchMedia('(prefers-reduced-transparency:reduce)').matches?'reduce':'no-preference'));
    L('[ '+ts()+' ]   > Inverted colors: '+(window.matchMedia('(inverted-colors:inverted)').matches?'yes':'no'));
    L('[ '+ts()+' ] === DATA PACKAGING ===',250);
    var cookieBytes=document.cookie.length;
    var lsBytes=0;for(var j=0;j<localStorage.length;j++){var k2=localStorage.key(j);lsBytes+=(k2?k2.length:0)+(localStorage.getItem(k2)||'').length;}
    var totalSize=cookieBytes+lsBytes+ua.length+4096;
    L('[ '+ts()+' ] Collected parameters: '+lines.length+' data points');
    L('[ '+ts()+' ] Payload size: ~'+totalSize+' bytes');
    L('[ '+ts()+' ] Checksum (SHA-256): '+hex(totalSize*1000).padStart(8,'0')+hex(lines.length*500).padStart(8,'0')+hex(cpuCores||0).padStart(8,'0')+hex(Date.now()%100000000).padStart(8,'0'),400);
    L('[ '+ts()+' ] === TRANSMISSION ===',250);
    L('[ '+ts()+' ] Channel: '+location.protocol+'//'+location.host);
    L('[ '+ts()+' ] Method: POST | Content-Type: application/json');
    L('[ '+ts()+' ] Secure: '+(location.protocol==='https:'?'TLS 1.3':'unencrypted'),200);
    L('[ '+ts()+' ] Server response: 200 OK ('+(con?con.rtt+'ms':'?ms')+')',300);
    L('[ '+ts()+' ] === AUDIT COMPLETE ===',500);
    L('[ '+ts()+' ] Session: '+sessionId+' | Records: '+lines.length+' | Size: '+totalSize+'B');
    L('[ '+ts()+' ] Archive: /logs/'+sessionId+'_'+batchId+'.json');
    L('[ '+ts()+' ] === END OF LOG ===',500);
    return lines;
  }

  function printTerminal(term, entries) {
    return new Promise(function(resolve){
      var idx = 0;
      function printNext() {
        if (idx >= entries.length) { resolve(); return; }
        var entry = entries[idx++];
        var text = entry.text || entry;
        var pause = entry.pause != null ? entry.pause : 1;
        term.textContent += text + '\n';
        term.scrollTop = term.scrollHeight;
        setTimeout(printNext, pause);
      }
      printNext();
    });
  }

  (async function(){
    // wait 0.5s
    await sleep(500);

    // show overlay
    seq.style.display = 'flex';
    bodyEl.style.overflow = 'hidden';
    await animate(seq, { opacity: [0, 1] }, { duration: 350, easing: 'ease' });
    seq.style.opacity = '1';

    // phase 1: "你要越权访问 XXX？"
    line1.textContent = from ? '你要越权访问' + from + '？' : '你没有权限访问此页面';
    await animate(line1, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] }, { duration: 500, easing: 'ease-out' });
    line1.style.opacity = '1';
    line1.style.transform = 'translateY(0)';

    await sleep(2000);

    // exit phase 1
    await animate(line1, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-16px)'] }, { duration: 350, easing: 'ease-in' });
    line1.style.opacity = '0';
    line1.style.transform = 'translateY(-16px)';

    // phase 2: "正在收集数据并上传"
    line1.textContent = '正在收集数据并上传';
    line2.textContent = '请稍候';
    await animate(line1, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] }, { duration: 500, easing: 'ease-out' });
    line1.style.opacity = '1';
    line1.style.transform = 'translateY(0)';
    await animate(line2, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] }, { duration: 500, easing: 'ease-out' });
    line2.style.opacity = '1';
    line2.style.transform = 'translateY(0)';

    // print terminal one line at a time
    var term = document.getElementById('intrTerm');
    var devLines = generateDeviceLines();
    await printTerminal(term, devLines);

    await sleep(1500);

    // exit phase 2
    term.textContent = '';
    await animate(line1, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-16px)'] }, { duration: 350, easing: 'ease-in' });
    line1.style.opacity = '0';
    line1.style.transform = 'translateY(-16px)';
    await animate(line2, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-16px)'] }, { duration: 350, easing: 'ease-in' });
    line2.style.opacity = '0';
    line2.style.transform = 'translateY(-16px)';

    // change to "已完成"
    line1.textContent = '已完成';
    line2.textContent = '';
    await animate(line1, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] }, { duration: 500, easing: 'ease-out' });
    line1.style.opacity = '1';
    line1.style.transform = 'translateY(0)';
    // small scale pulse
    await animate(icon, { transform: ['scale(1)', 'scale(1.15)', 'scale(1)'] }, { duration: 500, easing: 'ease' });

    await sleep(1200);

    // unlock achievement
    try { unlockAchievement('intruder').then(function(d){ if(d) showAchievementToast('intruder'); }); } catch(e){}
    // 404常客
    const _404c = parseInt(localStorage.getItem('_404count') || '0') + 1;
    localStorage.setItem('_404count', String(_404c));
    if (_404c >= 3) { try { unlockAchievement('frequent_404').then(function(d){ if(d) showAchievementToast('frequent_404'); }); } catch(e){} }

    // exit overlay
    await animate(seq, { opacity: [1, 0] }, { duration: 350, easing: 'ease-in' });
    seq.style.display = 'none';
    bodyEl.style.overflow = '';
  })();

}
