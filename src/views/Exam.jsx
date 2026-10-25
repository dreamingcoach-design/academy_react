/* 내신 관리 (M5, F6): 학교·학년별 시험 기간 → 시험 D-n 자동 계산 → 정규/내신 판정 */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { Badge, Card, Empty, Field, Kpi, Modal, PageHead, Select, Table, Tabs, openModal, toast } from '../ui.jsx';

function PeriodModal({ p, close }) {
  const [f, setF] = useState({ school: (p && p.school) || '', grade: (p && p.grade) || '중1', name: (p && p.name) || '2학기 중간고사', date: (p && p.date) || '' });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title={p ? '시험 기간 수정' : '시험 기간 추가'} onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (!f.school.trim() || !f.date) { toast('학교와 시험일을 입력하세요'); return false; }
      store.upsert('examPeriods', { id: p && p.id, school: f.school.trim(), grade: f.grade, name: f.name, date: f.date });
    } }]}>
      <div className="row">
        <Field label="학교"><input type="text" value={f.school} onChange={(e) => up('school')(e.target.value)} /></Field>
        <Field label="학년"><Select options={['초6', '중1', '중2', '중3', '고1', '고2', '고3']} value={f.grade} onChange={up('grade')} /></Field>
      </div>
      <div className="row">
        <Field label="시험명"><input type="text" value={f.name} onChange={(e) => up('name')(e.target.value)} /></Field>
        <Field label="시험 시작일"><input type="date" value={f.date} onChange={(e) => up('date')(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
const open = (p) => openModal((close) => <PeriodModal p={p} close={close} />);

function Period() {
  const t = D.today();
  const N = dom.NAESHIN_WEEKS_DAYS;
  const rows = store.list('examPeriods').sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <Card title="학교·학년별 시험 기간">
      <div>
        <p className="small muted">{'내신 기준 시작 = 시험 ' + N + '일 전 (ENG-TEST-07, 4~5주 중 기본값 5주는 구현 전 확정). 이 날짜부터 해당 학생의 코칭 일지가 내신기간 양식으로 바뀝니다.'}</p>
        <Table rows={rows} empty="시험 기간을 입력하면 정규/내신 판정이 자동 계산됩니다" cols={[
          { label: '학교', key: 'school' }, { label: '학년', key: 'grade' }, { label: '시험', key: 'name' }, { label: '시험일', key: 'date' },
          { label: 'D-n', render: (p) => { const d = D.diff(p.date, t); return d >= 0 ? <Badge tone={d <= N ? 'warn' : 'gray'}>{'D-' + d}</Badge> : <Badge tone="gray">종료</Badge>; } },
          { label: '내신 기준 시작', render: (p) => D.add(p.date, -N) },
          { label: '판정', render: (p) => { const d = D.diff(p.date, t); return d < 0 ? '—' : d <= N ? <Badge tone="warn">내신 기준 적용 중</Badge> : <Badge>정규 기준</Badge>; } },
          { label: '', render: (p) => <span><button className="btn sm" onClick={() => open(p)}>수정</button>{' '}<button className="btn sm ghost" onClick={() => store.remove('examPeriods', p.id)}>삭제</button></span> },
        ]} />
      </div>
    </Card>
  );
}

/* 유인물·외부지문 (F15): 학교 선생님이 과마다 진도 나갈 때 배부 → 학생이 강사에게 제출(전원 확인)
 * → 강사 하드카피 수령 → 데스크 조교 취합·교재 반영. 외부지문은 시험 직전, 보통 고등이지만 중등도 확인 */
function HandoutModal({ ex, ho, close }) {
  ho = ho || {};
  const [f, setF] = useState({ title: ho.title || '', kind: ho.kind || '유인물', issued: ho.issuedAt || D.today() });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title={ho.id ? '유인물 수정' : '유인물 추가 — ' + ex.school + ' ' + ex.grade} onClose={close} actions={(ho.id ? [{ label: '삭제', kind: 'danger', onClick: () => { store.removeWhere('handoutChecks', (c) => c.handout_id === ho.id); store.remove('handouts', ho.id); } }] : []).concat([{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (!f.title.trim()) { toast('이름을 입력하세요'); return false; }
      store.upsert('handouts', { id: ho.id, exam_id: ex.id, title: f.title.trim(), kind: f.kind, issuedAt: f.issued, teacherReceived: !!ho.teacherReceived, compiled: !!ho.compiled });
    } }])}>
      <Field label="이름"><input type="text" value={f.title} placeholder="예: 5과 본문 프린트" onChange={(e) => up('title')(e.target.value)} /></Field>
      <div className="row">
        <Field label="종류"><Select options={['유인물', '외부지문']} value={f.kind} onChange={up('kind')} /></Field>
        <Field label="학교 배부일"><input type="date" value={f.issued} onChange={(e) => up('issued')(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
const editHandout = (ex, ho) => openModal((close) => <HandoutModal ex={ex} ho={ho} close={close} />);

function Handout({ st, set }) {
  const t = D.today();
  const exams = store.list('examPeriods').sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!exams.length) return <Card><Empty>먼저 "시험 기간" 탭에서 시험을 입력하세요.</Empty></Card>;
  if (!st.exam || !store.get('examPeriods', st.exam)) {
    // 기본 선택: 유인물이 등록된 다가오는 시험 → 없으면 가장 가까운 시험
    const upcoming = exams.filter((e) => D.diff(e.date, t) >= -7);
    st.exam = (upcoming.find((e) => store.list('handouts', (x) => x.exam_id === e.id).length) || upcoming[0] || exams[exams.length - 1]).id;
  }
  const ex = store.get('examPeriods', st.exam);
  const high = /^고/.test(ex.grade);
  const students = store.list('students', (s) => s.status === '재원' && s.school === ex.school && s.grade === ex.grade).sort((a, b) => (a.name < b.name ? -1 : 1));
  const hos = store.list('handouts', (x) => x.exam_id === ex.id).sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));
  const has = (ho, s) => store.list('handoutChecks', (c) => c.handout_id === ho.id && c.student_id === s.id)[0];
  const flip = (ho, s) => { const c = has(ho, s); if (c) store.remove('handoutChecks', c.id); else store.upsert('handoutChecks', { handout_id: ho.id, student_id: s.id, date: t }); };
  const missing = hos.reduce((n, ho) => n + students.filter((s) => !has(ho, s)).length, 0);
  const ext = ex.externalStatus || '확인 전';
  const center = { textAlign: 'center' };

  const matrix = hos.length ? (
    <div className="table-wrap"><table className="tbl">
      <thead><tr><th>학생</th>{hos.map((ho) => (
        <th key={ho.id} style={{ cursor: 'pointer', textAlign: 'center' }} title="눌러서 수정" onClick={() => editHandout(ex, ho)}>
          {ho.title}<div className="small muted">{(ho.kind === '외부지문' ? '외부지문 · ' : '') + D.md(ho.issuedAt) + ' 배부'}</div></th>
      ))}<th className="num">미제출</th></tr></thead>
      <tbody>
        {students.map((s) => {
          const miss = hos.filter((ho) => !has(ho, s)).length;
          return (
            <tr key={s.id}><td>{s.name}</td>{hos.map((ho) => {
              const c = has(ho, s);
              return <td key={ho.id} style={center}><button className={'btn sm' + (c ? ' primary' : '')} style={{ minWidth: 46 }} onClick={() => flip(ho, s)} title={c ? D.md(c.date) + ' 제출' : '미제출'}>{c ? '✓' : '—'}</button></td>;
            })}<td className="num">{miss ? <Badge tone="bad">{miss + '개'}</Badge> : <Badge tone="ok">완료</Badge>}</td></tr>
          );
        })}
        <tr><td><b>학생 제출</b></td>{hos.map((ho) => { const n = students.filter((s) => has(ho, s)).length; return <td key={ho.id} style={center}><Badge tone={n === students.length ? 'ok' : 'warn'}>{n + ' / ' + students.length}</Badge></td>; })}<td /></tr>
        <tr><td><b>강사 하드카피 수령</b></td>{hos.map((ho) => (
          <td key={ho.id} style={center}><input type="checkbox" checked={!!ho.teacherReceived} aria-label="강사 수령" onChange={(e) => store.upsert('handouts', { id: ho.id, teacherReceived: e.target.checked })} /></td>
        ))}<td /></tr>
        <tr><td><b>조교 취합·교재 반영</b></td>{hos.map((ho) => (
          <td key={ho.id} style={center}><input type="checkbox" checked={!!ho.compiled} aria-label="조교 취합" onChange={(e) => {
            if (e.target.checked && !ho.teacherReceived) toast('강사 하드카피 수령 전입니다. 확인 후 체크하세요');
            store.upsert('handouts', { id: ho.id, compiled: e.target.checked });
          }} /></td>
        ))}<td /></tr>
      </tbody>
    </table></div>
  ) : <Empty>아직 등록된 유인물이 없습니다. 학교에서 과마다 유인물이 나오면 "+ 유인물 추가"로 등록하세요.</Empty>;

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
        <Field label="시험"><Select options={exams.map((e) => ({ value: e.id, label: e.school + ' ' + e.grade + ' · ' + e.name + ' (' + e.date + (D.diff(e.date, t) >= 0 ? ', D-' + D.diff(e.date, t) : ', 종료') + ')' }))} value={ex.id} onChange={(v) => set({ exam: v })} /></Field>
        <button className="btn primary" onClick={() => editHandout(ex)}>+ 유인물 추가</button>
      </div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="대상 학생" value={students.length + '명'} note={ex.school + ' ' + ex.grade} />
        <Kpi label="유인물·외부지문" value={hos.length + '개'} />
        <Kpi label="학생 미제출" value={missing + '건'} note="전원 제출이 목표" tone={missing ? 'bad' : 'ok'} />
        <Kpi label="교재 반영 대기" value={hos.filter((x) => !x.compiled).length + '개'} note={'강사 수령 대기 ' + hos.filter((x) => !x.teacherReceived).length + '개'} tone={hos.some((x) => !x.compiled) ? 'warn' : 'ok'} />
      </div>
      <Card title="외부지문">
        <div>
          <div className="row" style={{ alignItems: 'center' }}>
            <Select options={['확인 전', '있음', '없음']} value={ext} onChange={(v) => store.upsert('examPeriods', { id: ex.id, externalStatus: v })} />
            <Badge tone={ext === '확인 전' ? 'bad' : ext === '있음' ? 'warn' : 'ok'}>{ext === '확인 전' ? '확인 필요' : ext === '있음' ? '있음 — 아래에 외부지문으로 추가' : '없음 확인'}</Badge>
          </div>
          <p className="small muted">{high ? '고등은 보통 외부지문이 있습니다. 시험 직전에 나오니 시험 D-10 전후로 확인하세요.' : '중등은 보통 없지만 가끔 있습니다. 반드시 확인 후 "없음"으로 바꿔 두세요.'}</p>
        </div>
      </Card>
      <Card title="학생별 제출 체크" right={<span className="small muted">칸을 눌러 제출/미제출 전환 · 열 제목을 눌러 수정</span>}>{matrix}</Card>
    </div>
  );
}

