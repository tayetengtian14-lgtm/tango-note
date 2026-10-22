import { firebaseConfig } from './firebase-config.js';
import { parse } from './parse.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, updateDoc, deleteDoc, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['日', '月', '火', '水', '木', '金', '土'];

let tt;
function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2000); }
function showView(v) { for (const id of ['auth', 'setup', 'app']) $('#view-' + id).hidden = id !== v; }

// ショートカットから「#import=…」付きで開かれたときの文字を先に取っておく
let pendingImport = null;
if (location.hash.startsWith('#import=')) {
  try { pendingImport = decodeURIComponent(location.hash.slice(8)); } catch { pendingImport = null; }
  history.replaceState(null, '', location.pathname + location.search);
}

if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('ここに')) {
  showView('setup');
  throw new Error('firebase-config.js が未設定です');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// オフラインでも使えるように端末内にも保存し、つながったら自動で送る
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

let user = null, items = [], unsub = null;
const col = () => collection(db, 'users', user.uid, 'items');
const ref = id => doc(db, 'users', user.uid, 'items', id);
const fail = e => { console.error(e); toast('保存できませんでした。もう一度試してください'); };

/* ---------- ログイン ---------- */
const AUTH_ERR = {
  'auth/invalid-email': 'メールアドレスの形が正しくありません。',
  'auth/missing-password': 'パスワードを入れてください。',
  'auth/weak-password': 'パスワードは6文字以上にしてください。',
  'auth/email-already-in-use': 'このメールアドレスは登録済みです。「ログイン」を押してください。',
  'auth/invalid-credential': 'メールアドレスかパスワードが違います。',
  'auth/wrong-password': 'メールアドレスかパスワードが違います。',
  'auth/user-not-found': 'このメールアドレスは登録されていません。はじめての場合は「登録」を押してください。',
  'auth/too-many-requests': '試行回数が多すぎます。少し時間をおいてください。',
  'auth/network-request-failed': 'ネットにつながっていません。ログインにはネット接続が必要です。'
};
function authError(e) { const el = $('#authError'); el.textContent = AUTH_ERR[e.code] || `ログインできませんでした（${e.code || e.message}）`; el.hidden = false; }
const creds = () => [$('#email').value.trim(), $('#password').value];
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#authError').hidden = true;
  try { await signInWithEmailAndPassword(auth, ...creds()); } catch (err) { authError(err); }
});
$('#signupBtn').addEventListener('click', async () => {
  $('#authError').hidden = true;
  try { await createUserWithEmailAndPassword(auth, ...creds()); toast('登録しました'); } catch (err) { authError(err); }
});
$('#resetBtn').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  if (!email) { authError({ code: 'auth/invalid-email' }); return; }
  try { await sendPasswordResetEmail(auth, email); toast('再設定用のメールを送りました'); } catch (err) { authError(err); }
});
$('#logoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, u => {
  if (unsub) { unsub(); unsub = null; }
  user = u; items = [];
  if (!u) { showView('auth'); return; }
  showView('app');
  unsub = onSnapshot(col(), { includeMetadataChanges: true }, snap => {
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pending = snap.metadata.hasPendingWrites || (snap.metadata.fromCache && !navigator.onLine);
    const s = $('#sync');
    s.dataset.state = pending ? 'pending' : 'ok';
    s.textContent = pending ? (navigator.onLine ? '送信中' : 'オフライン（あとで同期）') : '同期済み';
    if (!$('#view-list').hidden) renderList(); else renderStat();
  }, err => { console.error(err); toast('データを読み込めませんでした（' + err.code + '）'); });
  if (pendingImport) { $('#ocr').value = pendingImport; pendingImport = null; showTab('import'); runParse(); }
  else showTab('list');
});

