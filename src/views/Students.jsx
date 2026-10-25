/* 수강생 관리 — 프로필 허브 (core/09 §2). 게이트·숙제·약점 중심 */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState, go } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { visits as V } from '../lib/visits.js';
import { Badge, Bar, Card, Empty, Field, Kpi, Modal, PageHead, Select, Table, confirmBox, openModal, toast } from '../ui.jsx';
import { ltReport } from './LtReport.jsx';

const GRADES = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'];

function StudentModal({ s, close }) {
  const g = s ? dom.guardianOf(s.id) : null;
  const [f, setF] = useState(() => {
    const x = s || {};
    return { name: x.name || '', grade: x.grade || '중1', school: x.school || '', className: x.className || '', teacher: x.teacher || '', sphone: x.studentPhone || '', phone: g ? g.parentPhone || '' : '', memo: x.memo || '' };
  });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  const txt = (k, ph, type) => <input type={type || 'text'} value={f[k]} placeholder={ph} onChange={(e) => up(k)(e.target.value)} />;
  const save = () => {
    if (!f.name.trim()) { toast('이름을 입력하세요'); return false; }
    const st = store.upsert('students', { id: s && s.id, name: f.name.trim(), grade: f.grade, school: f.school.trim(), className: f.className.trim(),
      teacher: f.teacher.trim(), studentPhone: f.sphone.trim(), memo: f.memo, status: (s && s.status) || '재원', enrolledAt: (s && s.enrolledAt) || D.today(), level: (s && s.level) || '' });
    const gg = dom.guardianOf(st.id);
    if (f.phone.trim()) {
      store.upsert('guardians', { id: gg ? gg.id : undefined, student_id: st.id, parentPhone: f.phone.trim(), consent: gg ? gg.consent : false });
    }
    toast('저장했습니다');
  };
  return (
    <Modal title={s ? '정보 수정' : '학생 추가'} onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: save }]}>
      <div className="row"><Field label="이름">{txt('name')}</Field><Field label="학년"><Select options={GRADES} value={f.grade} onChange={up('grade')} /></Field></div>
      <div className="row"><Field label="학교">{txt('school')}</Field><Field label="반">{txt('className', '예) 중등 EXPERT 반')}</Field><Field label="담당 강사">{txt('teacher')}</Field></div>
      <div className="row"><Field label="학생 전화번호">{txt('sphone', '010-0000-0000', 'tel')}</Field><Field label="학부모 전화번호">{txt('phone', '010-0000-0000', 'tel')}</Field></div>
      <Field label="메모"><textarea value={f.memo} onChange={(e) => up('memo')(e.target.value)} /></Field>
    </Modal>
  );
}
const editStudent = (s) => openModal((close) => <StudentModal s={s} close={close} />);

function ListView({ st, set }) {
  const all = store.list('students');
  const rows = all.filter((s) => (st.level === '전체' || (st.level === '초등' ? s.grade[0] === '초' : s.grade[0] !== '초')) &&
    (!st.q || (s.name + s.school + s.className).includes(st.q)));
  const today = D.today();
  return (
    <div className="page">
      <PageHead title="수강생 관리" sub="학생 프로필 허브 — 이름을 누르면 게이트·숙제·약점·학습 플랜을 한 화면에서 봅니다">
        <button className="btn primary" onClick={() => editStudent(null)}>+ 학생 추가</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="재원생" value={all.filter((s) => s.status === '재원').length + '명'} />
        <Kpi label="초등" value={all.filter((s) => s.grade[0] === '초').length + '명'} />
        <Kpi label="중등" value={all.filter((s) => s.grade[0] === '중').length + '명'} />
        <Kpi label="내신기간 학생" value={all.filter((s) => dom.mode(s, today).kind === 'naeshin').length + '명'} note="시험 5주 이내" tone="warn" />
      </div>
      <Card>
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <Field label="검색"><input type="search" value={st.q} placeholder="이름·학교·반" onChange={(e) => set({ q: e.target.value })} /></Field>
            <Field label="구분"><Select options={['전체', '초등', '중등']} value={st.level} onChange={(v) => set({ level: v })} /></Field>
          </div>
          <Table rows={rows} clickable={(s) => go('students/' + s.id)} empty="조건에 맞는 학생이 없습니다" cols={[
            { label: '이름', render: (s) => <b>{s.name}</b> }, { label: '학년', key: 'grade' }, { label: '학교', key: 'school' }, { label: '반', key: 'className' },
            { label: '상태', render: (s) => <Badge tone={s.status === '재원' ? 'ok' : 'gray'}>{s.status}</Badge> },
            { label: '주요 약점', render: (s) => { const w = dom.weaknesses(s.id)[0]; return w ? <Badge tone="warn">{dom.typeName(w.type)}</Badge> : <span className="muted">—</span>; } },
            { label: '시험', render: (s) => { const m = dom.mode(s, today); return m.dn == null ? '—' : <Badge tone={m.kind === 'naeshin' ? 'warn' : 'gray'}>{'D-' + m.dn}</Badge>; } },
          ]} />
        </div>
      </Card>
    </div>
  );
}

