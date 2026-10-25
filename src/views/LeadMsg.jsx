/* 상담·등록 단계별 학부모 연락 (카카오 알림톡): 문의 보드 카드 버튼 → 칸 채우기 + 말풍선 미리보기 → 알림톡 발송
 * 문구 초안·근거: core/04-templates/lead-messages.md. 알림톡은 카카오 승인 문구 그대로만 나가므로 고정 문장은 고칠 수 없고 {변수} 칸만 채운다.
 * 문구를 바꿔 보내야 할 때는 [복사]·[카톡으로 보내기]로 개인 카톡이나 채널 1:1 채팅에서 직접 보내고 "보낸 것으로 기록"을 남긴다. */
import { useEffect, useState } from 'react';
import { D, store } from '../lib/store.js';
import { useStore } from '../lib/hooks.js';
import { visits as V } from '../lib/visits.js';
import { sender } from '../lib/sender.js';
import { Badge, Field, Modal, Select, copyText, openModal, toast } from '../ui.jsx';

// 학원 고정 정보. 비워 둔 값은 미리보기에 {항목}으로 남아 직접 채워야 발송 기록을 남길 수 있다.
const CONFIG = {
  academy: 'SNP 영어학원',
  address: '위례송파로 77 우성어반타워 7층 702호', // 매뉴얼(이전 학원명 기준) 값 — 확인 필요
  testFee: 25000, testMinutes: { 초: 30, 중: 40, 고: 40 }, // 고등은 중등과 같게 둠 — 확인 필요
  tuition: { 초: '23만원', 중: '36만원', 고: '44만원' }, // 월 수강료
  account: '제일은행 581-20-426463 (예금주 김근례)',        // 입금계좌 (은행·계좌번호·예금주)
  consultTime: '약 30분', // 레벨테스트 후 결과 상담 소요 시간
  appGuide: "앱스토어에서 '학원친구' 검색 → 다운로드 → 회원가입", // 학원친구 앱 가입 방법
};

