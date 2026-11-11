// Phone side: joins a room and turns into whatever controller the laptop asks for.
(function () {
  const app = document.getElementById('app'), banner = document.getElementById('banner'), quitBtn = document.getElementById('quit');
  const qs = new URLSearchParams(location.search);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let id = store.get('cc_id'); if (!id) { id = Math.random().toString(36).slice(2, 12); store.set('cc_id', id); }
  if (qs.get('fresh')) id = Math.random().toString(36).slice(2, 12); // lets several tabs on one device join as different players
  let ws = null, code = (qs.get('c') || '').toUpperCase(), name = store.get('cc_name') || '', joined = false, mode = null, isVip = false, cleanup = null, retryT = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const send = (d) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'msg', d })); };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function screen(cls, html) { if (cleanup) { try { cleanup(); } catch {} cleanup = null; } document.body.className = (cls || '') + (isVip ? ' vip' : ''); app.innerHTML = html; return app; }
  // a button that reacts instantly to touch and supports several fingers at once
  function hold(node, onDown, onUp) {
    const down = (e) => { e.preventDefault(); node.classList.add('on'); try { node.setPointerCapture(e.pointerId); } catch {} onDown && onDown(e); };
    const up = (e) => { node.classList.remove('on'); onUp && onUp(e); };
    node.addEventListener('pointerdown', down); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); node.addEventListener('lostpointercapture', up);
  }
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) keepAwake(); });

  // ---------- connection ----------
  function connect() {
    clearTimeout(retryT);
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', code, name, id }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'joined') { joined = true; banner.hidden = true; store.set('cc_name', name); if (!mode) showWait({ title: "You're in!", text: 'Look at the big screen.' }); }
      else if (m.t === 'error') { joined = false; showJoin(m.msg); }
      else if (m.t === 'closed') { joined = false; mode = null; showJoin('The room was closed.'); }
      else if (m.t === 'msg') onMsg(m.d);
    };
    ws.onclose = () => { if (joined) { banner.hidden = false; retryT = setTimeout(connect, 1500); } };
  }
  quitBtn.onclick = () => { if (confirm('End this game for everyone and go back to the lobby?')) send({ a: 'quit' }); };

  let evt = null; // handler for small in-game events of the current mode
  function onMsg(d) {
    if (d.e) { evt && evt(d); return; }
    if ('vip' in d) isVip = !!d.vip;
    mode = d.m; evt = null;
    if (d.color) document.documentElement.style.setProperty('--me', d.color);
    quitBtn.hidden = !(isVip && !['lobby', 'done'].includes(d.m));
    ({ lobby: showLobby, wait: showWait, pick: showPick, race: showRace, done: showDone, sk_choose: showChoose, sk_draw: showDraw, turf: showTurf, pad: showPad, pl_write: showWrite, pl_vote: showVote, pl_react: showReact, choice: showChoice, sz_guess: showSize }[d.m] || showWait)(d);
  }

  // ---------- join ----------
  function showJoin(err) {
    quitBtn.hidden = true;
    screen('', `<h1>COUCH<br><span>CLASH</span></h1>
      <label>Your name</label><input id="nm" maxlength="12" autocomplete="off" placeholder="Name" value="${esc(name)}">
      <label>Room code</label><input id="cd" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" value="${esc(code)}">
      <div class="err">${esc(err || '')}</div><div class="grow"></div><button class="btn red" id="go">JOIN</button>`);
    const go = () => {
      name = app.querySelector('#nm').value.trim(); code = app.querySelector('#cd').value.trim().toUpperCase();
      if (!name) return (app.querySelector('.err').textContent = 'Type a name first');
      if (code.length !== 4) return (app.querySelector('.err').textContent = 'The code has 4 letters');
      keepAwake(); mode = null; connect();
    };
    app.querySelector('#go').onclick = go;
    app.querySelector('#cd').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  // ---------- small shared pieces ----------
  const seenHow = new Set();
  // a short "how to play" card, shown the first time each controller appears; any touch closes it
  function howto(root, key, title, rows) {
    if (seenHow.has(key)) return; seenHow.add(key);
    const h = el(`<div class="how"><div class="card"><h3>${esc(title)}</h3>${rows.map(([i, t]) => `<div class="hr"><b>${i}</b><span>${esc(t)}</span></div>`).join('')}<em>Tap to start</em></div></div>`);
    const close = () => h.remove(); h.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(); }); setTimeout(close, 8000); root.appendChild(h);
  }
  let toastT = 0;
  function toast(root, html, cls) {
    let t = root.querySelector('.ptoast'); if (!t) { t = el('<div class="ptoast"></div>'); root.appendChild(t); }
    t.className = 'ptoast on ' + (cls || ''); t.innerHTML = html; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400);
  }
  const fmtSize = (m) => { const f = (x) => (x >= 100 ? Math.round(x).toLocaleString('en') : String(+x.toPrecision(x >= 10 ? 3 : 2))); return m >= 1000 ? f(m / 1000) + ' km' : m >= 1 ? f(m) + ' m' : f(m * 100) + ' cm'; };

  // ---------- lobby / wait / done ----------
  function scoreList(s) { return s && s.length ? `<ul class="scores">${s.map((x) => `<li><i style="background:${x.color}"></i>${esc(x.name)}<b>${x.score}</b></li>`).join('')}</ul>` : ''; }
  function showLobby(d) {
    screen('', `<div class="me"><i></i>${esc(d.name)}</div>
      <h2 style="margin:16px 0 6px">${d.vip ? 'Pick a game' : 'Lobby'}</h2>
      ${d.vip ? `<p>You joined first, so you are the host.</p>
        <div class="botrow"><div><b>Bots</b><small>${d.bots ? 'Join every game marked 🤖' : 'Add computer players'}</small></div><button class="arrow" id="bm">−</button><b id="bn">${d.bots || 0}</b><button class="arrow" id="bp">+</button></div>
        <div class="stack" style="margin-top:14px">${d.games.map((g) => `<button class="btn g-${esc(g.c || '')}" data-k="${g.k}">${esc(g.name)}<small>${esc(g.desc)}${g.bots && d.bots ? ' · 🤖 +' + d.bots : ''}</small></button>`).join('')}</div>`
        : '<p>Waiting for the host to pick a game.</p>'}
      <div class="grow"></div><label>Scores</label>${scoreList(d.scores)}`);
    app.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => send({ a: 'menu', game: b.dataset.k })));
    const on = (s, f) => { const b = app.querySelector(s); if (b) b.onclick = f; };
    on('#bm', () => send({ a: 'bots', n: Math.max(0, (d.bots || 0) - 1) })); on('#bp', () => send({ a: 'bots', n: Math.min(d.maxBots || 3, (d.bots || 0) + 1) }));
  }
  function showWait(d) { screen('', `<div class="center"><h2>${esc(d.title || '')}</h2><p>${esc(d.text || '')}</p></div>`); }
  function showDone(d) {
    screen('', `<div class="center"><h2>${esc(d.title || 'Done')}</h2><p>${esc(d.text || '')}</p></div>${d.vip ? '<button class="btn" id="bk">BACK TO LOBBY</button>' : '<p style="text-align:center;opacity:.6">Waiting for the host…</p>'}`);
    const b = app.querySelector('#bk'); if (b) b.onclick = () => send({ a: 'back' });
  }
  // a plain list of choices (used for picking a pack in Size Up)
  function showChoice(d) {
    screen('', `<h2>${esc(d.title || 'Choose')}</h2><p style="margin:8px 0 16px">${esc(d.text || '')}</p><div class="stack">${d.opts.map((o, i) => `<button class="btn ch${i % 5}" data-k="${esc(o.k)}">${esc(o.label)}<small>${esc(o.sub || '')}</small></button>`).join('')}</div>`);
    app.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { send({ a: 'pick', k: b.dataset.k }); buzz(20); }));
  }

  // ---------- race: car + track picker ----------
  function showPick(d) {
    const c = d.cars[d.car], labels = ['Speed', 'Accel', 'Handling'];
    screen('', `<h2>Choose your car</h2>
      <div class="car" style="margin-top:14px"><div class="row"><button class="arrow" id="cp">‹</button><div class="nm"><b>${esc(c.name)}</b><em>${esc(c.power)}</em></div><button class="arrow" id="cn">›</button></div>
      <p>${esc(c.blurb)}</p>${labels.map((l, i) => `<div class="stat">${l}<u>${[1, 2, 3, 4, 5].map((n) => `<s class="${n <= c.stats[i] ? 'on' : ''}"></s>`).join('')}</u></div>`).join('')}</div>
      ${d.vip ? `<label>Track</label><div class="trackpick"><button class="arrow" id="tp">‹</button><b>${esc(d.tracks[d.track])}</b><button class="arrow" id="tn">›</button></div>` : `<label>Track</label><p><b>${esc(d.tracks[d.track])}</b> (host picks)</p>`}
      <div class="grow"></div>${d.vip ? '<button class="btn red" id="go">GO!</button>' : '<p style="text-align:center;opacity:.6">Waiting for the host to start…</p>'}`);
    const n = d.cars.length, t = d.tracks.length, on = (s, f) => { const b = app.querySelector(s); if (b) b.onclick = f; };
    on('#cp', () => send({ a: 'car', i: (d.car + n - 1) % n })); on('#cn', () => send({ a: 'car', i: (d.car + 1) % n }));
    on('#tp', () => send({ a: 'track', i: (d.track + t - 1) % t })); on('#tn', () => send({ a: 'track', i: (d.track + 1) % t }));
    on('#go', () => { askMotion(); send({ a: 'go' }); });
    app.addEventListener('click', askMotion, { once: true }); // iOS needs a tap before it shares tilt data
  }

  // ---------- race: controller ----------
  let motionAsked = false, motionOK = false, tiltSeen = false, rawTilt = 0;
  function askMotion() {
    if (motionAsked && motionOK) return; motionAsked = true;
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') D.requestPermission().then((r) => { motionOK = r === 'granted'; }).catch(() => { motionOK = false; });
    else motionOK = !!D;
  }
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta == null) return; tiltSeen = true;
    const a = (window.screen.orientation && window.screen.orientation.angle != null) ? window.screen.orientation.angle : (window.orientation || 0);
    rawTilt = a === 90 ? e.beta : (a === 270 || a === -90) ? -e.beta : e.gamma;
  });
  const WHEEL = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="10"/><path d="M50 50L13 40M50 50L87 40M50 50V89" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><circle cx="50" cy="50" r="11" fill="currentColor"/></svg>';
  function showRace(d) {
    let useTilt = store.get('cc_tilt') !== '0', flip = store.get('cc_flip') === '1', gas = false, brake = false, L = false, R = false, ready = false, hasItem = false, lastSent = '', lastT = 0;
    const root = screen('ctl race', `<div class="rc">
        <button class="rb pw"><i>⚡</i><b>${esc(d.power)}</b><small>CHARGING</small><u></u></button>
        <button class="rb it"><i>?</i><b>ITEM</b><small>DRIVE INTO A ? BOX</small></button>
        <button class="rb brake"><b>BRAKE</b></button>
        <button class="rb sl"><b>◀</b></button><button class="rb sr"><b>▶</b></button>
        <div class="mid"><div class="wheel">${WHEEL}</div><div class="mode"></div><button class="cfg">Controls</button></div>
        <button class="rb gas"><b>GAS</b><small>HOLD</small></button>
      </div>
      <div class="sheet" hidden><div class="card"><h3>Steering</h3>
        <button class="opt" data-o="tilt"><b>Tilt the phone</b><small>Hold it like a steering wheel</small></button>
        <button class="opt" data-o="btns"><b>Arrow buttons</b><small>Left thumb steers</small></button>
        <button class="opt" data-o="flip"><b>Flip tilt direction</b><small>If the car turns the wrong way</small></button>
        <button class="btn" data-o="done">DONE</button></div></div>
      <div class="rotate"><div><div class="ph">📱</div><h2>Turn your phone sideways</h2><p style="margin-top:10px">Hold it like a steering wheel.</p></div></div>`);
    const rc = root.querySelector('.rc'), pw = root.querySelector('.pw'), it = root.querySelector('.it'), wheel = root.querySelector('.wheel'), modeEl = root.querySelector('.mode'), sheet = root.querySelector('.sheet');
    function build() {
      rc.classList.toggle('tilt', useTilt); rc.classList.toggle('btns', !useTilt); gas = brake = L = R = false;
      modeEl.textContent = useTilt ? 'TILT TO STEER' : 'ARROWS STEER';
      sheet.querySelector('[data-o=tilt]').classList.toggle('on', useTilt); sheet.querySelector('[data-o=btns]').classList.toggle('on', !useTilt);
      sheet.querySelector('[data-o=flip]').classList.toggle('on', flip); sheet.querySelector('[data-o=flip]').style.display = useTilt ? '' : 'none';
    }
    hold(root.querySelector('.gas'), () => { gas = true; }, () => { gas = false; });
    hold(root.querySelector('.brake'), () => { brake = true; }, () => { brake = false; });
    hold(root.querySelector('.sl'), () => { L = true; }, () => { L = false; }); hold(root.querySelector('.sr'), () => { R = true; }, () => { R = false; });
    hold(pw, () => { if (ready) { send({ a: 'pw' }); buzz(40); } });
    hold(it, () => { if (hasItem) { send({ a: 'it' }); buzz(40); } });
    root.querySelector('.cfg').onclick = () => { sheet.hidden = false; };
    sheet.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => {
      const o = b.dataset.o;
      if (o === 'tilt') { useTilt = true; store.set('cc_tilt', '1'); askMotion(); } else if (o === 'btns') { useTilt = false; store.set('cc_tilt', '0'); }
      else if (o === 'flip') { flip = !flip; store.set('cc_flip', flip ? '1' : '0'); } else sheet.hidden = true;
      build();
    }));
    build();
    const setReady = (r, cd) => {
      ready = r; pw.classList.toggle('ready', r); pw.querySelector('small').textContent = r ? 'TAP TO USE' : 'CHARGING'; const bar = pw.querySelector('u');
      bar.style.animation = 'none'; if (!r && cd) { void bar.offsetWidth; bar.style.animation = `fillup ${cd}s linear forwards`; } if (r) buzz(25);
    };
    evt = (m) => {
      if (m.e === 'pw') setReady(!!m.ready, m.cd);
      if (m.e === 'hit') { buzz([60, 40, 120]); if (m.text) toast(root, `<b>${esc(m.icon || '💥')}</b> ${esc(m.text)}`, 'bad'); root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); }
      if (m.e === 'got') { buzz(30); toast(root, `<b>${esc(m.icon || '🎯')}</b> ${esc(m.text)}`, 'good'); }
      if (m.e === 'item') { hasItem = !!m.k; it.classList.toggle('ready', hasItem); it.querySelector('i').textContent = hasItem ? m.icon : '?'; it.querySelector('b').textContent = hasItem ? m.name : 'ITEM'; it.querySelector('small').textContent = hasItem ? 'TAP TO USE' : 'DRIVE INTO A ? BOX'; if (hasItem) buzz(25); }
    };
    const HOW = [['🏎️', 'Steer, and hold GAS'], ['?', 'Drive into ? boxes, then tap ITEM'], ['⚡', 'Your car power recharges. Tap it when it glows']];
    // phones that need a tap before sharing tilt get one card that covers both the choice and the how-to
    if (useTilt && !(motionAsked && motionOK) && window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      seenHow.add('race');
      const g = el(`<div class="gate"><div class="card"><h3>How do you want to steer?</h3>${HOW.slice(1).map(([i, t]) => `<div class="hr"><b>${i}</b><span>${esc(t)}</span></div>`).join('')}<button class="btn">TILT THE PHONE</button><button class="btn ghost">ARROW BUTTONS</button></div></div>`);
      const bs = g.querySelectorAll('button'); bs[0].onclick = () => { askMotion(); g.remove(); }; bs[1].onclick = () => { useTilt = false; store.set('cc_tilt', '0'); build(); g.remove(); }; root.appendChild(g);
    } else { askMotion(); howto(root, 'race', 'How to drive', [[HOW[0][0], useTilt ? 'Tilt the phone to steer, hold GAS' : 'Arrows steer, hold GAS'], HOW[1], HOW[2]]); }
    let steerS = 0;
    const iv = setInterval(() => {
      let s;
      if (useTilt) { let t = clamp(rawTilt / 26, -1, 1) * (flip ? -1 : 1); if (Math.abs(t) < 0.07) t = 0; steerS += (t - steerS) * 0.55; s = steerS; }
      else { const t = (R ? 1 : 0) - (L ? 1 : 0); steerS += (t - steerS) * 0.5; s = t; }
      wheel.style.transform = `rotate(${steerS * 75}deg)`;
      const msg = { a: 'in', s: Math.round(s * 100) / 100, g: gas ? 1 : 0, b: brake ? 1 : 0 }, key = msg.s + '|' + msg.g + '|' + msg.b, now = Date.now();
      if (key !== lastSent || now - lastT > 400) { send(msg); lastSent = key; lastT = now; }
    }, 40);
    // if no tilt data shows up, fall back to buttons so nobody is stuck
    const fb = setTimeout(() => { if (useTilt && !tiltSeen && motionAsked) { useTilt = false; build(); toast(root, 'No tilt sensor found. Using arrow buttons', ''); } }, 3500);
    cleanup = () => { clearInterval(iv); clearTimeout(fb); };
  }

  // ---------- sketch ----------
  function showChoose(d) {
    screen('', `<h2>Your turn to draw</h2><p style="margin:8px 0 16px">Pick a word. Harder words are worth more.</p>
      <div class="stack">${d.words.map((w, i) => `<button class="btn ${['teal', '', 'red'][i]}" data-i="${i}"><span class="lvl"><span>${esc(w.w)}</span><b>${w.pts}</b></span><small style="text-align:left">${['Easy', 'Medium', 'Hard'][i]}</small></button>`).join('')}</div>`);
    app.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => send({ a: 'word', i: +b.dataset.i })));
  }
  function showDraw(d) {
    const COLS = ['#14110f', '#ff4b2b', '#ff9a2b', '#ffc62b', '#3fbf5a', '#2b7bff', '#b455ff', '#8a5a2b'], SIZES = [0.008, 0.018, 0.04];
    let col = COLS[0], size = SIZES[1], erase = false, strokes = [], cur = null, pend = [], sid = 0, left = d.time, ends = Date.now() + d.time * 1000;
    const root = screen('', `<div class="skc"><div class="top"><div class="word"><small>Draw this · ${d.pts} pts</small>${esc(d.word)}</div><div class="tm">${left}</div></div>
      <canvas width="800" height="600"></canvas>
      <div class="tools">${COLS.map((c, i) => `<button class="sw ${i ? '' : 'on'}" style="background:${c}" data-c="${c}"></button>`).join('')}</div>
      <div class="tools">${SIZES.map((s, i) => `<button class="tb sz ${i === 1 ? 'on' : ''}" data-s="${s}"><i style="width:${6 + i * 7}px;height:${6 + i * 7}px"></i></button>`).join('')}
        <button class="tb" id="er">Eraser</button><button class="tb" id="un">Undo</button><button class="tb" id="cl">Clear</button></div>
      <div class="grow"></div><button class="btn teal" id="gs">SOMEONE GUESSED IT!</button></div>`);
    const cv = root.querySelector('canvas'), cx = cv.getContext('2d'), tm = root.querySelector('.tm');
    cx.lineCap = cx.lineJoin = 'round';
    const drawStroke = (s) => { const p = s.p; if (!p.length) return; cx.strokeStyle = cx.fillStyle = s.c; cx.lineWidth = s.w * 800; cx.beginPath(); cx.moveTo(p[0] * 800, p[1] * 600); if (p.length === 2) cx.lineTo(p[0] * 800 + 0.1, p[1] * 600); for (let i = 2; i < p.length; i += 2) cx.lineTo(p[i] * 800, p[i + 1] * 600); cx.stroke(); };
    const redraw = () => { cx.clearRect(0, 0, 800, 600); strokes.forEach(drawStroke); };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    const flush = (end) => { if (!cur) return; if (pend.length || end) { send({ a: 'st', n: cur.n, c: cur.c, w: cur.w, p: pend.map((v) => Math.round(v * 1000) / 1000), end: end ? 1 : 0 }); pend = []; } };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch {} const [x, y] = pt(e); cur = { n: ++sid, c: erase ? '#ffffff' : col, w: erase ? 0.06 : size, p: [x, y] }; strokes.push(cur); pend = [x, y]; drawStroke(cur); });
    cv.addEventListener('pointermove', (e) => { if (!cur) return; const [x, y] = pt(e), p = cur.p, lx = p[p.length - 2], ly = p[p.length - 1]; if (Math.abs(x - lx) + Math.abs(y - ly) < 0.004) return;
      cx.strokeStyle = cur.c; cx.lineWidth = cur.w * 800; cx.beginPath(); cx.moveTo(lx * 800, ly * 600); cx.lineTo(x * 800, y * 600); cx.stroke(); p.push(x, y); pend.push(x, y); });
    const endStroke = () => { if (cur) { flush(true); cur = null; } };
    cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
    const fl = setInterval(() => flush(false), 70);
    root.querySelectorAll('.sw').forEach((b) => (b.onclick = () => { col = b.dataset.c; erase = false; root.querySelector('#er').classList.remove('on'); root.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); }));
    root.querySelectorAll('.sz').forEach((b) => (b.onclick = () => { size = +b.dataset.s; root.querySelectorAll('.sz').forEach((x) => x.classList.toggle('on', x === b)); }));
    root.querySelector('#er').onclick = (e) => { erase = !erase; e.currentTarget.classList.toggle('on', erase); };
    root.querySelector('#un').onclick = () => { if (strokes.length) { strokes.pop(); redraw(); send({ a: 'undo' }); } };
    root.querySelector('#cl').onclick = () => { strokes = []; redraw(); send({ a: 'clear' }); };
    root.querySelector('#gs').onclick = () => {
      const m = el(`<div class="modal"><h2>Who guessed it?</h2>${d.others.map((o) => `<button class="btn" data-id="${esc(o.id)}" style="background:${o.color}">${esc(o.name)}</button>`).join('')}<button class="btn ghost" id="no">Nobody yet</button></div>`);
      m.querySelector('#no').onclick = () => m.remove();
      m.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => { send({ a: 'guessed', id: b.dataset.id }); m.remove(); }));
      root.appendChild(m);
    };
    const tk = setInterval(() => { left = Math.max(0, Math.ceil((ends - Date.now()) / 1000)); tm.textContent = left; }, 250);
    cleanup = () => { clearInterval(fl); clearInterval(tk); };
  }

  // ---------- shared thumb stick: the base appears where the thumb lands, and follows it ----------
  function stick(zone, base, R, onMove, onEnd) {
    const knob = base.querySelector('.knob'); let ox = 0, oy = 0, active = null;
    const home = () => { base.style.left = ''; base.style.top = ''; base.classList.remove('live'); knob.style.transform = ''; };
    const setBase = () => { const r = zone.getBoundingClientRect(); base.style.left = ox - r.left + 'px'; base.style.top = oy - r.top + 'px'; };
    zone.addEventListener('pointerdown', (e) => { e.preventDefault(); if (active !== null) return; active = e.pointerId; ox = e.clientX; oy = e.clientY; base.classList.add('live'); setBase(); try { zone.setPointerCapture(e.pointerId); } catch {} });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return; let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy);
      if (m > R) { ox += dx - dx * R / m; oy += dy - dy * R / m; dx *= R / m; dy *= R / m; setBase(); } // the centre follows the thumb, so reversing is instant
      knob.style.transform = `translate(${dx}px,${dy}px)`; onMove(dx / R, dy / R, m);
    });
    const up = (e) => { if (e.pointerId !== active) return; active = null; home(); onEnd && onEnd(); };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    return { get active() { return active !== null; } };
  }
  const STICK = '<div class="base"><span class="ar u">▲</span><span class="ar r">▶</span><span class="ar d">▼</span><span class="ar l">◀</span><i class="knob"></i></div>';

  // ---------- turf ----------
  function showTurf(d) {
    const root = screen('ctl turf', `<div class="tfc"><div class="bar"><div class="who"><i></i>YOUR LAND</div><b class="pct">0%</b></div><div class="zone">${STICK}<div class="tip">Drag anywhere to steer</div></div><div class="st">Leave your colour, loop back to claim the land inside</div></div>`);
    const zone = root.querySelector('.zone'), base = root.querySelector('.base'), pct = root.querySelector('.pct'), st = root.querySelector('.st'), tip = root.querySelector('.tip');
    let lastAng = 99, lastT = 0; const idle = st.textContent;
    const sk = stick(zone, base, 60, (x, y, m) => {
      if (m < 14) return; tip.style.opacity = '0';
      const ang = Math.atan2(y, x), now = Date.now(); let df = ang - lastAng; df = Math.abs(Math.atan2(Math.sin(df), Math.cos(df)));
      if ((df > 0.04 && now - lastT > 33) || now - lastT > 250) { lastAng = ang; lastT = now; send({ a: 'ang', r: Math.round(ang * 100) / 100 }); }
    });
    const beat = setInterval(() => { if (sk.active && lastAng !== 99 && Date.now() - lastT > 250) { lastT = Date.now(); send({ a: 'ang', r: Math.round(lastAng * 100) / 100 }); } }, 120);
    cleanup = () => clearInterval(beat);
    howto(root, 'turf', 'How to play Turf War', [['🕹️', 'Drag anywhere. You keep moving that way'], ['⭕', 'Leave your colour and loop back to claim land'], ['✂️', 'Cross a rival trail to knock them out. Protect yours']]);
    evt = (m) => {
      if (m.e !== 'tf') return;
      if (m.pct != null) pct.textContent = m.pct + '%';
      if (m.st === 'ko') { buzz([80, 50, 160]); st.textContent = m.by ? `${m.by} cut your trail. New patch, keep going` : 'You hit your own trail. New patch, keep going'; root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); setTimeout(() => { st.textContent = idle; }, 3000); }
      if (m.st === 'out') { buzz(400); st.textContent = 'No empty land left. You are out'; pct.textContent = 'OUT'; }
      if (m.st === 'cap') buzz(20);
    };
  }

  // ---------- thumb stick + one button (Car Football, Blast Zone) ----------
  function showPad(d) {
    const four = !!d.four;
    const root = screen('ctl padm', `<div class="pad2${four ? ' four' : ''}"><div class="bar"><b class="ttl">${esc(d.title || '')}</b><span class="sub">${esc(d.sub || '')}</span></div>
      <div class="zone">${STICK}<div class="tip">${four ? 'MOVE' : 'DRIVE'}</div></div>
      <div class="side"><button class="act"><i>${esc(d.icon || '')}</i><b>${esc(d.btn || 'GO')}</b><u></u></button></div></div>`);
    const pad = root.querySelector('.pad2'), zone = root.querySelector('.zone'), base = root.querySelector('.base'), act = root.querySelector('.act'), ttl = root.querySelector('.ttl'), sub = root.querySelector('.sub'), cdBar = act.querySelector('u');
    let jx = 0, jy = 0, sx = 9, sy = 9, lastT = 0, cdT = 0;
    const push = (force) => { const now = Date.now(); if (!force && (now - lastT < 33 || (Math.abs(jx - sx) < 0.03 && Math.abs(jy - sy) < 0.03))) return; sx = jx; sy = jy; lastT = now; send({ a: 'joy', x: Math.round(jx * 100) / 100, y: Math.round(jy * 100) / 100 }); };
    const sk = stick(zone, base, 56, (x, y) => {
      jx = x; jy = y; if (four) { const h = Math.abs(x) > Math.abs(y), on = Math.hypot(x, y) > 0.3; base.dataset.dir = !on ? '' : h ? (x > 0 ? 'r' : 'l') : (y > 0 ? 'd' : 'u'); }
      push(false);
    }, () => { jx = jy = 0; base.dataset.dir = ''; push(true); });
    hold(act, () => { send({ a: 'btn', d: 1 }); buzz(15); }, () => send({ a: 'btn', d: 0 }));
    const beat = setInterval(() => { if (jx !== sx || jy !== sy || (sk.active && Date.now() - lastT > 300)) push(true); if (cdT && Date.now() > cdT) { cdT = 0; act.classList.remove('cd'); } }, 50);
    if (d.how) howto(root, 'pad' + d.btn, d.how[0], d.how.slice(1));
    evt = (m) => {
      if (m.e !== 'pad') return;
      if (m.bg) pad.style.setProperty('--team', m.bg); if (m.title !== undefined) ttl.textContent = m.title; if (m.sub !== undefined) sub.textContent = m.sub;
      if (m.cd) { cdT = Date.now() + m.cd * 1000; act.classList.add('cd'); cdBar.style.animation = 'none'; void cdBar.offsetWidth; cdBar.style.animation = `fillup ${m.cd}s linear forwards`; }
      if (m.buzz) buzz(m.buzz); if (m.toast) toast(root, esc(m.toast), m.good ? 'good' : 'bad');
    };
    cleanup = () => clearInterval(beat);
  }

  // ---------- Size Up: resize the red picture until it looks right ----------
  const tintCache = {};
  function tintImg(name, color) {
    const key = name + color; if (tintCache[key]) return tintCache[key];
    const o = { im: null, ar: 1 }; tintCache[key] = o; const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); o.im = c; o.ar = im.width / im.height; };
    im.src = '/assets/sizeup/' + name + '.png'; return o;
  }
  function showSize(d) {
    const BLUE = '#4f95ff', RED = '#ff5a4f', lo = d.lo, hi = d.hi, span = Math.log(hi / lo), ends = Date.now() + d.time * 1000;
    let v = clamp(d.start, lo, hi), locked = false, sentT = 0, sentV = 0, viewS = 0, raf = 0, over = false;
    const root = screen('ctl szc', `<div class="szp"><div class="top"><span class="rd">ROUND ${d.round} / ${d.of}</span><b class="tm"></b></div><h2>${esc(d.q)}</h2>
      <div class="stagew"><canvas></canvas><div class="lg"><i></i>${esc(d.ref.label)}</div><div class="tip">Drag up or down to resize the red one</div></div>
      <button class="read"><b></b><small></small></button>
      <div class="sl"><button class="nud" data-d="-1">−</button><input type="range" min="0" max="1000" step="1"><button class="nud" data-d="1">+</button></div>
      <button class="btn red lock">LOCK IN</button><div class="res" hidden></div></div>`);
    const cv = root.querySelector('canvas'), g = cv.getContext('2d'), rng = root.querySelector('input'), read = root.querySelector('.read'), lockB = root.querySelector('.lock'), tm = root.querySelector('.tm'), tip = root.querySelector('.tip'), res = root.querySelector('.res');
    const ref = tintImg(d.ref.img, BLUE), tgt = tintImg(d.tgt.img, RED);
    const dims = (o, dim, size) => (dim === 'h' ? [size * o.ar, size] : [size, size / o.ar]);
    const sync = (fromSlider) => {
      v = clamp(v, lo, hi); if (!fromSlider) rng.value = Math.round((Math.log(v / lo) / span) * 1000);
      const r = v / d.ref.size; read.querySelector('b').textContent = fmtSize(v) + ' ' + d.word;
      read.querySelector('small').textContent = (r >= 1 ? (r >= 10 ? Math.round(r) : r.toFixed(1)) + '× the blue one' : '1/' + (1 / r >= 10 ? Math.round(1 / r) : (1 / r).toFixed(1)) + ' of the blue one') + ' · tap to type';
    };
    const changed = () => { tip.style.opacity = '0'; sync(false); };
    rng.addEventListener('input', () => { if (locked) return; v = lo * Math.exp((rng.value / 1000) * span); tip.style.opacity = '0'; sync(true); });
    root.querySelectorAll('.nud').forEach((b) => { let iv = 0; const go = () => { if (locked) return; v *= Math.pow(1.02, +b.dataset.d); changed(); }; hold(b, () => { go(); buzz(8); iv = setInterval(go, 90); }, () => clearInterval(iv)); });
    // drag on the picture: up = bigger. Two fingers pinch.
    const pts = new Map(); let startV = v, startY = 0, startD = 0;
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (locked) return; try { cv.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, [e.clientX, e.clientY]); startV = v; startY = e.clientY; if (pts.size === 2) { const [a, b] = [...pts.values()]; startD = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; } });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || locked) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size >= 2) { const [a, b] = [...pts.values()]; v = startV * (Math.hypot(a[0] - b[0], a[1] - b[1]) / startD); } else v = startV * Math.exp((startY - e.clientY) * 0.008);
      changed();
    });
    const pup = (e) => { pts.delete(e.pointerId); startV = v; const p = [...pts.values()][0]; if (p) startY = p[1]; };
    cv.addEventListener('pointerup', pup); cv.addEventListener('pointercancel', pup);
    // typing an exact number
    read.onclick = () => {
      if (locked) return; let unit = v >= 1000 ? 1000 : v >= 1 ? 1 : 0.01;
      const m = el(`<div class="modal"><h2>Type your guess</h2><input type="number" inputmode="decimal" step="any" value="${+(v / unit).toPrecision(3)}"><div class="units">${[[0.01, 'cm'], [1, 'm'], [1000, 'km']].map(([u, n]) => `<button class="tb ${u === unit ? 'on' : ''}" data-u="${u}">${n}</button>`).join('')}</div><button class="btn" id="ok">SET</button><button class="btn ghost" id="no">Cancel</button></div>`);
      m.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { unit = +b.dataset.u; m.querySelectorAll('[data-u]').forEach((x) => x.classList.toggle('on', x === b)); }));
      m.querySelector('#no').onclick = () => m.remove();
      m.querySelector('#ok').onclick = () => { const n = parseFloat(m.querySelector('input').value); if (n > 0) { v = n * unit; changed(); } m.remove(); };
      root.appendChild(m); setTimeout(() => { try { m.querySelector('input').select(); } catch {} }, 60);
    };
    const setLocked = (on) => { locked = on; root.querySelector('.szp').classList.toggle('locked', on); lockB.textContent = on ? 'LOCKED IN ✔' : 'LOCK IN'; rng.disabled = on; };
    lockB.onclick = () => { if (locked || over) return; setLocked(true); send({ a: 'lock', v }); buzz(30); };
    evt = (m) => {
      if (m.e !== 'sz') return;
      if (m.st === 'second') {
        const md = el('<div class="modal"><h2>Second chance</h2><p>That guess is a long way off. You get one redo per game.</p><button class="btn red" id="ag">CHANGE MY GUESS</button><button class="btn ghost" id="kp">Keep it</button></div>');
        md.querySelector('#ag').onclick = () => { send({ a: 'again' }); setLocked(false); md.remove(); }; md.querySelector('#kp').onclick = () => { send({ a: 'keep' }); md.remove(); };
        root.appendChild(md); buzz([40, 40, 40]);
      }
      if (m.st === 'reveal') {
        over = true; setLocked(true); root.querySelectorAll('.modal').forEach((x) => x.remove()); res.hidden = false;
        res.innerHTML = `<b class="${m.pts === 100 ? 'bull' : ''}">+${m.pts}</b><span>${m.pts === 100 ? 'Bullseye! ' : ''}It is about ${esc(m.truth)}.${m.mine ? ' You said ' + esc(m.mine) + '.' : ' You did not guess.'}</span>`; buzz(m.pts >= 80 ? [40, 40, 120] : 60);
      }
    };
    function frame() {
      raf = requestAnimationFrame(frame);
      const now = Date.now(), left = Math.max(0, Math.ceil((ends - now) / 1000)); if (!over) { tm.textContent = left; tm.classList.toggle('low', left <= 5); }
      if (!locked && Math.abs(v - sentV) > 1e-9 && now - sentT > 200) { sentT = now; sentV = v; send({ a: 'sz', v }); }
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2); if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const [rw, rh] = dims(ref, d.ref.dim, d.ref.size), [tw, th] = dims(tgt, d.tgt.dim, v), gap = (rw + tw) * 0.1, ground = h * 0.9;
      const want = Math.min((w * 0.92) / (rw + tw + gap), (h * 0.72) / Math.max(rh, th)); viewS = viewS ? viewS + (want - viewS) * 0.22 : want; // the view zooms out as your guess grows
      const s = viewS, x0 = (w - (rw + tw + gap) * s) / 2;
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, ground); g.lineTo(w - 8, ground); g.stroke();
      if (ref.im) g.drawImage(ref.im, x0, ground - rh * s, rw * s, rh * s);
      if (tgt.im) g.drawImage(tgt.im, x0 + (rw + gap) * s, ground - th * s, tw * s, th * s);
    }
    sync(false); raf = requestAnimationFrame(frame);
    howto(root, 'size', 'How to play Size Up', [['🟦', 'The blue picture is at its true size'], ['🟥', 'Resize the red one: drag it, use the slider, or type a number'], ['🔒', 'Lock in. The closest guess scores the most']]);
    cleanup = () => cancelAnimationFrame(raf);
  }

  // ---------- Punchline ----------
  function showWrite(d) {
    let i = 0; const ends = Date.now() + d.time * 1000;
    const step = () => {
      if (i >= d.prompts.length) { clearInterval(tk); return showWait({ title: 'Answers in!', text: 'Waiting for the others…' }); }
      const p = d.prompts[i], root = screen('', `<div class="plw"><div class="top"><label>${esc(d.label || 'Prompt')} ${d.prompts.length > 1 ? `${i + 1} of ${d.prompts.length}` : ''}</label><b class="tm"></b></div><h2>${esc(p.text)}</h2>
        <textarea maxlength="90" rows="3" placeholder="${esc(d.hint || 'Type something funny…')}" autocomplete="off"></textarea><div class="cnt">0 / 90</div><div class="grow"></div>
        <button class="btn red" id="snd">SEND</button>${d.safe ? '<button class="btn ghost sm" id="sf">🎲 I have nothing. Write one for me (half points)</button>' : ''}</div>`);
      const ta = root.querySelector('textarea'), go = () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } send({ a: 'ans', id: p.id, text: t }); i++; step(); };
      ta.addEventListener('input', () => { root.querySelector('.cnt').textContent = ta.value.length + ' / 90'; });
      root.querySelector('#snd').onclick = go; const sf = root.querySelector('#sf'); if (sf) sf.onclick = () => { send({ a: 'ans', id: p.id, safe: 1 }); i++; step(); };
      setTimeout(() => { try { ta.focus(); } catch {} }, 60);
    };
    const tk = setInterval(() => { const el = app.querySelector('.plw .tm'); if (el) el.textContent = Math.max(0, Math.ceil((ends - Date.now()) / 1000)); }, 250);
    step(); cleanup = () => clearInterval(tk);
  }
  function showVote(d) {
    const root = screen('', `<div class="plw"><label>${esc(d.label || 'Vote for the funniest')}</label><h2>${esc(d.prompt)}</h2><div class="stack" style="margin-top:14px">${d.opts.map((o) => `<button class="btn ghost vote" data-k="${o.k}">${esc(o.text)}</button>`).join('')}</div></div>`);
    root.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { send({ a: 'vote', k: +b.dataset.k }); buzz(20); showReact({ title: 'Voted!', text: 'Throw a reaction at the big screen.' }); }));
  }
  // reaction buttons: the emoji float up the big screen
  function showReact(d) {
    const EM = ['😂', '💀', '🔥', '👏', '🥱', '🍅'];
    const root = screen('', `<div class="rx"><h2>${esc(d.title || 'Look up!')}</h2><p>${esc(d.text || 'Throw a reaction at the big screen.')}</p><div class="rxg">${EM.map((e, i) => `<button data-k="${i}">${e}</button>`).join('')}</div></div>`);
    let last = 0; root.querySelectorAll('[data-k]').forEach((b) => hold(b, () => { const now = Date.now(); if (now - last < 250) return; last = now; send({ a: 'react', k: +b.dataset.k }); buzz(10); }));
  }

  // ---------- boot ----------
  showJoin('');
  if (code && name && qs.get('auto')) { connect(); }
})();