const Info = ({ k, children }) => <div><div className="small muted">{k}</div><div>{children || '—'}</div></div>;

// 등록 상담 레벨테스트: 등록 처리 때 연결된 문의 카드(Lead.student_id) 중 가장 최근 것의 총점 + 결과 리포트 열기
function LevelTestCard({ s, set }) {
  const tAt = V.testAt;
  const l = store.list('leads', (x) => x.student_id === s.id).sort((a, b) => (tAt(a) < tAt(b) ? 1 : -1))[0];
  if (!l) return null;
  const t = ltReport.total(l), graded = ltReport.isGraded(l);
  return (
    <Card title="등록 상담 레벨테스트">
      <div className="ltp-sum">
        <Info k="레벨테스트 일시">{D.ymdhm(tAt(l))}</Info><Info k="시험지">{t ? t.form : '—'}</Info>
        <div><div className="small muted">총점</div>{t ? <div className="score">{String(t.value)}<small>{' / ' + t.max + t.unit}</small></div> : <div className="muted">점수 기록 없음</div>}</div>
        <div className="act"><button className="btn primary" disabled={!graded} onClick={() => set({ report: l.id })}>레벨테스트 결과 레포트</button>
          {graded ? null : <div className="small muted" style={{ marginTop: 4 }}>채점 기록 없음</div>}</div>
      </div>
    </Card>
  );
}

