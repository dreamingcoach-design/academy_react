/* 상담·등록 방문 일정 (2026-10-25): 문의 카드(lead)의 visits = [{ id, at, type, status }] 가 원본이다.
 * 방문 유형 4종 — 레벨테스트는 카드당 1회, 상담은 2회까지. 레벨테스트 일시·상담 일시·차수는 저장하지 않고 여기서 계산한다 (CORE-DATA-07) */
const TYPES = {
  'test+consult': { no: '①', label: '레벨테스트 + 상담', short: '테스트+상담', test: true, consult: true, tone: 't' },
  consult: { no: '②', label: '상담만 · 학생 동반', short: '상담만', test: false, consult: true, tone: '' },
  'consult-parent': { no: '③', label: '상담만 · 학부모만', short: '상담만 · 학부모', test: false, consult: true, tone: 'p' },
  test: { no: '④', label: '레벨테스트만', short: '테스트만', test: true, consult: false, tone: 't' },
};
const ORDER = ['test+consult', 'consult', 'consult-parent', 'test'];
const STATUS = ['예정', '완료', '취소'];
const MAX_TEST = 1, MAX_CONSULT = 2;

// 취소를 뺀 방문을 일시 순으로 (일시가 비어 있으면 맨 뒤). 차수(round)는 이 순서
function list(l) {
  return (l.visits || []).filter((v) => v.status !== '취소')
    .slice().sort((a, b) => ((a.at || '9') < (b.at || '9') ? -1 : 1))
    .map((v, i) => Object.assign({ round: i + 1 }, v));
}
const isTest = (v) => !!(TYPES[v.type] && TYPES[v.type].test);
const isConsult = (v) => !!(TYPES[v.type] && TYPES[v.type].consult);

const testVisit = (l) => list(l).find(isTest) || null;            // 레벨테스트가 들어간 방문 (최대 1개)
const testAt = (l) => { const v = testVisit(l); return v ? v.at : ''; };
const next = (l) => list(l).find((v) => v.status === '예정') || null; // 다음에 올 방문
// 마지막으로 끝난 상담 방문 (후속 D+n 기준). 없으면 null
const lastConsult = (l) => list(l).filter((v) => isConsult(v) && v.status === '완료').pop() || null;
const consultAt = (l) => { const v = lastConsult(l); return v ? v.at : ''; };
const nextConsult = (l) => list(l).find((v) => isConsult(v) && v.status === '예정') || null;

// 새로 추가할 수 있는 유형 (except = 지금 고치는 방문 id 는 셈에서 뺀다)
function allowed(l, except) {
  const vs = list(l).filter((v) => v.id !== except);
  const tests = vs.filter(isTest).length, consults = vs.filter(isConsult).length;
  return ORDER.filter((t) => !(TYPES[t].test && tests >= MAX_TEST) && !(TYPES[t].consult && consults >= MAX_CONSULT));
}

// 방문 상태로 보드 단계 제안 (등록·이탈은 사람이 정한다): 예정 방문이 있으면 '방문 예약', 끝난 상담이 있으면 '상담 완료'
function suggestStage(l) {
  if (l.stage === '등록' || l.stage === '이탈') return l.stage;
  if (next(l)) return '방문 예약';
  if (lastConsult(l)) return '상담 완료';
  return list(l).length ? '방문 예약' : l.stage;
}

export const visits = { TYPES, ORDER, STATUS, list, isTest, isConsult, testVisit, testAt, next, lastConsult, consultAt, nextConsult, allowed, suggestStage };
