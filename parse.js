// 読み取った文字を「日付」「見出し（グループ）」「単語」「補足」「メモ」に分ける
// ルール
//  ・1〜3行目にある「10/17」のような書き方を日付にする
//  ・①⑪などの丸数字で始まる行は見出し。下に続く単語のグループ名になる（空行で終わり）
//  ・○ ・ 。 などで始まる行は単語（空行がなくても1行で1単語）
//  ・印のない行は、すぐ上に単語があればその補足、空行のあとならメモ

const pad = n => String(n).padStart(2, '0');
const CIRCLED = /^\s*(?:[①-⑳㉑-㉟㊱-㊿]|[(（]\d{1,2}[)）])\s*/;
const BULLET_A = /^\s*[○◯〇。・•·●◦･＊*\-‐－]\s*/;

// 「○」が o / O / 0 と読み間違えられた場合
function bulletB(t) {
  const m = t.match(/^\s*([oO0゜°])(.)/);
  if (!m) return null;
  const nx = m[2];
  if (/\s/.test(nx)) return t.replace(/^\s*[oO0゜°]\s*/, '');
  if (m[1] !== '0' && (/[^\x00-\x7F]/.test(nx) || /[A-Z「(（]/.test(nx))) return t.replace(/^\s*[oO゜°]/, '');
  return null;
}

function joinSmart(a, b) {
  if (!a) return b;
  const end = a.slice(-1), st = b.slice(0, 1);
  return a + (/[\x00-\x7F]/.test(end) && /[\x00-\x7F]/.test(st) ? ' ' : '') + b;
}

// 年は書いていないので、今年とする。1か月以上先の日付になる場合だけ前年にする（12月の紙を1月に取り込んだときなど）
export function guessYear(m, d, now = new Date()) {
  let y = now.getFullYear();
  if (new Date(y, m - 1, d) - now > 31 * 864e5) y -= 1;
  return y;
}

export function parse(text, now = new Date()) {
  const lines = text.replace(/\r/g, '').split('\n');
  let date = null, seen = 0;
  for (let i = 0; i < lines.length && seen < 3; i++) {
    if (!lines[i].trim()) continue;
    seen++;
    const m = lines[i].match(/(\d{1,2})\s*[\/／]\s*(\d{1,2})/);
    if (m) {
      const mo = +m[1], d = +m[2];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        date = `${guessYear(mo, d, now)}-${pad(mo)}-${pad(d)}`;
        lines[i] = lines[i].replace(m[0], '').replace(/[(（][日月火水木金土][)）]/, '').trim();
        break;
      }
    }
  }
  const items = [];
  let group = null, cur = null, prevBlank = true, groupCount = 0;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { if (group && groupCount > 0) { group = null; groupCount = 0; } prevBlank = true; continue; }
    if (CIRCLED.test(t)) { group = t.replace(CIRCLED, '').trim(); groupCount = 0; cur = null; prevBlank = false; continue; }
    const rest = BULLET_A.test(t) ? t.replace(BULLET_A, '') : bulletB(t);
    if (rest !== null && rest.trim()) {
      cur = { type: 'word', text: rest.trim(), note: '', group: group || '' };
      items.push(cur);
      if (group) groupCount++;
    } else if (!prevBlank && cur) {
      if (cur.type === 'memo') cur.text = joinSmart(cur.text, t);
      else cur.note = cur.note ? cur.note + '\n' + t : t;
    } else {
      cur = { type: 'memo', text: t, note: '', group: '' };
      items.push(cur);
    }
    prevBlank = false;
  }
  return { date, items };
}
