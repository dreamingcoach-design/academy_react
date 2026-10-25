/* 알림톡 발송 서버 연결 (CH-01, SOLAPI 경유).
 * SOLAPI API 키는 서버에만 두고, 화면은 우리 발송 서버의 /api 만 부른다 (서버: server/).
 * 서버 주소·접속 토큰은 기기별 설정이라 localStorage 에 둔다 (설정 › 규칙·훅·채널). */
const KEY = 'academy-os:sender';

function conf() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function setConf(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* 저장소 사용 불가 */ } }
const base = () => (conf().url || '').trim().replace(/\/+$/, '');

function call(path, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 10000);
  const headers = { 'Content-Type': 'application/json' };
  if (conf().token) headers.Authorization = 'Bearer ' + conf().token;
  return fetch(base() + path, Object.assign({ headers: headers, signal: ctl.signal }, opts))
    .then((r) => r.json().catch(() => ({})).then((body) => {
      if (!r.ok) throw new Error(body.error || '발송 서버 오류 (' + r.status + ')');
      return body;
    }))
    .finally(() => clearTimeout(timer));
}

// 서버 연결 확인 → { ok, dryRun } 또는 { ok: false, reason }
function health() {
  if (!base()) return Promise.resolve({ ok: false, reason: '발송 서버 주소가 설정되지 않았습니다 (설정 › 규칙·훅·채널)' });
  return call('/api/health', { method: 'GET' }, 4000)
    .then((b) => ({ ok: true, dryRun: !!b.dryRun }), () => ({ ok: false, reason: '발송 서버에 연결되지 않았습니다' }));
}

// 알림톡 발송 요청 → { logId, status: 'accepted' | 'test' | 'failed', reason }
// payload: { leadId, template, templateId, to, variables: { '#{변수}': 값 }, text(대체 문자용 전체 문구) }
function send(payload) { return call('/api/messages/send', { method: 'POST', body: JSON.stringify(payload) }); }

export const sender = { conf, setConf, health, send };
