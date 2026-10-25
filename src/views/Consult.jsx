/* 상담·등록 (F1~F3): 문의 보드 / 레벨테스트 / 상담 코파일럿 / 결과·후속 */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { visits as V } from '../lib/visits.js';
import { Badge, Card, Chips, DateTime, Field, Modal, PageHead, Select, Table, Tabs, closeAllModals, confirmBox, openModal, toast } from '../ui.jsx';
import { leadMsg as LM } from './LeadMsg.jsx';
import { ltReport } from './LtReport.jsx';

const STAGES = ['신규 문의', '방문 예약', '상담 완료', '등록', '이탈']; // 2026-10-25: '레벨테스트 예약' → '방문 예약' (일정은 lead.visits, lib/visits.js)
const AREAS = ['단어', '독해', '문법', '영작', '듣기']; // Q-03 확정 5영역
const CHANNELS = ['블로그', '인스타그램', '지인 소개', '커뮤니티', '지도·검색', '기타'];
const GRADES = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1'];

// 사전 통화 시트 (TRK-PRECALL-01, ENG-DIAG-05) 선택지
const PREV_TYPES = ['파닉스', '리딩', '문법', '기타'];
const WORRIES = ['자기주도', '문법 개념', '숙제', '성적', '내신', '태도', '기타'];
const CRITERIA = ['친구', '거리', '선생님', '커리큘럼', '숙제량', '귀가시간'];
const PAY_STATUS = ['입금', '미입금', '프로모션 무료'];
const PAY_TONE = { '입금': 'ok', '미입금': 'warn', '프로모션 무료': 'gray' };

let visitSeq = 0;
const newVisitId = () => 'vis-' + Date.now().toString(36) + (++visitSeq);

// 문의 카드 → 입력 폼 값. 방문 1차 행은 처음부터 한 줄(유형 기본 ① 레벨테스트 + 상담)
function initForm(l) {
  l = l || {};
  const p = l.precall || {};
  const rows = (l.visits || []).map((v) => Object.assign({}, v));
  if (!rows.length) rows.push({ id: newVisitId(), at: '', type: 'test+consult', status: '예정' });
  return {
    student: l.student || '', grade: l.grade || '중1', school: l.school || '', channel: l.channel || '블로그', parentPhone: l.parentPhone || '', memo: l.memo || '',
    visits: rows, testPay: l.testPay || '미입금',
    caller: p.caller || '', trait: p.trait || '', prevPlace: p.prevPlace || '', prevTypes: p.prevTypes || [], family: p.family || '',
    worries: p.worries || [], criteria: p.criteria || [], activities: p.activities || '',
  };
}

// 폼 → 저장 값 (식별·연락·일시·사전 통화 시트). 칩은 선택지에 있는 값만 남긴다
function leadValues(f) {
  const pick = (opts, sel) => opts.filter((o) => sel.indexOf(o) >= 0);
  return {
    student: f.student.trim(), grade: f.grade, school: f.school, channel: f.channel, parentPhone: f.parentPhone, memo: f.memo,
    // 일시가 비어 있는 행은 저장하지 않는다 (1차 기본 행을 비워 두면 방문 없음)
    visits: f.visits.filter((r) => r.at).map((r) => ({ id: r.id, at: r.at, type: r.type, status: r.status })), testPay: f.testPay,
    precall: { caller: f.caller, trait: f.trait, prevPlace: f.prevPlace, prevTypes: pick(PREV_TYPES, f.prevTypes), family: f.family,
      worries: pick(WORRIES, f.worries), criteria: pick(CRITERIA, f.criteria), activities: f.activities },
  };
}