function PlanModal({ close }) {
  const [f, setF] = useState({ school: '', grade: '중1', text: '' });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title="평가계획 추가" onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => { store.upsert('schoolPlans', { school: f.school, grade: f.grade, text: f.text }); } }]}>
      <div className="row">
        <Field label="학교"><input type="text" value={f.school} onChange={(e) => up('school')(e.target.value)} /></Field>
        <Field label="학년"><Select options={['중1', '중2', '중3', '고1', '고2', '고3']} value={f.grade} onChange={up('grade')} /></Field>
      </div>
      <Field label="내용"><textarea placeholder="반영 비율·서술형·수행평가 등" value={f.text} onChange={(e) => up('text')(e.target.value)} /></Field>
    </Modal>
  );
}

function Plans() {
  const rows = store.list('schoolPlans');
  return (
    <Card title="학교별 평가계획">
      <div>
        <button className="btn sm primary" onClick={() => openModal((close) => <PlanModal close={close} />)}>+ 추가</button>
        <Table rows={rows} empty="평가계획이 없습니다" cols={[{ label: '학교', key: 'school' }, { label: '학년', key: 'grade' }, { label: '내용', key: 'text' },
          { label: '', render: (p) => <button className="btn sm ghost" onClick={() => store.remove('schoolPlans', p.id)}>삭제</button> }]} />
      </div>
    </Card>
  );
}