const PROMO = '프로모션 무료';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const won = (n) => n.toLocaleString('ko-KR') + '원';
const dateObj = (v) => new Date(v.slice(0, 10) + 'T00:00:00');
const mdw = (d) => (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')';
const shift = (v, days) => { const d = dateObj(v); d.setDate(d.getDate() + days); return d; };
function clock(v) {
  if (!v || v.length <= 10) return '';
  const hh = +v.slice(11, 13), mm = +v.slice(14, 16);
  return (hh < 12 ? '오전 ' : '오후 ') + (hh % 12 || 12) + '시' + (mm ? ' ' + mm + '분' : '');
}
const dt = (v) => (v ? mdw(dateObj(v)) + (v.length > 10 ? ' ' + clock(v) : '') : '');

const FEE_LINE = '레벨테스트 비용은 ' + won(CONFIG.testFee) + '이며, 2주 이내 정규반 등록 시 교육비에서 공제됩니다.';
const OPTIONAL = ['공제안내', '영역별결과줄']; // 비어 있어도 보낼 수 있는 변수 (빈 줄은 정리)
const FIXED = ['학원명', '학원주소', '주차', '입금계좌', '앱가입안내', '상담시간']; // 학원 고정값: 승인 템플릿에 문구로 들어가므로 칸으로 보여 주지 않는다
const MULTI = ['레벨테스트비용', '결과요약', '진단코멘트', '학습방향', '교재목록']; // 여러 줄 입력칸
const AREAS_ORDER = ['단어', '독해', '문법', '영작', '듣기'];

// 변수 값: 비어 있으면 창에서 직접 채운다 (프로모션 무료 학생의 비용 문구도 비워 둔다)
function vars(l) {
  const promo = l.testPay === PROMO;
  const grp = (l.grade || '')[0];
  const sc = AREAS_ORDER.filter((a) => l.scores && l.scores[a] && l.scores[a].correct != null)
    .map((a) => a + ' ' + l.scores[a].correct + '/' + l.scores[a].total);
  // 일시는 방문 일정(lib/visits.js)에서: 테스트 = 레벨테스트가 든 방문, 상담일 = 마지막으로 끝난 상담, 상담일시 = 다음 상담 방문
  const testAt = V.testAt(l), nc = V.nextConsult(l), nx = V.next(l);
  return {
    학생: l.student, 학년: l.grade, 학교: l.school,
    학원명: CONFIG.academy, 학원주소: CONFIG.address, 주차: '당일 1시간 무료주차권 발행',
    테스트일시: dt(testAt), 테스트시간: String(CONFIG.testMinutes[grp] || ''),
    상담일: dt(V.consultAt(l)), 상담시간: CONFIG.consultTime, 상담일시: nc ? dt(nc.at) : '',
    다음방문: nx ? nx.round + '차 방문: ' + dt(nx.at) : '편하신 요일과 시간대를 알려 주시면 일정을 잡아 드리겠습니다.',
    비용: promo ? '' : won(CONFIG.testFee),
    입금기한: testAt ? mdw(shift(testAt, -1)) + ' 오후 5시' : '',
    입금계좌: CONFIG.account,
    레벨테스트비용: promo ? '' : FEE_LINE,
    공제안내: l.testPay === '입금' && testAt ? '레벨테스트 비용은 ' + mdw(shift(testAt, 14)) + '까지 정규반 등록 시 교육비에서 공제됩니다.' : '',
    영역별결과: sc.join(' · '),
    수강료: CONFIG.tuition[grp] || '',
    첫수업일시: '', 앱가입안내: CONFIG.appGuide,
  };
}

const T = {
  T1: { stage: '신규 문의', label: '접수 안내', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '{학생} 학생 영어 학습 문의 남겨 주셔서 감사합니다.', '',
    '현재 학습 상황과 어려운 점을 정확히 파악해 드리기 위해 레벨테스트와 상담을 함께 진행하고 있습니다.', '',
    '▶ 레벨테스트 안내',
    '- 소요 시간: 약 {테스트시간}분 (이후 결과 상담 {상담시간})',
    '- 장소: {학원주소}',
    '- 주차: {주차}',
    '- {레벨테스트비용}', '',
    '편하신 요일과 시간대를 알려 주시면 가능한 일정으로 안내드리겠습니다.',
    '감사합니다. 좋은 하루 보내세요 :)'] },
  T2: { stage: '방문 예약', label: '예약 확인·입금 안내', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '레벨테스트 예약 안내드립니다.', '',
    '1. 날짜/시간: {테스트일시} (시험 {테스트시간}분 진행)',
    '2. 장소: {학원주소}',
    '3. 주차: {주차}',
    '4. 비용: {비용} 선입금 부탁드립니다.',
    '- 기한: {입금기한}',
    '- 기한 이후에는 예약하신 시간은 취소된다는 점 양해바랍니다.',
    '- 예약 시간에 참석하지 않을 경우 비용은 환불되지 않습니다.',
    '- 2주 이내 정규반 등록 시 레테비용은 교육비에서 공제됩니다.',
    '5. 레벨테스트 비용은 현금이체만 가능하며 현금영수증 처리가 되지 않는다는 점 양해바랍니다.',
    '이체 시 {입금계좌}로 부탁드리며 꼭 자녀분의 이름으로 이체부탁드립니다.', '',
    '감사합니다! 좋은 하루 보내세요 :)'] },
  'T2-1': { stage: '방문 예약', label: '입금 확인', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '레벨테스트 비용 입금 확인되었습니다. 감사합니다.', '',
    '{테스트일시}에 {학생} 학생을 기다리겠습니다.',
    '시험 시작 10분 전까지 도착해 주시면 좋습니다.'] },
  'T2-2': { stage: '방문 예약', label: '전날 리마인드', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '내일 {테스트일시}에 {학생} 학생의 레벨테스트가 예정되어 있어 안내드립니다.', '',
    '- 장소: {학원주소}',
    '- 주차: {주차} (주차 후 데스크에 말씀해 주세요)',
    '- 준비물: 필기도구',
    '- 테스트 후에는 결과를 학생과 함께 보며 상담해 드립니다. (소요 {상담시간})', '',
    '일정 변경이 필요하시면 오늘 중으로 연락 부탁드립니다.'] },
  // 상담만 방문(②·③) 예약 안내 — 2026-10-25 문구 확정
  'T2-3': { stage: '방문 예약', label: '상담 예약 확인', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '상담 예약 안내드립니다.', '',
    '1. 날짜/시간: {상담일시} (상담 {상담시간})',
    '2. 장소: {학원주소}',
    '3. 주차: {주차}', '',
    '상담 전에 궁금하신 점이나 미리 알려 주실 내용이 있으면 편하게 말씀해 주세요.',
    '감사합니다! 좋은 하루 보내세요 :)'] },
  'T2-4': { stage: '방문 예약', label: '상담 전날 리마인드', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '내일 {상담일시}에 상담이 예정되어 있어 안내드립니다.', '',
    '- 장소: {학원주소}',
    '- 주차: {주차} (주차 후 데스크에 말씀해 주세요)',
    '- 소요 시간: {상담시간}', '',
    '일정 변경이 필요하시면 오늘 중으로 연락 부탁드립니다.'] },
  // 1차를 학부모만 상담했을 때 (레벨테스트 전) — 2026-10-25 문구 확정. {다음방문}은 2차 일정 또는 일정 요청 문장
  'T3-0': { stage: '상담 완료', label: '1차 상담 감사·2차 방문 안내', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '오늘 상담에 시간 내어 방문해 주셔서 감사합니다.', '',
    '말씀해 주신 {학생} 학생의 학습 고민을 바탕으로, 학생과 함께 방문하실 때 레벨테스트로 현재 실력을 확인하고 맞춤 학습 방향을 안내드리겠습니다.', '',
    '▶ 다음 방문 안내',
    '- 레벨테스트 약 {테스트시간}분 + 결과 상담 {상담시간}',
    '- {다음방문}', '',
    '궁금하신 점은 언제든 편하게 문의해 주세요. 감사합니다.'] },
  T3: { stage: '상담 완료', label: '상담 감사·진단 요약', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '오늘 {학생} 학생과 함께 방문해 주셔서 감사합니다.', '',
    '오늘 상담 내용을 간단히 정리해 드립니다.', '',
    '▶ 레벨테스트 결과',
    '{결과요약}',
    '{영역별결과줄}', '',
    '▶ 진단',
    '{진단코멘트}', '',
    '▶ 제안드린 학습 방향',
    '{학습방향}', '',
    '궁금하신 점은 언제든 편하게 문의해 주세요.',
    '{학생} 학생과 함께할 수 있기를 기대합니다. 감사합니다.'] },
  'T3-1': { stage: '상담 완료', label: '후속 안내 (미등록 시)', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '{상담일} 상담 이후 {학생} 학생과 이야기 나눠 보셨는지 안부 여쭙니다.', '',
    '고민되시는 부분이 있으시면 편하게 말씀해 주세요. 일정이나 반 구성은 등록 후에도 조정이 가능합니다.',
    '{공제안내}', '',
    '감사합니다.'] },
  T4: { stage: '등록', label: '등록 완료·수업 안내', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '{학생} 학생의 등록을 환영합니다. 정규반 안내드립니다.', '',
    '1) {반명} ({수업요일시간}, 월 수강료 {수강료}, 교재비 별도)', // 변수 이름에 특수문자(·)를 쓰지 않는다 (알림톡 변수)
    '- 첫수업일: {첫수업일시}', '',
    '2) 교재비 총합: {교재비합계}원 ({할인율}% 할인됨, 정가: {교재비정가}원)',
    '- 교재목록: {교재목록}', '',
    '3) 교재는 환불이 불가합니다. 교재비는 현금이체만 가능하며 현금영수증 처리가 되지 않는다는 점 양해바랍니다.',
    '이체 시 {입금계좌}로 부탁드리며 꼭 자녀분의 이름으로 이체부탁드립니다.', '',
    '4) 보강관련',
    '▶무단 결석 시 보강 불가',
    '- 개인 사정으로 인한 무단 결석 시 보강은 진행되지 않습니다.',
    '- 당일 또는 하루 전 통보는 무단 결석으로 간주됩니다.',
    '예외',
    '- 국가 지정 감염병 / 사고 발생 / 가족상 발생',
    '→ 해당 경우 증빙 서류 제출 필수 (※ 병원 처방 약봉투 제출 가능)',
    '▶보강 가능 기준',
    '- 병원 진료가 필요한 불가피한 상황에 한해 보강 가능합니다.',
    '- 특히 격리 치료가 필요한 감염병의 경우 보강 가능합니다.',
    '- 반드시 사전 연락(문자 또는 전화)이 있어야 합니다.',
    '- 병원 환자용 확인서 제출 필수',
    '▶보강 진행 방식',
    '보강은 담당 선생님과 별도 일정 조율 후 진행됩니다.', '',
    '감사합니다. 좋은 하루 보내세요 :)'] },
  'T4-1': { stage: '등록', label: '첫 수업 리마인드', text: [
    '{학생} 학부모님, 안녕하세요. {학원명}입니다.',
    '내일 {첫수업일시}에 {학생} 학생의 첫 수업이 있습니다.', '',
    '- 준비물: 교재, 필기도구 (교재는 학생이 직접 가지고 다닙니다)',
    '- 수업 전 미리 와서 공부할 자리가 필요하면 코칭실을 이용할 수 있습니다.',
    '- 숙제와 공지는 학원친구 앱으로 안내드립니다.',
    '▶ 학원친구 앱 가입 방법',
    '{앱가입안내}', '',
    '처음에는 어색할 수 있으니 편안하게 오도록 격려 부탁드립니다. 감사합니다.'] },
};