// 방문 일정 입력: 레벨테스트 1회·상담 2회 한도를 넘는 유형은 흐리게
function VisitEditor({ rows, onChange }) {
  const live = rows.filter((r) => r.status !== '취소');
  const order = V.list({ visits: rows.filter((r) => r.at) }).map((v) => v.id);
  const setRow = (r, patch) => onChange(rows.map((x) => (x === r ? Object.assign({}, x, patch) : x)));
  const canAdd = V.allowed({ visits: rows });
  return (
    <div className="visits">
      {rows.map((r, i) => {
        const ok = V.allowed({ visits: rows }, r.id);
        const round = r.status === '취소' ? '취소' : (order.indexOf(r.id) >= 0 ? order.indexOf(r.id) + 1 : live.indexOf(r) + 1) + '차';
        return (
          <div key={r.id} className={'visit-row' + (r.status === '취소' ? ' off' : '')}>
            <Badge tone={round === '1차' || round === '취소' ? 'gray' : ''}>{round}</Badge>
            <DateTime value={r.at} onChange={(at) => setRow(r, { at })} />
            <div className="chips">{V.ORDER.map((t) => (
              <button key={t} type="button" className={'chip' + (r.type === t ? ' on' : '') + (r.type !== t && ok.indexOf(t) < 0 ? ' dis' : '')}
                title={ok.indexOf(t) < 0 && r.type !== t ? (V.TYPES[t].test ? '레벨테스트는 카드당 1번입니다' : '상담은 2번까지입니다') : ''}
                onClick={() => { if (r.type !== t && ok.indexOf(t) < 0) return; setRow(r, { type: t }); }}>{V.TYPES[t].no + ' ' + V.TYPES[t].label}</button>
            ))}</div>
            <Select options={V.STATUS} value={r.status} onChange={(s) => setRow(r, { status: s })} />
            {i > 0 ? <button type="button" className="btn sm ghost" title="이 방문 지우기" onClick={() => onChange(rows.filter((x) => x !== r))}>×</button> : <span />}
          </div>
        );
      })}
      <div className="visit-add">
        <button type="button" className="btn sm" disabled={!canAdd.length} onClick={() => onChange(rows.concat([{ id: newVisitId(), at: '', type: canAdd[0], status: '예정' }]))}>+ 방문 추가 (2차 상담 · 레벨테스트)</button>
        <span className="small muted">{canAdd.length ? ' 1차로 끝나면 누르지 않아도 됩니다' : ' 레벨테스트 1번·상담 2번을 모두 썼습니다'}</span>
      </div>
    </div>
  );
}

function LeadForm({ f, setF }) {
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  const txt = (k, ph, type) => <input type={type || 'text'} value={f[k]} placeholder={ph} onChange={(e) => up(k)(e.target.value)} />;
  const showPay = f.visits.some((r) => r.status !== '취소' && V.isTest(r));
  return (
    <div>
      <div className="row"><Field label="학생">{txt('student', '예) 한○○')}</Field><Field label="학년"><Select options={GRADES} value={f.grade} onChange={up('grade')} /></Field><Field label="학교">{txt('school')}</Field></div>
      <div className="row"><Field label="유입 채널"><Select options={CHANNELS} value={f.channel} onChange={up('channel')} /></Field><Field label="학부모 전화번호">{txt('parentPhone', '010-0000-0000', 'tel')}</Field></div>
      <Field label="문의 메모"><textarea value={f.memo} onChange={(e) => up('memo')(e.target.value)} /></Field>
      <div className="sec-title">사전 통화 시트 (예약 전화에서 자연스럽게 묻고, 모르는 항목은 비워 두세요)</div>
      <div className="row"><Field label="통화자">{txt('caller', '통화한 사람')}</Field><Field label="성별·성향">{txt('trait', '성별·성향 한 줄')}</Field></div>
      <div className="row"><Field label="영어 이력">{txt('prevPlace', '다니던 곳·기간')}</Field><Field label="해 본 것"><Chips options={PREV_TYPES} value={f.prevTypes} onChange={up('prevTypes')} /></Field></div>
      <div className="row"><Field label="형제">{txt('family', '형제 유무·형제 학습 이력')}</Field><Field label="다른 활동 일정">{txt('activities', '운동·타 학원 일정')}</Field></div>
      <Field label="가장 걱정 (최대 3개 — 상담 키워드)"><Chips options={WORRIES} value={f.worries} onChange={up('worries')} max={3} /></Field>
      <Field label="학원 선택 기준 (결정 요인 후보)"><Chips options={CRITERIA} value={f.criteria} onChange={up('criteria')} /></Field>
      <div className="sec-title">방문 일정 (1차는 기본, 2차 상담·따로 보는 레벨테스트만 추가)</div>
      <VisitEditor rows={f.visits} onChange={up('visits')} />
      <div className="row" style={{ display: showPay ? undefined : 'none' }}>
        <Field label="레벨테스트 비용 (레벨테스트가 있는 방문이 있을 때만)"><Select options={PAY_STATUS} value={f.testPay} onChange={up('testPay')} /></Field>
      </div>
    </div>
  );
}

