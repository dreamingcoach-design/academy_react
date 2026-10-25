/* 게이트·성적: 학교 시험 점수·등급, 영역별 오답 분석 */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { Badge, Bar, Card, Empty, Field, Modal, PageHead, Placeholder, Select, Table, Tabs, openModal, toast } from '../ui.jsx';

function ScoreModal({ students, close }) {
  const [f, setF] = useState({ s: students[0].id, name: '', date: D.today(), kind: '중간고사', score: '', grade: '' });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title="학교 시험 점수 입력" onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (f.score === '') { toast('점수를 입력하세요'); return false; }
      store.upsert('assessments', { student_id: f.s, kind: '학교 시험', name: f.name || f.kind, date: f.date, score: +f.score, grade: f.grade });
    } }]}>
      <Field label="학생"><Select options={students.map((s) => ({ value: s.id, label: s.name }))} value={f.s} onChange={up('s')} /></Field>
      <div className="row">
        <Field label="시험명"><input type="text" placeholder="예) 2학기 중간고사" value={f.name} onChange={(e) => up('name')(e.target.value)} /></Field>
        <Field label="구분"><Select options={['중간고사', '기말고사', '수행평가', '기타']} value={f.kind} onChange={up('kind')} /></Field>
      </div>
      <div className="row">
        <Field label="날짜"><input type="date" value={f.date} onChange={(e) => up('date')(e.target.value)} /></Field>
        <Field label="점수"><input type="number" min={0} max={100} value={f.score} onChange={(e) => up('score')(e.target.value)} /></Field>
        <Field label="등급"><input type="text" placeholder="예) 2등급" value={f.grade} onChange={(e) => up('grade')(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
function addScore() {
  const students = dom.activeStudents();
  if (!students.length) { toast('학생이 없습니다'); return; }
  openModal((close) => <ScoreModal students={students} close={close} />);
}

function School() {
  const rows = store.list('assessments', (a) => a.kind === '학교 시험').sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Card title="학교 시험 점수·등급" right={<span className="small muted">반평균·석차는 보류</span>}>
      <Table rows={rows} empty="입력된 학교 시험이 없습니다" cols={[
        { label: '학생', render: (a) => { const s = store.get('students', a.student_id); return s ? s.name : '(삭제됨)'; } },
        { label: '시험', key: 'name' }, { label: '날짜', key: 'date' }, { label: '점수', key: 'score', class: 'num' }, { label: '등급', key: 'grade' },
        { label: '', render: (a) => <button className="btn sm ghost" onClick={() => store.remove('assessments', a.id)}>삭제</button> },
      ]} />
    </Card>
  );
}

function Errors({ st, set }) {
  const students = dom.activeStudents();
  const sel = st.student || 'all';
  const list = store.list('errorItems', (e) => sel === 'all' || e.student_id === sel);
  const byArea = {}, byType = {};
  list.forEach((e) => { byArea[e.area] = (byArea[e.area] || 0) + 1; byType[e.type] = (byType[e.type] || 0) + 1; });
  const areas = Object.keys(byArea).sort((a, b) => byArea[b] - byArea[a]);
  const types = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  const src = {}; list.forEach((e) => { src[e.source] = (src[e.source] || 0) + 1; });
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Field label="학생"><Select options={[{ value: 'all', label: '전체 학생' }].concat(students.map((s) => ({ value: s.id, label: s.name })))} value={sel} onChange={(v) => set({ student: v })} /></Field>
      </div>
      <div className="grid g2">
        <Card title="영역별 오답">{areas.length ? areas.map((a) => <Bar key={a} label={a} value={byArea[a]} max={byArea[areas[0]]} tone="warn" />) : <Empty>기록 없음</Empty>}</Card>
        <Card title="문제유형별 오답">{types.length ? types.slice(0, 10).map((t) => <Bar key={t} label={dom.typeName(t)} value={byType[t]} max={byType[types[0]]} />) : <Empty>기록 없음</Empty>}</Card>
      </div>
      <Card title="출처">
        <div>{Object.keys(src).map((k) => <Badge key={k} tone="gray">{k + ' ' + src[k] + '건'}</Badge>)}
          <p className="small muted">약점 판단 우선순위: 공식 테스트(내신·수행) 오답 &gt; 평소 관찰(숙제 오답 포함) — ENG-REM-01</p></div>
      </Card>
    </div>
  );
}

export default function Grades() {
  const [st, set] = useViewState('grades', { tab: 'school', student: '' });
  const t = [{ id: 'school', label: '학교 시험' }, { id: 'errors', label: '영역·유형별 오답 분석' }, { id: 'gate', label: '게이트' }];
  return (
    <div className="page">
      <PageHead title="게이트·성적" sub="학교 시험 점수와 틀린 문항 누적 분석">
        {st.tab === 'school' ? <button className="btn primary" onClick={addScore}>+ 점수 입력</button> : null}
      </PageHead>
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'school' ? <School /> : st.tab === 'errors' ? <Errors st={st} set={set} />
        : <Placeholder title="게이트 (필기·구두)" sub="게이트 통과 기준·결과 기록" status="다음 단계"
          lines={['통과 기준값은 core/02 규칙 레지스트리(CORE-GATE-01)와 영어 pack 규칙을 따릅니다', '현재는 코칭실 일지의 테스트 통과(○/×)가 기록 단위입니다', '게이트 결과 전용 입력 화면은 규칙 확정 후 추가']} />}
    </div>
  );
}