// 템플릿 목록 (단계별 순서). 방문 일정에 맞지 않는 안내는 이유를 붙여 다음 차례에서 뺀다
function forStage(stage) { return Object.keys(T).filter((id) => T[id].stage === stage); }
function notReady(l, id) {
  const tv = V.testVisit(l), nc = V.nextConsult(l), lc = V.lastConsult(l);
  const testPlanned = !!(tv && tv.status === '예정');
  switch (id) {
    case 'T2': case 'T2-2': return testPlanned ? '' : '레벨테스트 방문 예정 없음';
    case 'T2-1': return !tv ? '레벨테스트 방문 없음' : l.testPay === '입금' ? '' : '입금 확인 후';
    case 'T2-3': case 'T2-4': return nc && !V.isTest(nc) ? '' : '상담만 방문 예정 없음';           // 상담만(②·③) 방문 예약 안내
    // 학부모만 상담하고 아직 레벨테스트 전이면 T3-0, 그 밖의 상담 완료는 T3
    case 'T3': return !lc ? '상담 기록 없음' : parentOnly(lc, tv) ? '학부모만 상담 — 1차 상담 감사 안내 사용' : '';
    case 'T3-0': return lc && parentOnly(lc, tv) ? '' : '1차 학부모 상담 후에만';
    default: return '';
  }
}
const parentOnly = (lc, tv) => lc.type === 'consult-parent' && !(tv && tv.status === '완료');
const applicable = (l, id) => !notReady(l, id);
function nextId(l) {
  const ids = forStage(l.stage).filter((id) => applicable(l, id));
  if (!ids.length) return null;
  const sent = l.msgSent || {}, st = l.msgStatus || {};
  return ids.find((id) => !sent[id] || st[id] === 'failed') || null; // 실패한 안내는 다시 보낼 차례로 본다
}