function LeadModal({ l, close }) {
  const [f, setF] = useState(() => initForm(l));
  const [stage, setStage] = useState(l.stage);
  return (
    <Modal title={l.student} wide onClose={close} actions={[
      { label: '삭제', kind: 'danger', keepOpen: true, onClick: () => { confirmBox('이 문의를 삭제할까요?', () => { store.remove('leads', l.id); close(); }, true); return false; } },
      { label: '취소' },
      { label: '저장', kind: 'primary', onClick: () => {
        if (!f.student.trim()) { toast('학생 이름을 입력하세요'); return false; }
        const vals = leadValues(f);
        // 단계를 직접 바꾸지 않았으면 방문 상태로 단계를 맞춘다 (예정 방문 → 방문 예약, 끝난 상담 → 상담 완료)
        const next = stage !== l.stage ? stage : V.suggestStage({ stage: l.stage, visits: vals.visits });
        if (next === '등록' && l.stage !== '등록') { store.upsert('leads', Object.assign({ id: l.id }, vals)); register(store.get('leads', l.id)); return; }
        store.upsert('leads', Object.assign({ id: l.id, stage: next }, vals));
      } }]}>
      <Field label="단계"><Select options={STAGES} value={stage} onChange={setStage} /></Field>
      <LeadForm f={f} setF={setF} />
    </Modal>
  );
}
const openLead = (l) => openModal((close) => <LeadModal l={l} close={close} />);

function AddLeadModal({ close }) {
  const [f, setF] = useState(() => initForm());
  return (
    <Modal title="문의 추가" wide onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (!f.student.trim()) { toast('학생 이름을 입력하세요'); return false; }
      const vals = leadValues(f);
      store.upsert('leads', Object.assign({ stage: V.suggestStage({ stage: '신규 문의', visits: vals.visits }), createdAt: D.today(), scores: {} }, vals));
    } }]}>
      <LeadForm f={f} setF={setF} />
    </Modal>
  );
}

// 카드 이동 버튼: 왼쪽 = 이전 단계, 오른쪽(파랑) = 다음 단계. 이탈 카드는 신규 문의로 되돌리기만 둔다
function moveTo(l, stage) {
  if (stage === '등록') { register(l); return; }
  // 상담 완료로 옮기면 예정된 다음 방문을 '완료'로 표시한다. 방문 기록이 하나도 없으면 오늘 상담 1건을 남긴다
  let visits = l.visits || [];
  if (stage === '상담 완료') {
    const nx = V.next(l);
    if (nx) visits = visits.map((v) => (v.id === nx.id ? Object.assign({}, v, { status: '완료' }) : v));
    else if (!V.lastConsult(l)) visits = visits.concat([{ id: 'vis-' + Date.now().toString(36), at: D.today(), type: 'consult', status: '완료' }]);
  }
  store.upsert('leads', { id: l.id, stage: stage, visits: visits });
}