/* ---------- 一覧 ---------- */
let editingId = null, armedDelete = null, jumpDate = null;
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}<small>${y}年・${WD[new Date(y, m - 1, d).getDay()]}曜</small>`;
}
function hl(s, q) {
  const e = esc(s); if (!q) return e;
  const qe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return e.replace(new RegExp(qe, 'gi'), m => `<mark>${m}</mark>`);
}
function renderStat() {
  const total = items.length, done = items.filter(i => i.done).length;
  $('#stat').textContent = total ? `チェック済み ${done} / ${total}` : '';
}
// 「● 単語　○ メモ」のように1回押すだけで切り替わるボタン
function kindToggle(name, type, inDraft = false) {
  const f = inDraft ? ' data-f="type"' : '';
  return `<div class="kindtoggle" role="radiogroup" aria-label="種類">
    <label><input type="radio" name="${name}" value="word"${f}${type === 'word' ? ' checked' : ''}><span>単語</span></label>
    <label><input type="radio" name="${name}" value="memo"${f}${type === 'memo' ? ' checked' : ''}><span>メモ</span></label>
  </div>`;
}
function itemHTML(it, q, inGroup) {
  const cls = `item${inGroup ? ' in-group' : ''}`;
  if (editingId === it.id) {
    return `<li class="${cls}" data-id="${it.id}">
      <div class="editor">
        <label class="field"><span>${it.type === 'memo' ? 'メモ' : '単語'}</span><input class="inp" id="e-text" value="${esc(it.text)}"></label>
        <label class="field"><span>補足</span><textarea class="inp" id="e-note" rows="2">${esc(it.note)}</textarea></label>
        <div class="row2">
          <label class="field"><span>日付</span><input class="inp" type="date" id="e-date" value="${it.date}"></label>
          <label class="field"><span>グループ</span><input class="inp" id="e-group" value="${esc(it.group)}" placeholder="なし"></label>
          <div class="field"><span>種類</span>${kindToggle('e-type', it.type)}</div>
        </div>
        <div class="actions">
          <button class="btn danger${armedDelete === it.id ? ' armed' : ''}" data-act="del">${armedDelete === it.id ? 'もう一度押すと削除' : '削除'}</button>
          <span class="spacer"></span>
          <button class="btn" data-act="cancel">キャンセル</button>
          <button class="btn primary" data-act="save">保存</button>
        </div>
      </div></li>`;
  }
  return `<li class="${cls}${it.done ? ' done' : ''}" data-id="${it.id}">
    <input type="checkbox" class="chk" data-act="toggle" ${it.done ? 'checked' : ''} aria-label="${esc(it.text)}をチェック">
    <div class="body">
      <div class="text">${it.type === 'memo' ? '<span class="memo-chip">メモ</span>' : ''}${hl(it.text, q)}</div>
      ${it.note ? `<div class="note">${hl(it.note, q)}</div>` : ''}
    </div>
    <button class="edit-btn" data-act="edit">編集</button>
  </li>`;
}
function renderList() {
  renderStat();
  // 編集中の入力を消さないように、編集中は再描画を待つ
  if (editingId && document.activeElement && document.activeElement.closest('.editor')) return;
  const q = $('#q').value.trim(), ql = q.toLowerCase(), only = $('#onlyOpen').checked;
  const vis = items
    .filter(i => (!only || !i.done || i.id === editingId) && (!ql || `${i.text} ${i.note} ${i.group}`.toLowerCase().includes(ql)))
    .sort((a, b) => (a.created || 0) - (b.created || 0));
  const byDate = {};
  vis.forEach(i => (byDate[i.date] = byDate[i.date] || []).push(i));
  const dates = Object.keys(byDate).sort().reverse();
  if (!dates.length) {
    $('#view-list').innerHTML = `<div class="empty">${items.length ? '条件に合う単語はありません。' : 'まだ単語がありません。「取り込み」タブからメモを取り込んでください。'}</div>`;
    return;
  }
  $('#view-list').innerHTML = dates.map(d => {
    const all = items.filter(i => i.date === d), dn = all.filter(i => i.done).length;
    let html = '', lastGroup = null, open = false;
    for (const it of byDate[d]) {
      if (it.group !== lastGroup) {
        if (open) html += '</ul>';
        html += (it.group ? `<div class="group">${hl(it.group, q)}</div>` : '') + '<ul>';
        open = true; lastGroup = it.group;
      }
      html += itemHTML(it, q, !!it.group);
    }
    if (open) html += '</ul>';
    return `<section class="day" id="d-${d}">
      <div class="dayhead"><div class="date">${fmtDate(d)}</div>
      <div class="progress">${dn}/${all.length}<span class="bar"><i style="width:${all.length ? dn / all.length * 100 : 0}%"></i></span></div></div>
      ${html}</section>`;
  }).join('');
  if (jumpDate) { document.getElementById('d-' + jumpDate)?.scrollIntoView({ block: 'start' }); jumpDate = null; }
}
$('#view-list').addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  const id = e.target.closest('[data-id]').dataset.id;
  if (act === 'toggle') { updateDoc(ref(id), { done: e.target.checked }).catch(fail); return; }
  if (act === 'edit') { editingId = id; armedDelete = null; renderList(); $('#e-text')?.focus(); return; }
  if (act === 'cancel') { editingId = null; armedDelete = null; renderList(); return; }
  if (act === 'save') {
    const it = items.find(i => i.id === id);
    const patch = {
      text: $('#e-text').value.trim() || it.text, note: $('#e-note').value.trim(),
      date: $('#e-date').value || it.date, group: $('#e-group').value.trim(), type: document.querySelector('input[name="e-type"]:checked')?.value || it.type
    };
    editingId = null; document.activeElement?.blur();
    updateDoc(ref(id), patch).catch(fail); renderList(); toast('保存しました'); return;
  }
  if (act === 'del') {
    if (armedDelete !== id) { armedDelete = id; renderList(); return; }
    editingId = null; armedDelete = null; document.activeElement?.blur();
    deleteDoc(ref(id)).catch(fail); renderList(); toast('削除しました');
  }
});
$('#q').addEventListener('input', renderList);
$('#onlyOpen').addEventListener('change', renderList);

/* ---------- 取り込み ---------- */
let draft = [];
function renderDraft() {
  $('#plist').innerHTML = draft.map((it, i) => `
    <div class="prev-item" data-i="${i}">
      <div class="fields">
        ${kindToggle('k-' + i, it.type, true)}
        <input class="inp" data-f="text" value="${esc(it.text)}" aria-label="単語">
        <input class="inp" data-f="note" value="${esc(it.note)}" placeholder="補足（なし）" aria-label="補足">
        <input class="inp" data-f="group" value="${esc(it.group)}" placeholder="グループ（なし）" aria-label="グループ">
      </div>
      <button class="x" data-rm="${i}" aria-label="この行を消す">×</button>
    </div>`).join('') || '<p class="hint">単語が見つかりませんでした。「＋ 行を追加」で入力できます。</p>';
}
$('#plist').addEventListener('input', e => {
  const f = e.target.dataset.f; if (!f) return;
  draft[+e.target.closest('[data-i]').dataset.i][f] = e.target.value;
});
$('#plist').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]'); if (!rm) return;
  draft.splice(+rm.dataset.rm, 1); renderDraft();
});
function runParse() {
  const txt = $('#ocr').value;
  if (!txt.trim()) { toast('先に文字を貼り付けてください'); return; }
  const r = parse(txt);
  draft = r.items;
  $('#pdate').value = r.date || ''; $('#dateflag').hidden = !!r.date;
  $('#preview').hidden = false; renderDraft();
  $('#preview').scrollIntoView({ block: 'start' });
}
$('#parse').addEventListener('click', runParse);
$('#addRow').addEventListener('click', () => { draft.push({ type: 'word', text: '', note: '', group: '' }); renderDraft(); });
$('#cancelImport').addEventListener('click', () => { draft = []; $('#preview').hidden = true; });
$('#commit').addEventListener('click', () => {
  const d = $('#pdate').value;
  if (!d) { $('#dateflag').hidden = false; toast('日付を選んでください'); return; }
  const add = draft.filter(i => i.text.trim());
  if (!add.length) { toast('保存する単語がありません'); return; }
  const batch = writeBatch(db), base = Date.now();
  add.forEach((i, n) => {
    batch.set(doc(col()), { date: d, type: i.type, text: i.text.trim(), note: i.note.trim(), group: i.group.trim(), done: false, created: base + n });
  });
  batch.commit().catch(fail); // オフラインでも端末に保存され、つながったら送られる
  draft = []; $('#ocr').value = ''; $('#preview').hidden = true;
  jumpDate = d; showTab('list'); toast(`${add.length}件を保存しました`);
});

/* ---------- タブ ---------- */
function showTab(t) {
  $('#tab-list').setAttribute('aria-selected', t === 'list');
  $('#tab-import').setAttribute('aria-selected', t === 'import');
  $('#view-list').hidden = t !== 'list'; $('#tools').hidden = t !== 'list'; $('#view-import').hidden = t !== 'import';
  if (t === 'list') renderList(); else renderStat();
}
$('#tab-list').addEventListener('click', () => showTab('list'));
$('#tab-import').addEventListener('click', () => showTab('import'));
window.addEventListener('online', () => renderStat());