// 단계 안에서 가장 최근 발송: { id, at, status } (status 없음 = 알림톡 연동 전 수동 기록)
function lastSent(l) {
  const sent = l.msgSent || {};
  const ids = Object.keys(sent).filter((id) => T[id] && T[id].stage === l.stage).sort((a, b) => (sent[a] < sent[b] ? 1 : -1));
  return ids.length ? { id: ids[0], at: sent[ids[0]], status: (l.msgStatus || {})[ids[0]] || 'manual' } : null;
}

// 발송 결과 표시 (카드 배지·발송 이력 공용)
const RESULT = {
  accepted: ['✓ 발송됨', 'ok'], test: ['테스트 발송 (실제 미발송)', 'gray'], fallback: ['↪ 문자로 대체됨', 'warn'],
  failed: ['⚠ 실패', 'bad'], manual: ['✓ 직접 보냄', 'gray'],
};
const resultBadge = (status) => { const r = RESULT[status] || RESULT.manual; return <Badge tone={r[1]}>{r[0]}</Badge>; };

// 템플릿 승인 정보 (설정 › 규칙·훅·채널에서 입력): { status: 미신청|심사중|승인|반려, templateId }
const TPL_STATUS = ['미신청', '심사중', '승인', '반려'];
const STATUS_TONE = { 미신청: 'gray', 심사중: 'warn', 승인: 'ok', 반려: 'bad' };
const tplInfo = (id) => store.get('msgTemplates', id) || { id: id, status: '미신청', templateId: '' };

