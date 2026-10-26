// アミノ酸表記ドリル（単語ノートの「アミノ酸」タブ）
// 成績と設定は app.js から受け取り、変化があれば app.js に知らせて Firestore に保存してもらう

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GROUPS = {
  np: { label: '非極性（脂肪族）', color: 'var(--g-np)' },
  ar: { label: '芳香族', color: 'var(--g-ar)' },
  po: { label: '極性・電荷なし', color: 'var(--g-po)' },
  pos: { label: '塩基性（＋）', color: 'var(--g-pos)' },
  neg: { label: '酸性（−）', color: 'var(--g-neg)' }
};
// 1文字, 3文字, 日本語名, 英語名, グループ, 別名（入力で正解にする表記）
const AA = [
  ['G', 'Gly', 'グリシン', 'Glycine', 'np', []],
  ['A', 'Ala', 'アラニン', 'Alanine', 'np', []],
  ['V', 'Val', 'バリン', 'Valine', 'np', []],
  ['L', 'Leu', 'ロイシン', 'Leucine', 'np', []],
  ['I', 'Ile', 'イソロイシン', 'Isoleucine', 'np', []],
  ['M', 'Met', 'メチオニン', 'Methionine', 'np', []],
  ['P', 'Pro', 'プロリン', 'Proline', 'np', []],
  ['F', 'Phe', 'フェニルアラニン', 'Phenylalanine', 'ar', []],
  ['Y', 'Tyr', 'チロシン', 'Tyrosine', 'ar', []],
  ['W', 'Trp', 'トリプトファン', 'Tryptophan', 'ar', []],
  ['S', 'Ser', 'セリン', 'Serine', 'po', []],
  ['T', 'Thr', 'トレオニン', 'Threonine', 'po', ['スレオニン']],
  ['C', 'Cys', 'システイン', 'Cysteine', 'po', []],
  ['N', 'Asn', 'アスパラギン', 'Asparagine', 'po', []],
  ['Q', 'Gln', 'グルタミン', 'Glutamine', 'po', []],
  ['K', 'Lys', 'リシン', 'Lysine', 'pos', ['リジン']],
  ['R', 'Arg', 'アルギニン', 'Arginine', 'pos', []],
  ['H', 'His', 'ヒスチジン', 'Histidine', 'pos', []],
  ['D', 'Asp', 'アスパラギン酸', 'Aspartic acid', 'neg', ['Aspartate']],
  ['E', 'Glu', 'グルタミン酸', 'Glutamic acid', 'neg', ['Glutamate']]
].map(([one, three, ja, en, g, alias]) => ({ one, three, ja, en, g, alias }));

const TYPES = [
  { id: '1n', from: 'one', to: 'name', label: '1文字 → 名前' },
  { id: 'n1', from: 'name', to: 'one', label: '名前 → 1文字' },
  { id: '3n', from: 'three', to: 'name', label: '3文字 → 名前' },
  { id: 'n3', from: 'name', to: 'three', label: '名前 → 3文字' },
  { id: '13', from: 'one', to: 'three', label: '1文字 → 3文字' },
  { id: '31', from: 'three', to: 'one', label: '3文字 → 1文字' }
];
export const DEFAULT_SETTINGS = { types: ['1n', 'n1', '3n'], mode: 'choice', weak: true };
const ASK = { one: '1文字表記は？', three: '3文字表記は？', name: '名前は？' };
const FROMLBL = { one: '1文字表記', three: '3文字表記', name: '名前' };