// 등록 처리: 수강생을 만들어(같은 이름이 있으면 연결할지 묻고) 문의 카드와 연결한다 (Lead.student_id).
// 등록에서 이전 단계로 되돌려도 연결은 지우지 않아, 다시 등록해도 학생이 중복으로 생기지 않는다
function register(l) {
  const finish = (sid, msg) => { store.upsert('leads', { id: l.id, stage: '등록', student_id: sid }); if (msg) toast(msg); };
  if (l.student_id && store.get('students', l.student_id)) return finish(l.student_id);
  const create = () => {
    const st = store.upsert('students', { name: l.student, grade: l.grade || '', school: l.school || '', className: '', teacher: '', studentPhone: '', memo: '',
      status: '재원', enrolledAt: D.today(), level: '' });
    if (l.parentPhone) store.upsert('guardians', { student_id: st.id, parentPhone: l.parentPhone, consent: false });
    finish(st.id, '수강생 관리에 추가했습니다');
  };
  const same = store.list('students', (s) => s.name === l.student);
  if (!same.length) return create();
  openModal((close) => (
    <Modal title={l.student + ' · 등록 처리'} onClose={close} actions={[{ label: '취소' }, { label: '새 학생으로 추가', kind: 'primary', onClick: create }]}>
      <p>같은 이름의 수강생이 이미 있습니다. 같은 학생이면 연결하고, 다른 학생이면 새로 추가하세요.</p>
      {same.map((s) => (
        <div key={s.id} className="link-row"><span>{s.name + ' · ' + s.grade + (s.school ? ' · ' + s.school : '') + ' · ' + s.status}</span>
          <button className="btn sm" onClick={() => { closeAllModals(); finish(s.id, '수강생과 연결했습니다'); }}>이 학생에 연결</button></div>
      ))}
    </Modal>
  ));
}

function MoveButtons({ l, si }) {
  const go = (stage, cls, label) => <button key={stage} className={'btn sm ' + cls} onClick={(ev) => { ev.stopPropagation(); moveTo(l, stage); }}>{label}</button>;
  if (si === 4) return go(STAGES[0], '', '재등록 문의');
  return [si > 0 ? go(STAGES[si - 1], '', '‹ ' + STAGES[si - 1]) : <span key="p" />, si < 3 ? go(STAGES[si + 1], 'primary', STAGES[si + 1] + ' ›') : <span key="n" />];
}

// 단계별 학부모 연락: 아직 안 보낸 다음 안내 버튼 + 마지막 발송 기록 (leadMsg, 템플릿은 LeadMsg.jsx)
function ContactRow({ l }) {
  const nid = LM.nextId(l), last = LM.lastSent(l);
  return (
    <div className="lead-contact">
      <button className={'btn sm' + (nid ? ' contact' : '')} onClick={(ev) => { ev.stopPropagation(); LM.open(l, nid || undefined); }}>{nid ? '✉ ' + LM.T[nid].label : '✉ 연락 완료 (다시 보기)'}</button>
      {last ? <div className="small muted">{LM.resultBadge(last.status)}{' ' + LM.T[last.id].label + ' · ' + D.mdhm(last.at)}</div> : <div className="small warn-text">안내 필요</div>}
    </div>
  );
}

// 보드 카드의 방문 표시: 다음 방문(차수·일시·유형) + 2차부터는 앞서 끝난 방문, 상담 완료 칸은 마지막 상담
const VTag = ({ v }) => <span className={'vt ' + V.TYPES[v.type].tone}>{V.TYPES[v.type].short}</span>;
function VisitLines({ l, st }) {
  const nx = V.next(l), done = V.list(l).filter((v) => v.status === '완료');
  if (st === '상담 완료') { const c = V.lastConsult(l); return c ? <div className="small muted">{'상담 ' + D.mdhm(c.at) + ' '}<VTag v={c} /></div> : null; }
  if (!nx) return st === '신규 문의' ? null : <div className="small warn-text">방문 일정 없음 — 카드를 눌러 입력</div>;
  return (
    <>
      <div className="visit-line"><Badge tone={nx.round > 1 ? '' : 'gray'}>{nx.round + '차'}</Badge>{D.mdhm(nx.at)}<VTag v={nx} /></div>
      {nx.round > 1 ? <div className="small muted">{done.map((v) => v.round + '차 ' + D.mdhm(v.at).split(' ')[0] + ' ' + V.TYPES[v.type].short + ' ✓').join(' · ')}</div> : null}
    </>
  );
}