// 문구에 나오는 변수 (나온 순서). 입력칸 = 학원 고정값을 뺀 나머지
function keysOf(id) {
  const out = [];
  T[id].text.join('\n').replace(/\{([^{}]+)\}/g, (m, k) => { if (out.indexOf(k) < 0) out.push(k); return m; });
  return out;
}
const inputKeys = (id) => keysOf(id).filter((k) => FIXED.indexOf(k) < 0);

function values(l, id) {
  const v = vars(l);
  v.영역별결과줄 = v.영역별결과 ? '(영역별 맞은 개수: ' + v.영역별결과 + ')' : '';
  const out = {};
  keysOf(id).forEach((k) => { out[k] = v[k] == null ? '' : String(v[k]); });
  return out;
}

// 줄 단위로 조립: segs = [{ t, k?, miss? }]. 빈 필수 칸은 {이름}으로 남기고, 빈 선택 칸 때문에 생긴 연속 빈 줄은 정리
function lines(id, vals) {
  const out = [];
  T[id].text.forEach((ln) => {
    const segs = [];
    let last = 0;
    ln.replace(/\{([^{}]+)\}/g, (m, k, i) => {
      if (i > last) segs.push({ t: ln.slice(last, i) });
      const v = String(vals[k] || '').trim();
      segs.push(v ? { k: k, t: v } : { k: k, t: OPTIONAL.indexOf(k) >= 0 ? '' : m, miss: OPTIONAL.indexOf(k) < 0 });
      last = i + m.length;
      return m;
    });
    if (last < ln.length) segs.push({ t: ln.slice(last) });
    const text = segs.map((s) => s.t).join('');
    if (text === '' && (!out.length || out[out.length - 1].text === '')) return;
    out.push({ segs: segs, text: text });
  });
  while (out.length && out[out.length - 1].text === '') out.pop();
  return out;
}
const textOf = (id, vals) => lines(id, vals).map((x) => x.text).join('\n');
function render(l, id) { return textOf(id, values(l, id)); }

// 카카오 심사 신청용 문안: 학원 고정값은 문구로 채우고 나머지는 SOLAPI 변수 문법 #{이름}으로 (화면과 같은 원본 T에서 만든다)
function approvalText(id) {
  const fixed = vars({});
  return T[id].text.join('\n').replace(/\{([^{}]+)\}/g, (m, k) => (FIXED.indexOf(k) >= 0 ? fixed[k] : '#' + m));
}

// 발송 기록: 카드 표시용(msgSent·msgStatus) + 채널 독립 MessageLog (CORE-DATA-11)
function record(leadId, id, status, channel, logId) {
  const l = store.get('leads', leadId);
  const at = D.today() + ' ' + new Date().toTimeString().slice(0, 5);
  store.upsert('leads', { id: l.id, msgSent: Object.assign({}, l.msgSent, { [id]: at }), msgStatus: Object.assign({}, l.msgStatus, { [id]: status }) });
  store.upsert('messageLogs', { lead_id: l.id, to: l.parentPhone || '', channel: channel, template: id, date: D.today(), at: at, status: status, server_log_id: logId || null });
}

const PHONE_OK = /^01\d-?\d{3,4}-?\d{4}$/;
// 휴대폰(터치 화면)에서만 [카톡으로 보내기] 공유 버튼을 보인다
const canShare = () => !!navigator.share && window.matchMedia('(pointer: coarse)').matches;

