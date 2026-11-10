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
  function screen(cls, html) { if (cleanup) { try { cleanup(); } catch {} cleanup = null; } document.body.className = cls || ''; app.innerHTML = html; return app; }
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
    ({ lobby: showLobby, wait: showWait, pick: showPick, race: showRace, done: showDone, sk_choose: showChoose, sk_draw: showDraw, turf: showTurf, pad: showPad, pl_write: showWrite, pl_vote: showVote }[d.m] || showWait)(d);
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

  // ---------- lobby / wait / done ----------
  function scoreList(s) { return s && s.length ? `<ul class="scores">${s.map((x) => `<li><i style="background:${x.color}"></i>${esc(x.name)}<b>${x.score}</b></li>`).join('')}</ul>` : ''; }
  function showLobby(d) {
    screen('', `<div class="me"><i></i>${esc(d.name)}</div>
      <h2 style="margin:16px 0 6px">${d.vip ? 'Pick a game' : 'Lobby'}</h2>
      ${d.vip ? `<p>You joined first, so you are the host.</p><div class="stack" style="margin-top:14px">${d.games.map((g) => `<button class="btn g-${esc(g.c || '')}" data-k="${g.k}">${esc(g.name)}<small>${esc(g.desc)}</small></button>`).join('')}</div>`
        : '<p>Waiting for the host to pick a game.</p>'}
      <div class="grow"></div><label>Scores</label>${scoreList(d.scores)}`);
    app.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => send({ a: 'menu', game: b.dataset.k })));
  }
  function showWait(d) { screen('', `<div class="center"><h2>${esc(d.title || '')}</h2><p>${esc(d.text || '')}</p></div>`); }
  function showDone(d) {
    screen('', `<div class="center"><h2>${esc(d.title || 'Done')}</h2><p>${esc(d.text || '')}</p></div>${d.vip ? '<button class="btn" id="bk">BACK TO LOBBY</button>' : '<p style="text-align:center;opacity:.6">Waiting for the host…</p>'}`);
    const b = app.querySelector('#bk'); if (b) b.onclick = () => send({ a: 'back' });
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
  function showRace(d) {
    let useTilt = store.get('cc_tilt') !== '0', flip = store.get('cc_flip') === '1', gas = false, brake = false, L = false, R = false, ready = false, lastSent = '', lastT = 0;
    const root = screen('race', `<div class="rc"><div class="left"></div>
        <div class="mid"><div class="tilt"><i></i></div><button class="pw"><span>${esc(d.power)}<small>CHARGING</small></span></button><button class="it"><span><b>ITEM</b><small>HIT A ? BOX</small></span></button>
        <div class="opts"><button id="mt"></button><button id="fl">Flip</button></div></div><div class="right"></div></div>
      <div class="rotate"><div><div class="ph">📱</div><h2>Turn your phone sideways</h2><p style="margin-top:10px">Hold it like a steering wheel.</p></div></div>`);
    const left = root.querySelector('.left'), right = root.querySelector('.right'), pw = root.querySelector('.pw'), dot = root.querySelector('.tilt i'), mt = root.querySelector('#mt');
    function build() {
      mt.textContent = useTilt ? 'Use buttons' : 'Use tilt'; root.querySelector('#fl').style.display = useTilt ? '' : 'none';
      left.className = 'left' + (useTilt ? '' : ' btns'); right.className = 'right' + (useTilt ? '' : ' btns');
      left.innerHTML = useTilt ? '<button class="pad brake">BRAKE</button>' : '<button class="pad brake" id="sl">◀</button><button class="pad brake" id="sr">▶</button>';
      right.innerHTML = useTilt ? '<button class="pad gas">GAS</button>' : '<button class="pad brake" id="bk">BRAKE</button><button class="pad gas">GAS</button>';
      gas = brake = L = R = false;
      hold(right.querySelector('.gas'), () => { gas = true; }, () => { gas = false; });
      if (useTilt) hold(left.querySelector('.brake'), () => { brake = true; }, () => { brake = false; });
      else { hold(left.querySelector('#sl'), () => { L = true; }, () => { L = false; }); hold(left.querySelector('#sr'), () => { R = true; }, () => { R = false; }); hold(right.querySelector('#bk'), () => { brake = true; }, () => { brake = false; }); }
    }
    build();
    mt.onclick = () => { useTilt = !useTilt; store.set('cc_tilt', useTilt ? '1' : '0'); if (useTilt) askMotion(); build(); };
    root.querySelector('#fl').onclick = () => { flip = !flip; store.set('cc_flip', flip ? '1' : '0'); };
    hold(pw, () => { if (ready) { send({ a: 'pw' }); buzz(40); } });
    const it = root.querySelector('.it'); let hasItem = false;
    hold(it, () => { if (hasItem) { send({ a: 'it' }); buzz(40); } });
    const setReady = (r) => { ready = r; pw.classList.toggle('ready', r); pw.querySelector('small').textContent = r ? 'TAP TO USE' : 'CHARGING'; if (r) buzz(25); };
    evt = (m) => {
      if (m.e === 'pw') setReady(!!m.ready); if (m.e === 'hit') buzz([60, 40, 120]);
      if (m.e === 'item') { hasItem = !!m.k; it.classList.toggle('ready', hasItem); it.querySelector('b').textContent = hasItem ? m.icon + ' ' + m.name : 'ITEM'; it.querySelector('small').textContent = hasItem ? 'TAP TO USE' : 'HIT A ? BOX'; if (hasItem) buzz(25); }
    };
    // iOS: tilt needs an explicit permission tap
    if (useTilt && !motionAsked && window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      const g = el('<div class="gate"><div><h2 style="color:#ffc62b">Tilt steering</h2><p style="margin:12px 0 18px">Tap once so your phone can share its tilt.</p><button class="btn">ENABLE TILT</button></div></div>');
      g.querySelector('button').onclick = () => { askMotion(); g.remove(); }; root.appendChild(g);
    } else askMotion();
    let steerS = 0;
    const iv = setInterval(() => {
      let s;
      if (useTilt) { let t = clamp(rawTilt / 26, -1, 1) * (flip ? -1 : 1); if (Math.abs(t) < 0.07) t = 0; steerS += (t - steerS) * 0.55; s = steerS; }
      else s = (R ? 1 : 0) - (L ? 1 : 0);
      dot.style.left = 50 + s * 44 + '%';
      const msg = { a: 'in', s: Math.round(s * 100) / 100, g: gas ? 1 : 0, b: brake ? 1 : 0 }, key = msg.s + '|' + msg.g + '|' + msg.b, now = Date.now();
      if (key !== lastSent || now - lastT > 400) { send(msg); lastSent = key; lastT = now; }
    }, 40);
    // if no tilt data shows up, fall back to buttons so nobody is stuck
    const fb = setTimeout(() => { if (useTilt && !tiltSeen && motionAsked) { useTilt = false; build(); } }, 3500);
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

  // ---------- turf ----------
  function showTurf(d) {
    const root = screen('turf', `<div class="tfc"><div class="hint">Your land</div><div class="pct">0%</div><div class="stick"><i></i><b></b></div><div class="hint st">Drag anywhere, any direction</div></div>`);
    const pad = root.querySelector('.tfc'), knob = root.querySelector('.stick i'), arrow = root.querySelector('.stick b'), pct = root.querySelector('.pct'), st = root.querySelector('.st');
    let ox = 0, oy = 0, active = null, lastAng = 99, lastT = 0;
    arrow.textContent = '▲'; arrow.style.opacity = '0';
    const move = (e) => {
      const dx = e.clientX - ox, dy = e.clientY - oy, m = Math.hypot(dx, dy), k = m > 60 ? 60 / m : 1;
      knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      if (m > 60) { ox += dx - dx * k; oy += dy - dy * k; } // origin follows the thumb so turning back is quick
      if (m < 14) return;
      const ang = Math.atan2(dy, dx), now = Date.now(); let df = ang - lastAng; df = Math.abs(Math.atan2(Math.sin(df), Math.cos(df)));
      arrow.style.opacity = '1'; arrow.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
      if ((df > 0.04 && now - lastT > 33) || now - lastT > 250) { lastAng = ang; lastT = now; send({ a: 'ang', r: Math.round(ang * 100) / 100 }); }
    };
    const beat = setInterval(() => { if (active !== null && lastAng !== 99 && Date.now() - lastT > 250) { lastT = Date.now(); send({ a: 'ang', r: Math.round(lastAng * 100) / 100 }); } }, 120);
    cleanup = () => clearInterval(beat);
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); if (active !== null) return; active = e.pointerId; ox = e.clientX; oy = e.clientY; try { pad.setPointerCapture(e.pointerId); } catch {} });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === active) move(e); });
    const up = (e) => { if (e.pointerId === active) { active = null; knob.style.transform = ''; } };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    evt = (m) => {
      if (m.e !== 'tf') return;
      if (m.pct != null) pct.textContent = m.pct + '%';
      if (m.st === 'ko') { buzz([80, 50, 160]); st.textContent = 'Knocked out! New patch, keep going'; setTimeout(() => { st.textContent = 'Drag anywhere, any direction'; }, 2500); }
      if (m.st === 'out') { buzz(400); st.textContent = 'No empty land left. You are out'; pct.textContent = 'OUT'; }
      if (m.st === 'cap') buzz(20);
    };
  }

  // ---------- joystick + one button (Car Football, Blast Zone) ----------
  function showPad(d) {
    const root = screen('padm', `<div class="pad2"><div class="joy"><div class="ttl">${esc(d.title || '')}</div><div class="stick"><i></i></div><div class="sub">${esc(d.sub || '')}</div></div><button class="act"><span>${esc(d.btn || 'GO')}</span></button></div>`);
    const pad = root.querySelector('.pad2'), joy = root.querySelector('.joy'), knob = root.querySelector('.stick i'), act = root.querySelector('.act'), ttl = root.querySelector('.ttl'), sub = root.querySelector('.sub');
    let ox = 0, oy = 0, active = null, jx = 0, jy = 0, sx = 9, sy = 9, lastT = 0, cdT = 0;
    const push = (force) => { const now = Date.now(); if (!force && (now - lastT < 33 || (Math.abs(jx - sx) < 0.03 && Math.abs(jy - sy) < 0.03))) return; sx = jx; sy = jy; lastT = now; send({ a: 'joy', x: Math.round(jx * 100) / 100, y: Math.round(jy * 100) / 100 }); };
    joy.addEventListener('pointerdown', (e) => { e.preventDefault(); if (active !== null) return; active = e.pointerId; ox = e.clientX; oy = e.clientY; try { joy.setPointerCapture(e.pointerId); } catch {} });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return; let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy), R = 56;
      if (m > R) { ox += dx - dx * R / m; oy += dy - dy * R / m; dx *= R / m; dy *= R / m; } // the centre follows the thumb, so reversing is instant
      knob.style.transform = `translate(${dx}px,${dy}px)`; jx = dx / R; jy = dy / R; push(false);
    });
    const up = (e) => { if (e.pointerId !== active) return; active = null; knob.style.transform = ''; jx = jy = 0; push(true); };
    joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
    hold(act, () => { send({ a: 'btn', d: 1 }); buzz(15); }, () => send({ a: 'btn', d: 0 }));
    const beat = setInterval(() => { if (jx !== sx || jy !== sy || (active !== null && Date.now() - lastT > 300)) push(true); if (cdT && Date.now() > cdT) { cdT = 0; act.classList.remove('cd'); } }, 50);
    evt = (m) => {
      if (m.e !== 'pad') return;
      if (m.bg) pad.style.background = m.bg; if (m.title !== undefined) ttl.textContent = m.title; if (m.sub !== undefined) sub.textContent = m.sub;
      if (m.cd) { cdT = Date.now() + m.cd * 1000; act.classList.add('cd'); } if (m.buzz) buzz(m.buzz);
    };
    cleanup = () => clearInterval(beat);
  }

  // ---------- Punchline ----------
  function showWrite(d) {
    let i = 0; const ends = Date.now() + d.time * 1000;
    const step = () => {
      if (i >= d.prompts.length) { clearInterval(tk); return showWait({ title: 'Answers in!', text: 'Waiting for the others…' }); }
      const p = d.prompts[i], root = screen('', `<div class="plw"><div class="top"><label>Prompt ${i + 1} of ${d.prompts.length}</label><b class="tm"></b></div><h2>${esc(p.text)}</h2>
        <textarea maxlength="90" rows="3" placeholder="Type something funny…" autocomplete="off"></textarea><div class="cnt">0 / 90</div><div class="grow"></div><button class="btn red">SEND</button></div>`);
      const ta = root.querySelector('textarea'), go = () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } send({ a: 'ans', id: p.id, text: t }); i++; step(); };
      ta.addEventListener('input', () => { root.querySelector('.cnt').textContent = ta.value.length + ' / 90'; });
      root.querySelector('.btn').onclick = go; setTimeout(() => { try { ta.focus(); } catch {} }, 60);
    };
    const tk = setInterval(() => { const el = app.querySelector('.plw .tm'); if (el) el.textContent = Math.max(0, Math.ceil((ends - Date.now()) / 1000)); }, 250);
    step(); cleanup = () => clearInterval(tk);
  }
  function showVote(d) {
    const root = screen('', `<div class="plw"><label>Vote for the funniest</label><h2>${esc(d.prompt)}</h2><div class="stack" style="margin-top:14px">${d.opts.map((o) => `<button class="btn ghost vote" data-k="${o.k}">${esc(o.text)}</button>`).join('')}</div></div>`);
    root.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { send({ a: 'vote', k: +b.dataset.k }); buzz(20); showWait({ title: 'Voted!', text: 'Look at the big screen.' }); }));
  }

  // ---------- boot ----------
  showJoin('');
  if (code && name && qs.get('auto')) { connect(); }
})();