function Profile({ id, st, set }) {
  const s = store.get('students', id);
  if (!s) return <div className="page"><PageHead title="수강생 관리" /><Card><Empty>학생을 찾을 수 없습니다</Empty></Card></div>;
  if (st.report) {
    const l = store.get('leads', st.report);
    if (l && l.student_id === s.id) return <ltReport.View l={l} onBack={() => set({ report: null })} />;
    st.report = null;
  }
  const today = D.today();
  const g = dom.guardianOf(s.id);
  const m = dom.mode(s, today);
  const from = D.add(today, -29);
  const hw = dom.hwRate(s.id, from, today), tp = dom.testRate(s.id, from, today);
  const weak = dom.weaknesses(s.id);
  const maxW = weak.length ? weak[0].n : 0;
  const entries = store.list('coachingEntries', (e) => e.student_id === s.id && e.date >= from).length;
  const exams = store.list('assessments', (a) => a.student_id === s.id);
  const tone = (v) => (v == null ? '' : v >= 90 ? 'ok' : v >= 75 ? 'warn' : 'bad');
  return (
    <div className="page">
      <PageHead title={s.name + ' 학생 프로필'} sub={s.school + ' · ' + s.grade + ' · ' + s.className}>
        <button className="btn primary" onClick={() => go('send/' + s.id)}>리포트 발송</button>
        <button className="btn" onClick={() => editStudent(s)}>수정</button>
        <button className="btn" onClick={() => { store.upsert('students', { id: s.id, status: s.status === '재원' ? '휴원·퇴원' : '재원' }); }}>{s.status === '재원' ? '휴원·퇴원 처리' : '재원으로 복귀'}</button>
        <button className="btn danger" onClick={() => confirmBox('이 학생과 관련 기록(코칭 일지·오답·성적)이 모두 삭제됩니다. 계속할까요?', () => {
          ['guardians', 'coachingEntries', 'errorItems', 'assessments', 'remediations', 'messageLogs'].forEach((c) => store.removeWhere(c, (x) => x.student_id === s.id));
          store.remove('students', s.id); go('students');
        }, true)}>삭제</button>
        <a className="btn" href="#/students">← 목록</a>
      </PageHead>
      <Card>
        <div className="grid g4">
          <Info k="이름">{s.name}</Info><Info k="학교 / 학년">{s.school + ' · ' + s.grade}</Info><Info k="반">{s.className}</Info><Info k="담당 강사">{s.teacher}</Info>
          <Info k="학생 전화번호">{s.studentPhone}</Info><Info k="학부모 전화번호">{g && g.parentPhone}</Info>
          <Info k="알림톡 수신동의">{g ? (g.consent ? <Badge tone="ok">동의</Badge> : <Badge tone="bad">미확인</Badge>) : '—'}</Info>
          <Info k="등록일">{s.enrolledAt}</Info>
        </div>
      </Card>
      <LevelTestCard s={s} set={set} />
      <div className="grid g3">
        <Card title="최근 30일 숙제 이행률"><div><div className={'kpi-value ' + tone(hw)}>{hw == null ? '—' : hw + '%'}</div><div className="small muted">{'코칭 기록 ' + entries + '일'}</div></div></Card>
        <Card title="최근 30일 테스트 통과율"><div><div className={'kpi-value ' + tone(tp)}>{tp == null ? '—' : tp + '%'}</div><div className="small muted">게이트·구두 포함</div></div></Card>
        <Card title="다음 학교 시험"><div>{m.dn == null ? <Empty>시험 기간 미입력 (내신 관리)</Empty>
          : <div><div className={'kpi-value ' + (m.kind === 'naeshin' ? 'warn' : '')}>{'D-' + m.dn}</div><div className="small muted">{m.exam.name + ' · ' + m.exam.date + (m.kind === 'naeshin' ? ' · 내신기간 일지' : ' · 정규')}</div></div>}</div></Card>
      </div>
      <div className="grid g2">
        <Card title="약점 기록 (틀린 문항 누적)">
          {weak.length ? <div>{weak.slice(0, 8).map((w) => <Bar key={w.type} label={dom.typeName(w.type)} value={w.n} max={maxW} tone="warn" />)}
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { const top = weak[0]; store.upsert('remediations', { student_id: s.id, type: top.type, basis: '평소 관찰', status: '대기', createdAt: today }); toast('보강 대상으로 지정했습니다'); go('remedial'); }}>가장 많은 유형을 보강 대상으로 지정</button></div>
            : <Empty>아직 기록된 오답이 없습니다</Empty>}
        </Card>
        <Card title="학교 시험 성적">
          <Table rows={exams} empty="기록이 없습니다 (게이트·성적에서 입력)" cols={[{ label: '시험', key: 'name' }, { label: '날짜', key: 'date' }, { label: '점수', key: 'score', class: 'num' }, { label: '등급', key: 'grade' }]} />
        </Card>
      </div>
      <Card title="메모"><p>{s.memo || '—'}</p></Card>
    </div>
  );
}

export default function Students({ arg }) {
  const [st, set] = useViewState('students', { q: '', level: '전체', report: null }); // report = 프로필에서 연 레벨테스트 결과 리포트의 문의 카드 id
  return arg ? <Profile id={arg} st={st} set={set} /> : <ListView st={st} set={set} />;
}