function LeadMsgModal({ l, startId, close }) {
  useStore();
  const ids = forStage(l.stage);
  const [id, setId] = useState(startId || nextId(l) || ids[0]);
  const [vals, setVals] = useState(() => values(l, id));
  const [server, setServer] = useState({ checking: true });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [alert, setAlert] = useState(null); // { tone, text }
  const [consent, setConsent] = useState(false);

  useEffect(() => { let live = true; sender.health().then((s) => { if (live) setServer(s); }); return () => { live = false; }; }, []);

  const load = (nid) => { setId(nid); setVals(values(l, nid)); setDone(null); setAlert(null); };
  const label = (x) => { const cur = store.get('leads', l.id) || l; return T[x].label + (cur.msgSent && cur.msgSent[x] ? ' ✓' : '') + (applicable(l, x) ? '' : ' (' + notReady(l, x) + ')'); };

  function reasons() {
    const out = [], info = tplInfo(id);
    const miss = inputKeys(id).filter((k) => OPTIONAL.indexOf(k) < 0 && !String(vals[k] || '').trim());
    if (miss.length) out.push('빈 칸: ' + miss.join(', '));
    if (info.status !== '승인' || !info.templateId) out.push('알림톡 템플릿이 승인 전입니다');
    if (notReady(l, id)) out.push('방문 일정과 맞지 않는 안내입니다 (' + notReady(l, id) + ')');
    // T2 고정 문구는 25,000원 선입금 규정이라 프로모션 무료 학생에게는 맞지 않는다
    if (id === 'T2' && l.testPay === PROMO) out.push('프로모션 무료 학생은 입금 안내 문구가 달라 [복사]로 직접 보내 주세요');
    if (!PHONE_OK.test((l.parentPhone || '').trim())) out.push('학부모 전화번호를 확인해 주세요');
    if (server.checking) out.push('발송 서버 확인 중'); else if (!server.ok) out.push(server.reason + ' ([복사]로 직접 보낼 수 있습니다)');
    if (!consent) out.push('수신 동의 확인이 필요합니다');
    return out;
  }

  function doSend() {
    if (busy || done || reasons().length) return false;
    const info = tplInfo(id), variables = {};
    inputKeys(id).forEach((k) => { variables['#{' + k + '}'] = String(vals[k] || '').trim(); }); // 고정값은 승인 문구에 들어 있어 보내지 않는다
    setBusy(true);
    sender.send({ leadId: l.id, template: id, templateId: info.templateId, to: l.parentPhone.replace(/\D/g, ''), variables: variables, text: textOf(id, vals) })
      .then((res) => {
        const status = RESULT[res.status] ? res.status : 'accepted';
        record(l.id, id, status, status === 'test' ? '알림톡(테스트)' : '알림톡', res.logId);
        setDone(status);
        setAlert({ tone: status === 'failed' ? 'bad' : 'ok',
          text: status === 'failed' ? '⚠ 발송하지 못했습니다' + (res.reason ? ': ' + res.reason : '') : status === 'test' ? '테스트 모드라 실제로 보내지 않고 기록만 남겼습니다' : '✓ 알림톡 발송을 요청했습니다 · ' + l.parentPhone });
      })
      .catch((e) => {
        record(l.id, id, 'failed', '알림톡');
        setAlert({ tone: 'bad', text: '⚠ 발송하지 못했습니다: ' + e.message + ' — [복사]로 직접 보낼 수 있습니다' });
      })
      .finally(() => setBusy(false));
    return false;
  }

  const info = tplInfo(id);
  const r = reasons();
  const fixed = keysOf(id).filter((k) => FIXED.indexOf(k) >= 0);
  const logs = store.list('messageLogs', (m) => m.lead_id === l.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const preview = [];
  lines(id, vals).forEach((ln, i) => {
    if (i) preview.push('\n');
    ln.segs.forEach((s, j) => preview.push(s.k && FIXED.indexOf(s.k) < 0 && s.t ? <mark key={i + '-' + j} className={s.miss ? 'miss' : undefined}>{s.t}</mark> : s.t));
  });

  return (
    <Modal title={l.student + ' · 학부모 연락'} wide onClose={close} actions={[
      { label: '닫기' },
      { label: '복사', onClick: () => { copyText(textOf(id, vals)); return false; } },
      canShare() ? { label: '카톡으로 보내기', onClick: () => { navigator.share({ text: textOf(id, vals) }).catch(() => {}); return false; } } : null,
      { label: busy ? '보내는 중…' : done ? '발송 완료' : '알림톡 발송' + (server.dryRun ? ' (테스트)' : ''), kind: 'primary', disabled: busy || !!done || r.length > 0, onClick: doSend },
    ]}>
      <div className="msg-top">
        <Field label="안내 종류"><Select options={ids.map((x) => ({ value: x, label: label(x) }))} value={id} onChange={load} /></Field>
        <Field label="수신번호 (학부모)"><input type="text" value={l.parentPhone || '미입력'} disabled /></Field>
        <Field label="알림톡 템플릿"><span><Badge tone={STATUS_TONE[info.status] || 'gray'}>{info.status + (info.templateId ? ' · ' + info.templateId : '')}</Badge></span></Field>
      </div>
      <div>{alert ? <div className={'msg-alert ' + alert.tone}>{alert.text}</div> : null}</div>
      <div className="msg-cols">
        <div>
          <div className="msg-sec">이 학생에 맞게 채울 칸</div>
          <div className="msg-vars">{inputKeys(id).map((k) => {
            const multi = MULTI.indexOf(k) >= 0;
            const cls = OPTIONAL.indexOf(k) < 0 && !String(vals[k] || '').trim() ? 'empty' : undefined;
            const onChange = (ev) => setVals(Object.assign({}, vals, { [k]: ev.target.value }));
            const hint = l.testPay === PROMO && (k === '비용' || k === '레벨테스트비용') ? '프로모션 무료 학생입니다. 비용 문구를 직접 입력해 주세요.' : null;
            return (
              <Field key={id + k} label={k + (OPTIONAL.indexOf(k) >= 0 ? ' (선택)' : '')} hint={hint}>
                {multi ? <textarea rows={3} className={cls} value={vals[k]} onChange={onChange} /> : <input type="text" className={cls} value={vals[k]} onChange={onChange} />}
              </Field>
            );
          })}</div>
          <div className="msg-fixed">{fixed.length ? '고정값 (승인 문구에 포함): ' + fixed.map((k) => k + ' ' + vals[k]).join(' · ') : ''}</div>
          <div>
            <div className="msg-hist">
              <b>이 학생 발송 이력</b>
              {logs.length ? logs.map((m) => <div key={m.id}>{resultBadge(m.status)}{' '}{(T[m.template] ? T[m.template].label : m.template) + ' · ' + D.mdhm(m.at) + ' · ' + m.channel}</div>)
                : <div className="muted">아직 보낸 안내가 없습니다</div>}
              <div className="msg-manual">[복사]·[카톡으로 보내기]로 직접 보냈다면{' '}
                <button className="btn sm ghost" onClick={() => { record(l.id, id, 'manual', '개인 카톡·1:1 채팅'); toast('보낸 것으로 기록했습니다'); }}>보낸 것으로 기록</button></div>
            </div>
          </div>
        </div>
        <div>
          <div className="msg-sec">카카오톡 미리보기</div>
          <div className="kakao"><div className="kakao-who"><span className="kakao-av">SNP</span>{CONFIG.academy}</div>
            <div className="kakao-bubble"><div className="kakao-head">알림톡 도착</div><div className="kakao-text">{preview}</div></div></div>
        </div>
      </div>
      <div className="msg-bottom">
        <label className="msg-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> 학부모 수신 동의를 확인했습니다</label>
        <div className="msg-why">{busy || done ? '' : r.join(' · ')}</div>
      </div>
    </Modal>
  );
}

function open(l, startId) {
  if (!forStage(l.stage).length) { toast('이 단계에는 보낼 안내가 없습니다'); return; }
  openModal((close) => <LeadMsgModal l={l} startId={startId} close={close} />);
}

export const leadMsg = { T, forStage, nextId, lastSent, resultBadge, open, render, approvalText, CONFIG, TPL_STATUS, tplInfo };