export function createAmino(root, { onAnswer, onSettings, onReset }) {
  root.innerHTML = `
  <div class="aq">
    <div class="aq-top">
      <h2>アミノ酸表記ドリル</h2>
      <div class="aq-score" aria-live="polite"><span>正解 <b data-r="ok">0</b>/<b data-r="all">0</b></span><span>連続 <b data-r="streak">0</b></span></div>
    </div>
    <details class="aq-settings">
      <summary>出題の設定</summary>
      <div class="aq-set-body">
        <div><div class="aq-set-label">出題する形式（複数選べます）</div>
          <div class="aq-chips" data-r="types">${TYPES.map(t => `<label class="aq-chip"><input type="checkbox" value="${t.id}"><span>${t.label}</span></label>`).join('')}</div>
          <div class="aq-warn" data-r="typeWarn" hidden>形式を1つ以上選んでください。</div></div>
        <div><div class="aq-set-label">答え方</div>
          <div class="aq-chips" data-r="mode">
            <label class="aq-chip"><input type="radio" name="aq-mode" value="choice"><span>4択</span></label>
            <label class="aq-chip"><input type="radio" name="aq-mode" value="type"><span>入力</span></label>
          </div></div>
        <div><div class="aq-set-label">出し方</div>
          <div class="aq-chips"><label class="aq-chip"><input type="checkbox" data-r="weak"><span>間違えたものを多めに出す</span></label></div></div>
      </div>
    </details>
    <section class="aq-card">
      <div class="aq-qhead"><span class="aq-qtype" data-r="qtype"></span><span data-r="qno"></span></div>
      <div class="aq-prompt" data-r="prompt"></div>
      <div class="aq-ask" data-r="ask"></div>
      <div class="aq-choices" data-r="choices"></div>
      <form class="aq-typein" data-r="typein" hidden>
        <input data-r="answer" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn primary" type="submit">答える</button>
        <button class="btn aq-giveup" type="button" data-r="giveUp">分からない</button>
      </form>
      <div class="aq-feedback" data-r="feedback" hidden></div>
      <div class="aq-next" data-r="nextRow" hidden><span data-r="keyHint">Enterでも次へ</span><button class="btn primary" type="button" data-r="next">次の問題</button></div>
    </section>
    <section>
      <div class="aq-grid-head"><h3>20種類の正答率</h3>
        <div class="aq-legend">${Object.values(GROUPS).map(g => `<span style="color:${g.color}">■ ${g.label}</span>`).join('')}</div></div>
      <div class="aq-grid" data-r="grid"></div>
    </section>
    <div class="aq-foot"><span>成績はPCとiPhoneで同期されます。</span><button class="linkbtn" type="button" data-r="reset">成績をリセット</button></div>
  </div>`;
  const R = n => root.querySelector(`[data-r="${n}"]`);

  let stats = {}, settings = { ...DEFAULT_SETTINGS };
  let q = null, answered = false, session = { ok: 0, all: 0, streak: 0 }, lastOne = null, started = false;
  const st = one => stats[one] || (stats[one] = { ok: 0, ng: 0 });

  function syncSettingsUI() {
    root.querySelectorAll('[data-r="types"] input').forEach(i => { i.checked = settings.types.includes(i.value); });
    root.querySelectorAll('[data-r="mode"] input').forEach(i => { i.checked = i.value === settings.mode; });
    R('weak').checked = settings.weak !== false;
  }
  R('types').addEventListener('change', () => {
    const sel = [...root.querySelectorAll('[data-r="types"] input:checked')].map(i => i.value);
    R('typeWarn').hidden = sel.length > 0;
    if (!sel.length) return;
    settings.types = sel; onSettings({ ...settings }); newQuestion();
  });
  R('mode').addEventListener('change', e => { settings.mode = e.target.value; onSettings({ ...settings }); newQuestion(); });
  R('weak').addEventListener('change', e => { settings.weak = e.target.checked; onSettings({ ...settings }); });

  function pickAA() {
    const pool = AA.filter(a => a.one !== lastOne);
    const w = pool.map(a => { if (settings.weak === false) return 1; const s = st(a.one); return 1 + Math.max(0, s.ng * 2 - s.ok) * 0.8 + (s.ok + s.ng === 0 ? 0.5 : 0); });
    let r = Math.random() * w.reduce((x, y) => x + y, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // 紛らわしい選択肢になるよう、同じグループから優先して混ぜる
  function distractors(aa) {
    const same = shuffle(AA.filter(a => a !== aa && a.g === aa.g));
    const other = shuffle(AA.filter(a => a !== aa && a.g !== aa.g));
    return same.slice(0, Math.min(same.length, 1 + Math.floor(Math.random() * 2))).concat(other).slice(0, 3);
  }
  const view = (aa, kind) => kind === 'one' ? { main: aa.one, mono: true } : kind === 'three' ? { main: aa.three, mono: true } : { main: aa.ja, en: aa.en, mono: false };

  function newQuestion() {
    const types = TYPES.filter(t => settings.types.includes(t.id));
    if (!types.length) { R('typeWarn').hidden = false; return; }
    const type = types[Math.floor(Math.random() * types.length)];
    const aa = pickAA(); lastOne = aa.one;
    q = { aa, type }; answered = false;
    R('qtype').textContent = type.label;
    R('qno').textContent = `第${session.all + 1}問`;
    const p = view(aa, type.from);
    R('prompt').innerHTML = `<div class="aq-big${p.mono ? '' : ' name'}">${esc(p.main)}</div>`;
    R('ask').textContent = `この${FROMLBL[type.from]}のアミノ酸の、${ASK[type.to]}`;
    R('feedback').hidden = true; R('nextRow').hidden = true;
    if (settings.mode === 'type') {
      R('choices').hidden = true; R('typein').hidden = false;
      const inp = R('answer'); inp.value = ''; inp.disabled = false;
      inp.className = type.to === 'name' ? '' : 'mono';
      inp.placeholder = type.to === 'one' ? '例：M' : type.to === 'three' ? '例：Met' : '例：メチオニン（英語名も可）';
      if (!root.hidden) inp.focus({ preventScroll: true });
    } else {
      R('typein').hidden = true; R('choices').hidden = false;
      const opts = shuffle([aa, ...distractors(aa)]);
      R('choices').innerHTML = opts.map((o, i) => {
        const v = view(o, type.to);
        return `<button type="button" class="aq-choice" data-one="${o.one}"><span class="k">${i + 1}</span><span class="main${v.mono ? ' mono' : ''}">${esc(v.main)}</span>${v.en ? `<span class="en">${esc(v.en)}</span>` : ''}</button>`;
      }).join('');
    }
  }

  const toKata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const norm = s => toKata(s.normalize('NFKC')).toLowerCase().replace(/[\s・\-]/g, '');
  function judgeTyped(input) {
    const a = q.aa, t = q.type.to, v = input.normalize('NFKC').trim();
    if (t === 'one') return v.toUpperCase() === a.one;
    if (t === 'three') return v.toLowerCase() === a.three.toLowerCase();
    const n = norm(v);
    return [a.ja, a.en, ...a.alias].some(x => norm(x) === n);
  }
  function finish(correct, gaveUp = false) {
    answered = true;
    const s = st(q.aa.one); correct ? s.ok++ : s.ng++;
    onAnswer(q.aa.one, correct);
    session.all++; if (correct) { session.ok++; session.streak++; } else session.streak = 0;
    const a = q.aa, g = GROUPS[a.g], fb = R('feedback');
    fb.className = 'aq-feedback ' + (correct ? 'right' : 'wrong');
    fb.innerHTML = `<div class="aq-verdict">${correct ? '正解' : gaveUp ? '答えはこれです（間違えた問題として記録しました）' : '不正解'}</div>
      <div class="aq-trio"><span class="one">${a.one}</span><span class="three">${a.three}</span><span class="ja">${a.ja}</span><span class="en2">${a.en}</span></div>
      <div><span class="aq-gtag" style="color:${g.color}">${g.label}</span>${a.alias.filter(x => /[ァ-ン]/.test(x)).map(x => ` <span class="en2">別名 ${esc(x)}</span>`).join('')}</div>`;
    fb.hidden = false; R('nextRow').hidden = false;
    R('keyHint').hidden = matchMedia('(hover: none)').matches;
    renderScore(); renderGrid();
    R('next').focus({ preventScroll: true });
  }
  R('choices').addEventListener('click', e => {
    const b = e.target.closest('.aq-choice'); if (!b || answered) return;
    const correct = b.dataset.one === q.aa.one;
    root.querySelectorAll('.aq-choice').forEach(c => { c.disabled = true; if (c.dataset.one === q.aa.one) c.classList.add('right'); });
    if (!correct) b.classList.add('wrong');
    finish(correct);
  });
  R('typein').addEventListener('submit', e => {
    e.preventDefault(); if (answered) { newQuestion(); return; }
    const v = R('answer').value; if (!v.trim()) return;
    R('answer').disabled = true; finish(judgeTyped(v));
  });
  R('giveUp').addEventListener('click', () => { if (answered) return; R('answer').disabled = true; finish(false, true); });
  R('next').addEventListener('click', newQuestion);
  document.addEventListener('keydown', e => {
    if (root.hidden || !q) return;
    if (e.target.tagName === 'INPUT' && !answered) return;
    if (answered && e.key === 'Enter' && e.target !== R('next')) { e.preventDefault(); newQuestion(); return; }
    if (!answered && settings.mode === 'choice' && /^[1-4]$/.test(e.key)) root.querySelectorAll('.aq-choice')[+e.key - 1]?.click();
  });

  function renderScore() { R('ok').textContent = session.ok; R('all').textContent = session.all; R('streak').textContent = session.streak; }
  function renderGrid() {
    R('grid').innerHTML = AA.map(a => {
      const s = st(a.one), n = s.ok + s.ng, r = n ? s.ok / n : null;
      const cls = n >= 2 && r < 0.6 ? ' weak' : n >= 3 && r >= 0.9 ? ' strong' : '';
      return `<div class="aq-tile${cls}" style="--gc:${GROUPS[a.g].color}" title="${a.ja}"><span class="l">${a.one}</span><span class="t3">${a.three}</span><span class="acc">${n ? Math.round(r * 100) + '%' : '—'}</span></div>`;
    }).join('');
  }
  let armed = false, armTimer;
  R('reset').addEventListener('click', () => {
    const b = R('reset');
    if (!armed) { armed = true; b.textContent = 'もう一度押すとリセット'; b.classList.add('armed'); armTimer = setTimeout(() => { armed = false; b.textContent = '成績をリセット'; b.classList.remove('armed'); }, 4000); return; }
    clearTimeout(armTimer); armed = false; b.textContent = '成績をリセット'; b.classList.remove('armed');
    stats = {}; session = { ok: 0, all: 0, streak: 0 }; onReset({ ...settings });
    renderScore(); renderGrid(); newQuestion();
  });

  syncSettingsUI(); renderScore(); renderGrid();

  return {
    // Firestoreから届いた成績と設定を反映する（PCとiPhoneの同期）
    setData(data) {
      stats = JSON.parse(JSON.stringify(data?.stats || {}));
      const before = JSON.stringify(settings);
      settings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) };
      syncSettingsUI(); renderGrid();
      if (started && before !== JSON.stringify(settings) && !answered) newQuestion();
    },
    show() { if (!started) { started = true; newQuestion(); } else if (settings.mode === 'type' && !answered) R('answer').focus({ preventScroll: true }); }
  };
}