function ExamCalendar() {
  const t = D.today();
  const rows = store.list('examPeriods').filter((p) => D.diff(p.date, t) >= 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <Card title="내신 대비 캘린더 (F6)">
      {rows.length ? <ul className="list">{rows.map((p) => {
        const students = store.list('students', (s) => s.school === p.school && s.grade === p.grade);
        return (
          <li key={p.id}><span><b>{p.school + ' ' + p.grade}</b>{' · ' + p.name + ' (' + p.date + ')'}</span>
            <span><Badge tone="warn">{'내신 시작 ' + D.md(D.add(p.date, -dom.NAESHIN_WEEKS_DAYS))}</Badge>{' '}<Badge tone="gray">{'대상 ' + students.length + '명'}</Badge></span></li>
        );
      })}</ul> : <Empty>예정된 시험이 없습니다</Empty>}
    </Card>
  );
}

export default function Exam({ arg }) {
  const [st, set] = useViewState('exam', { tab: 'period', exam: null });
  // 홈의 업무 바로가기(#/exam/handout 등)로 들어오면 그 탭을 연다
  // (주소를 #/exam 으로 바꾼 뒤에는 App 이 다시 그려지기 전까지 arg 가 남아 있으므로 현재 주소로 한 번만 적용한다)
  if (arg && location.hash !== '#/exam') { st.tab = arg; history.replaceState(null, '', '#/exam'); }
  const t = [{ id: 'period', label: '시험 기간' }, { id: 'handout', label: '유인물·외부지문' }, { id: 'plan', label: '학교별 평가계획' }, { id: 'cal', label: '내신 대비 캘린더' }];
  return (
    <div className="page">
      <PageHead title="내신 관리" sub="시험 기간 입력이 정규/내신 판정의 원본입니다"><button className="btn primary" onClick={() => open()}>+ 시험 기간 추가</button></PageHead>
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'period' ? <Period /> : st.tab === 'handout' ? <Handout st={st} set={set} /> : st.tab === 'plan' ? <Plans /> : <ExamCalendar />}
    </div>
  );
}