function Board() {
  const leads = store.list('leads');
  return (
    <div className="board">
      {STAGES.map((st, si) => (
        <div key={st} className="col">
          <h3>{st}<Badge tone="gray">{String(leads.filter((l) => l.stage === st).length)}</Badge></h3>
          {leads.filter((l) => l.stage === st).map((l) => (
            <div key={l.id} className="lead" onClick={() => openLead(l)}>
              <b>{l.student}</b><span className="small muted">{l.grade + (l.school ? ' · ' + l.school : '') + ' · ' + l.channel}</span>
              {si <= 2 ? <VisitLines l={l} st={st} /> : null}
              {si >= 1 && si <= 3 && V.testVisit(l) ? <div style={{ marginTop: 4 }}>입금 현황 <Badge tone={PAY_TONE[l.testPay || '미입금']}>{l.testPay || '미입금'}</Badge></div> : null}
              {si <= 3 ? <ContactRow l={l} /> : null}
              <div className="lead-move"><MoveButtons l={l} si={si} /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// 영역별 결과: 결과 리포트 '② 영역별 결과'와 같은 막대 (영역 · 막대 · 맞은 개수 / N문항). 입력된 영역만, 리포트와 같은 순서
const BAR_ORDER = ['문법', '독해', '영작', '단어', '듣기'];
function scoreInfographic(l) {
  const sc = l.scores || {};
  const areas = BAR_ORDER.filter((a) => sc[a] && sc[a].total > 0 && sc[a].correct != null);
  if (!areas.length) return <span className="muted">미입력</span>;
  return (
    <div className="area-bars">{areas.map((a) => (
      <div key={a} className="area-bar"><b>{a}</b>
        <div className="track"><i style={{ width: (sc[a].correct / sc[a].total * 100) + '%' }} /></div>
        <div className="n"><b>{String(sc[a].correct)}</b><small>{' / ' + sc[a].total + '문항'}</small></div></div>
    ))}</div>
  );
}

// 등록 전 학생만 (등록한 학생의 결과는 수강생 프로필 '등록 상담 레벨테스트'에서 본다)
function LevelTest() {
  const rows = store.list('leads', (l) => (l.stage === '방문 예약' || l.stage === '상담 완료') && V.testVisit(l)); // 레벨테스트가 들어간 방문이 있는 카드만
  return (
    <Card title="레벨테스트 (틀린 문항 채점 · 영역별 맞은 개수)" right={<button className="btn sm" onClick={() => ltReport.importKey()}>테스트지 키 가져오기</button>}>
      <div>
        <p className="small muted">{'테스트지 키가 있는 시험은 틀린 문항만 입력하면 영역별 결과와 근본 원인 분석이 자동으로 만들어집니다. 키가 없는 시험은 영역 점수만 직접 입력합니다. (등록된 키: ' +
          (store.list('testForms').map((f) => f.form.id).join(', ') || '없음') + ')'}</p>
        <p className="small muted">등록 전 학생만 보입니다. 등록한 학생의 결과는 수강생 관리 › 학생 프로필에서 볼 수 있습니다.</p>
        <Table rows={rows} empty="레벨테스트 대상이 없습니다" cols={[
          { label: '학생', key: 'student' }, { label: '학년', key: 'grade' }, { label: '레벨테스트 일시', render: (l) => D.ymdhm(V.testAt(l)) },
          { label: '영역별 맞은 개수 / 총 문제', render: scoreInfographic },
          { label: '', render: (l) => <div className="lead-move">
            <button className="btn sm primary" onClick={() => ltReport.grade(l)}>{ltReport.isGraded(l) ? '채점 수정' : '채점 입력'}</button>
            <button className="btn sm" onClick={() => openModal((close) => <ScoreModal l={l} close={close} />)} title="테스트지 키가 없는 시험용">영역 점수만</button></div> },
        ]} />
      </div>
    </Card>
  );
}

// 영역의 총 문제 수 기본값: 이 학생 값 → 가장 최근에 입력된 다른 학생 값 (시험지가 같은 회차면 그대로 쓰도록)
function lastTotal(a, l) {
  if (l.scores && l.scores[a] && l.scores[a].total != null) return l.scores[a].total;
  const rec = store.list('leads', (x) => x.scores && x.scores[a] && x.scores[a].total != null).pop();
  return rec ? rec.scores[a].total : '';
}

function ScoreModal({ l, close }) {
  const [tot, setTot] = useState(() => { const o = {}; AREAS.forEach((a) => { o[a] = String(lastTotal(a, l)); }); return o; });
  const [cor, setCor] = useState(() => { const o = {}; AREAS.forEach((a) => { o[a] = l.scores && l.scores[a] && l.scores[a].correct != null ? String(l.scores[a].correct) : ''; }); return o; });
  return (
    <Modal title={l.student + ' · 레벨테스트 결과'} onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      const sc = {};
      for (const a of AREAS) {
        if (cor[a] === '' && tot[a] === '') continue;
        if (cor[a] === '') continue; // 맞은 개수가 없으면 그 영역은 미입력으로 둔다 (총 문제 수는 기본값일 수 있음)
        const t = +tot[a], c = +cor[a];
        if (!(t >= 1)) { toast(a + ': 총 문제 수를 입력하세요'); return false; }
        if (c > t) { toast(a + ': 맞은 개수가 총 문제 수보다 많습니다'); return false; }
        sc[a] = { total: t, correct: c };
      }
      store.upsert('leads', { id: l.id, scores: sc });
    } }]}>
      <p className="small muted">영역별로 총 문제 수와 맞은 개수를 입력하세요. 입력하지 않은 영역은 비워 둡니다. 총 문제 수는 최근 입력값이 기본으로 들어갑니다.</p>
      {AREAS.map((a) => (
        <div key={a} className="row">
          <div className="field" style={{ justifyContent: 'end' }}><b>{a}</b></div>
          <Field label="총 문제"><input type="number" min={1} value={tot[a]} onChange={(e) => setTot(Object.assign({}, tot, { [a]: e.target.value }))} /></Field>
          <Field label="맞은 개수"><input type="number" min={0} value={cor[a]} onChange={(e) => setCor(Object.assign({}, cor, { [a]: e.target.value }))} /></Field>
        </div>
      ))}
    </Modal>
  );
}

// 상담 코파일럿: 학부모 상담용 리포트 (결과 리포트 3쪽: 결과 요약 / 영역·단원별 틀린 문항·정리 / 맞춤 콘텐츠·학습 플랜은 작업 예정)
function Copilot({ st, set }) {
  if (st.report) {
    const l = store.get('leads', st.report);
    if (l) return <ltReport.View l={l} onBack={() => set({ report: null })} />;
    st.report = null;
  }
  const rows = store.list('leads', (l) => l.stage !== '이탈' && (V.testVisit(l) || l.wrong));
  return (
    <div>
      <Card title="학부모 상담 리포트">
        <div>
          <p className="small muted">결과 리포트(3쪽: 결과 요약 / 영역·단원별 틀린 문항·정리)는 채점 입력 후 만들어지며, 틀린 문항 칸에 시험지 캡처를 붙여 넣을 수 있습니다. 학습 플랜(사전 통화에 맞춘 학원 콘텐츠·영역별 목표)은 작업 중입니다.</p>
          <Table rows={rows} empty="레벨테스트 대상이 없습니다" cols={[
            { label: '학생', key: 'student' }, { label: '학년', key: 'grade' }, { label: '레벨테스트 일시', render: (l) => D.ymdhm(V.testAt(l)) },
            { label: '채점', render: (l) => (ltReport.isGraded(l) ? <Badge tone="ok">채점 완료</Badge> : <Badge tone="warn">미채점</Badge>) },
            { label: '결과 리포트', render: (l) => (ltReport.isGraded(l)
              ? <button className="btn sm primary" onClick={() => set({ report: l.id })}>리포트 보기</button>
              : <button className="btn sm" onClick={() => ltReport.grade(l)}>채점 입력</button>) },
            { label: '학습 플랜', render: () => <Badge tone="gray">작업 예정</Badge> },
          ]} />
        </div>
      </Card>
      <Card title="상담 코파일럿 (F2) — 다음 단계"><ul><li>사전 통화 시트로 만든 맞춤 스크립트·질문별 대응 카드</li><li>17분 상담 순서 체크리스트</li></ul></Card>
    </div>
  );
}

function FollowUp() {
  const t = D.today();
  // 마지막으로 끝난 상담 방문 기준. 다음 방문(2차)이 예정돼 있으면 후속 연락 대신 그 일정을 보여 준다
  const rows = store.list('leads', (l) => V.lastConsult(l) && l.stage !== '이탈').map((l) => { const c = V.lastConsult(l); return { id: l.id, l: l, c: c, nx: V.next(l), d: D.diff(t, D.dateOf(c.at)) }; });
  return (
    <Card title="상담 결과·후속 (F3: D+1·D+2·D+3 클로징)">
      <Table rows={rows} empty="상담 완료 건이 없습니다" cols={[
        { label: '학생', render: (r) => r.l.student },
        { label: '상담 일시', render: (r) => <span>{D.ymdhm(r.c.at) + ' '}<VTag v={r.c} />{' '}<Badge tone="gray">{r.c.round + '차'}</Badge></span> },
        { label: '경과', render: (r) => (r.d < 0 ? '—' : 'D+' + r.d) },
        { label: '다음 할 일', render: (r) => (r.l.stage === '등록' ? <Badge tone="ok">등록 완료</Badge> : r.nx ? <Badge>{r.nx.round + '차 방문 예정 ' + D.mdhm(r.nx.at)}</Badge> : r.d < 1 ? '상담 결과 리포트 발송' : r.d <= 3 ? <Badge tone="warn">{'D+' + r.d + ' 후속 연락'}</Badge> : <Badge tone="bad">후속 기간 지남 — 이탈 여부 확인</Badge>) },
        { label: '', render: (r) => (r.l.stage === '등록' ? null : <button className="btn sm" onClick={() => register(r.l)}>등록 처리</button>) },
      ]} />
    </Card>
  );
}

export default function Consult() {
  const [st, set] = useViewState('consult', { tab: 'board', report: null });
  const t = [{ id: 'board', label: '문의 보드' }, { id: 'test', label: '레벨테스트' }, { id: 'copilot', label: '상담 코파일럿' }, { id: 'follow', label: '결과·후속' }];
  return (
    <div className="page">
      <PageHead title="상담·등록" sub="문의 접수부터 레벨테스트·상담·등록까지 (신규 전환 업무)">
        <button className="btn primary" onClick={() => openModal((close) => <AddLeadModal close={close} />)}>+ 문의 추가</button>
      </PageHead>
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'board' ? <Board /> : st.tab === 'test' ? <LevelTest /> : st.tab === 'follow' ? <FollowUp /> : <Copilot st={st} set={set} />}
    </div>
  );
}
