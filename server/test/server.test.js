const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createApp } = require('../index');
const dbm = require('../db');

function start(env, deps) {
  const app = createApp(env, Object.assign({ db: dbm.open(':memory:') }, deps));
  const srv = http.createServer(app.handle);
  return new Promise((resolve) => srv.listen(0, () => resolve({ srv, base: 'http://localhost:' + srv.address().port, app })));
}
const post = (base, p, body, token) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) });
const MSG = { leadId: 'lea-1', template: 'T2', templateId: 'TPL_T2', to: '010-1234-5678', variables: { '#{학생}': '한○○' }, text: '본문' };

test('테스트 모드: 실제 발송 없이 기록만 남기고 status=test', async () => {
  const { srv, base, app } = await start({});
  const h = await (await fetch(base + '/api/health')).json();
  assert.deepStrictEqual(h, { ok: true, dryRun: true });
  const r = await post(base, '/api/messages/send', MSG);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).status, 'test');
  const logs = app.db.byLead('lea-1');
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].to_phone, '01012345678');
  srv.close();
});

test('번호 형식 오류·필수값 누락은 400', async () => {
  const { srv, base } = await start({});
  assert.strictEqual((await post(base, '/api/messages/send', Object.assign({}, MSG, { to: '02-123' }))).status, 400);
  assert.strictEqual((await post(base, '/api/messages/send', { to: '01012345678' })).status, 400);
  srv.close();
});

test('G4: 같은 리드·템플릿 5분 안 재발송은 409', async () => {
  const { srv, base } = await start({});
  assert.strictEqual((await post(base, '/api/messages/send', MSG)).status, 200);
  assert.strictEqual((await post(base, '/api/messages/send', MSG)).status, 409);
  assert.strictEqual((await post(base, '/api/messages/send', Object.assign({}, MSG, { template: 'T2-2' }))).status, 200);
  srv.close();
});

test('토큰을 정하면 토큰 없는 요청은 401', async () => {
  const { srv, base } = await start({ API_TOKEN: 'secret' });
  assert.strictEqual((await post(base, '/api/messages/send', MSG)).status, 401);
  assert.strictEqual((await post(base, '/api/messages/send', MSG, 'secret')).status, 200);
  srv.close();
});

test('실제 발송 모드: 공급사 결과 기록 + 웹훅으로 대체 문자 반영', async () => {
  const sent = [];
  const provider = {
    sendAlimtalk: async (m) => { sent.push(m); return { status: 'accepted', providerMessageId: 'M1', providerGroupId: 'G1' }; },
    parseReport: (it) => ({ messageId: it.messageId, status: it.type === 'LMS' ? 'fallback' : 'delivered', channel: it.type === 'LMS' ? 'lms' : 'alimtalk' }),
  };
  const env = { DRY_RUN: '0', SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_PFID: 'pf', SENDER_PHONE: '0212345678', API_TOKEN: 't', WEBHOOK_KEY: 'wk' };
  const { srv, base, app } = await start(env, { provider });
  const r = await (await post(base, '/api/messages/send', MSG, 't')).json();
  assert.strictEqual(r.status, 'accepted');
  assert.strictEqual(sent[0].templateId, 'TPL_T2');
  assert.strictEqual((await post(base, '/api/solapi/webhook?key=bad', [])).status, 403);
  const w = await (await post(base, '/api/solapi/webhook?key=wk', [{ messageId: 'M1', type: 'LMS', statusCode: '4000' }])).json();
  assert.strictEqual(w.updated, 1);
  const log = app.db.byLead('lea-1')[0];
  assert.strictEqual(log.status, 'fallback');
  assert.strictEqual(log.channel, 'lms');
  srv.close();
});

test('실제 발송 모드인데 키가 없으면 시작하지 않는다', () => {
  assert.throws(() => createApp({ DRY_RUN: '0' }, { db: dbm.open(':memory:') }), /환경변수/);
});

test('정적 파일: 앱 index.html 제공, 앱 폴더 밖 경로는 차단', async () => {
  const { srv, base } = await start({});
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Academy OS/);
  const bad = await fetch(base + '/..%2Fserver%2F.env');
  assert.notStrictEqual(bad.status, 200);
  srv.close();
});
