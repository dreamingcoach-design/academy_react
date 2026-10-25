/* 강사 평가 (F12, core/09 §11): 문항별 누적 평균 + 코멘트 모음 → 코멘트 클릭 시 그 학생의 설문 원본
 * 원본을 보고 왜곡 의심 응답은 "집계 제외"로 거른다(삭제하지 않음). 문항은 teacher-eval-form.md v0.2 고정. */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { Badge, Card, Empty, Field, Kpi, Modal, PageHead, Select, Table, Tabs, openModal, readText, toast } from '../ui.jsx';

const QUESTIONS = [
  '선생님의 설명을 듣고 수업 내용을 충분히 이해할 수 있다.',
  '수업 시간에 집중할 수 있도록 반 분위기를 잘 관리해 주신다.',
  '수업 진도의 속도와 난이도가 나에게 맞다.',
  '숙제의 양이 적당하고, 숙제가 실력에 도움이 된다.',
  '코칭 선생님의 숙제 검사와 구두 테스트가 공부에 도움이 된다.',
  '학원에 다니면서 영어 실력이 늘고 있다고 느낀다.',
  '전체적으로 이 선생님의 수업에 만족한다.',
];

const linkOf = (r) => store.get('surveyLinks', r.link_id) || {};
const roundOf = (r) => store.get('surveyRounds', r.round_id) || {};
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const fmt = (v) => (v == null ? '—' : v.toFixed(1));
const tone = (v) => (v == null ? '' : v >= 4 ? 'ok' : v >= 3 ? '' : 'bad');
const roundsSorted = () => store.list('surveyRounds').sort((a, b) => (a.start < b.start ? -1 : 1));

function teachers() {
  return Array.from(new Set(store.list('surveyLinks').map((l) => l.teacher))).sort();
}

// 강사(+회차)에 해당하는 응답. includeExcluded=false 면 집계 제외분을 뺀다
function responses(teacher, round, includeExcluded) {
  return store.list('surveyResponses', (r) => {
    if (!includeExcluded && r.excluded) return false;
    if (round !== 'all' && r.round_id !== round) return false;
    return linkOf(r).teacher === teacher;
  });
}

/* ---------- 설문 원본 (코멘트 클릭 시) ---------- */
function OriginalModal({ resId, focusQ, close }) {
  const r = store.get('surveyResponses', resId);
  const [reason, setReason] = useState((r && r.excludeReason) || '');
  if (!r) return null;
  const l = linkOf(r);
  // 같은 반·같은 회차의 다른 학생 평균과 나란히 보여 줘서 튀는 응답을 알아보게 한다
  const peers = store.list('surveyResponses', (x) => x.link_id === r.link_id && x.id !== r.id && !x.excluded);
  return (
    <Modal title="설문 원본" wide onClose={close} actions={[{ label: '닫기' }, r.excluded
      ? { label: '집계에 다시 포함', kind: 'primary', onClick: () => { store.upsert('surveyResponses', { id: r.id, excluded: false, excludeReason: '' }); toast('집계에 포함했습니다'); } }
      : { label: '집계에서 제외', kind: 'danger', onClick: () => {
        if (!reason.trim()) { toast('제외 사유를 적어 주세요'); return false; }
        store.upsert('surveyResponses', { id: r.id, excluded: true, excludeReason: reason.trim() }); toast('집계에서 제외했습니다');
      } }]}>
      <p className="small muted">{[roundOf(r).name, l.className, l.teacher + ' 선생님반', r.grade, '제출 ' + r.submittedAt, r.source].filter(Boolean).join(' · ')}</p>
      {r.excluded ? <p><Badge tone="bad">집계 제외됨</Badge>{' ' + (r.excludeReason || '')}</p> : null}
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>문항</th><th className="num">이 학생</th><th className="num">같은 반 평균</th><th>코멘트</th></tr></thead>
        <tbody>{QUESTIONS.map((q, i) => {
          const peer = avg(peers.map((x) => x.scores[i]));
          const gap = peer == null ? 0 : r.scores[i] - peer;
          return (
            <tr key={i} style={i === focusQ ? { background: 'var(--primary-soft)' } : undefined}>
              <td><b>{(i + 1) + '. '}</b>{q}</td>
              <td className="num"><b>{r.scores[i]}</b> / 5</td>
              <td className="num muted">{fmt(peer)}{Math.abs(gap) >= 2 ? [' ', <Badge key="g" tone="warn">{(gap > 0 ? '+' : '') + gap.toFixed(1)}</Badge>] : null}</td>
              <td>{r.comments[i] || <span className="muted">(코멘트 없음)</span>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <p className="small muted" style={{ marginTop: 8 }}>같은 반 평균과 2점 이상 차이 나는 문항에 표시가 붙습니다. 왜곡이 의심되면 집계에서 제외하세요. 원본은 삭제되지 않고, 언제든 다시 포함할 수 있습니다.</p>
      {r.excluded ? null : <Field label="제외 사유"><input type="text" value={reason} placeholder="예: 모든 문항 1점, 근거 없는 비난" onChange={(e) => setReason(e.target.value)} /></Field>}
    </Modal>
  );
}
const openOriginal = (resId, focusQ) => openModal((close) => <OriginalModal resId={resId} focusQ={focusQ} close={close} />);

/* ---------- 결과 (문항별 누적 평균 + 코멘트) ---------- */
function Result({ st, set }) {
  const ts = teachers();
  if (!ts.length) return <Card><Empty>아직 설문 결과가 없습니다. "가져오기" 탭에서 구글폼 응답을 불러오세요.</Empty></Card>;
  if (!ts.includes(st.teacher)) st.teacher = ts[0];
  const rounds = roundsSorted();
  const counted = responses(st.teacher, st.round, false);
  const all = responses(st.teacher, st.round, true);
  const excludedN = all.length - counted.length;
  const total = avg(counted.map((r) => r.scores[6]));

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
        <Field label="강사"><Select options={ts} value={st.teacher} onChange={(v) => set({ teacher: v })} /></Field>
        <Field label="회차"><Select options={[{ value: 'all', label: '누적 (전체 회차)' }].concat(rounds.slice().reverse().map((r) => ({ value: r.id, label: r.name })))} value={st.round} onChange={(v) => set({ round: v })} /></Field>
      </div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="7번 종합 만족도" value={fmt(total) + ' / 5'} note="집계 포함 응답 기준" tone={tone(total)} />
        <Kpi label="집계 응답" value={counted.length + '건'} note={st.round === 'all' ? rounds.length + '개 회차 누적' : '이 회차'} />
        <Kpi label="집계 제외" value={excludedN + '건'} note="원본을 보고 원장이 제외" tone={excludedN ? 'warn' : ''} />
        <Kpi label="과정 평균 (1~5번)" value={fmt(avg(counted.map((r) => avg(r.scores.slice(0, 5))))) + ' / 5'} note={'결과 평균 (6~7번) ' + fmt(avg(counted.map((r) => avg(r.scores.slice(5))))) + ' / 5'} />
      </div>
      <div className="grid" style={{ gap: 14 }}>
        {QUESTIONS.map((q, i) => {
          const v = avg(counted.map((r) => r.scores[i]));
          const dist = [5, 4, 3, 2, 1].map((n) => counted.filter((r) => r.scores[i] === n).length);
          // 코멘트는 최신 회차부터. 제외된 응답의 코멘트도 보이되 표시를 붙인다
          const cs = all.filter((r) => r.comments[i]).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
          return (
            <Card key={i} title={(i + 1) + '. ' + q}>
              <div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className={'kpi-value ' + tone(v)}>{fmt(v)}<span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> / 5점 만점</span></div>
                  <div className="small muted">{dist.map((n, k) => (5 - k) + '점 ' + n + '명').join(' · ')}</div>
                </div>
                {/* 회차별 추이 (누적 보기에서만) */}
                {st.round === 'all' && rounds.length > 1 ? (
                  <div className="small muted" style={{ marginTop: 4 }}>회차별: {rounds.map((rd, k) => {
                    const rv = avg(responses(st.teacher, rd.id, false).map((r) => r.scores[i]));
                    return <span key={rd.id}>{(k ? ' → ' : '') + rd.name + ' '}<b>{fmt(rv)}</b></span>;
                  })}</div>
                ) : null}
                <h3 className="small" style={{ margin: '14px 0 4px' }}>{'학생 코멘트 ' + cs.length + '건'}</h3>
                {cs.length ? <ul className="list">{cs.map((r) => (
                  <li key={r.id} style={{ cursor: 'pointer', justifyContent: 'flex-start', opacity: r.excluded ? 0.55 : undefined }} title="눌러서 이 학생의 설문 원본 보기" onClick={() => openOriginal(r.id, i)}>
                    <Badge tone={r.scores[i] <= 3 ? 'warn' : 'gray'}>{r.scores[i] + '점'}</Badge>
                    <span className="grow">{r.comments[i]}</span>
                    <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{[roundOf(r).name, r.grade].filter(Boolean).join(' · ')}</span>
                    {r.excluded ? <Badge tone="bad">제외</Badge> : null}
                    <span className="muted">›</span>
                  </li>
                ))}</ul> : <Empty>코멘트가 없습니다</Empty>}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>평균은 "집계 제외"하지 않은 응답만으로 계산합니다. 코멘트를 누르면 그 학생이 낸 설문 전체(7문항 점수·코멘트)를 볼 수 있습니다.</p>
    </div>
  );
}

/* ---------- 회차 관리 ---------- */
function NewRoundModal({ close }) {
  const t = D.today();
  const classes = Array.from(new Set(store.list('students', (s) => s.status === '재원' && /^[중고]/.test(s.grade)).map((s) => s.className)));
  const rows = classes.map((c) => ({ id: c, c: c, target: store.list('students', (s) => s.status === '재원' && s.className === c).length }));
  const [f, setF] = useState({ name: (new Date().getMonth() + 1) + '월 평가', start: t, end: D.add(t, 7) });
  const [tch, setTch] = useState({});
  const up = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
  return (
    <Modal title="설문 회차 만들기" wide onClose={close} actions={[{ label: '취소' }, { label: '만들기', kind: 'primary', onClick: () => {
      if (rows.some((r) => !(tch[r.c] || '').trim())) { toast('반마다 담당 강사를 입력하세요'); return false; }
      const rd = store.upsert('surveyRounds', { name: f.name.trim(), start: f.start, end: f.end, formVersion: 'v0.2', status: '진행' });
      rows.forEach((r) => store.upsert('surveyLinks', { round_id: rd.id, className: r.c, teacher: tch[r.c].trim(), token: Math.random().toString(36).slice(2, 10), expires: f.end, target: r.target }));
      toast('회차를 만들었습니다');
    } }]}>
      <Field label="회차 이름"><input type="text" value={f.name} onChange={up('name')} /></Field>
      <div className="row"><Field label="시작"><input type="date" value={f.start} onChange={up('start')} /></Field><Field label="마감"><input type="date" value={f.end} onChange={up('end')} /></Field></div>
      <p className="small muted">중·고등 반만 대상입니다. 반마다 제출 링크가 하나씩 만들어집니다.</p>
      <Table rows={rows} empty="중·고등 재원생이 있는 반이 없습니다" cols={[
        { label: '반', render: (r) => r.c },
        { label: '담당 강사', render: (r) => <input type="text" value={tch[r.c] || ''} placeholder="담당 강사" onChange={(e) => setTch(Object.assign({}, tch, { [r.c]: e.target.value }))} /> },
        { label: '대상 인원', render: (r) => r.target + '명', class: 'num' },
      ]} />
    </Modal>
  );
}

function Rounds() {
  const rs = roundsSorted().reverse();
  return (
    <div>{rs.length ? rs.map((rd) => {
      const links = store.list('surveyLinks', (l) => l.round_id === rd.id);
      return (
        <Card key={rd.id} title={rd.name + ' (' + D.md(rd.start) + ' ~ ' + D.md(rd.end) + ')'} right={<Badge tone={rd.status === '진행' ? 'ok' : 'gray'}>{rd.status || ''}</Badge>}>
          <Table rows={links} cols={[
            { label: '반', key: 'className' }, { label: '강사', key: 'teacher' },
            { label: '응답 / 대상', class: 'num', render: (l) => {
              const n = store.list('surveyResponses', (r) => r.link_id === l.id).length;
              return [n + ' / ' + l.target + '명', n > l.target ? [' ', <Badge key="b" tone="warn">대상보다 많음 — 중복 제출 확인</Badge>] : null];
            } },
            { label: '제출 링크', render: (l) => <span className="small muted">{'/s/' + l.token + ' (서버 구축 후 활성)'}</span> },
          ]} />
        </Card>
      );
    }) : <Card><Empty>만든 회차가 없습니다</Empty></Card>}</div>
  );
}

/* ---------- 가져오기 (과도기: 구글폼 CSV) ---------- */
// 구글폼 열 순서: 타임스탬프, 반, 학년, 1번 점수, 1번 코멘트, … 7번 점수, 7번 코멘트 (core/09 §11-3)
function parseCSV(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function Importer() {
  const rs = roundsSorted().reverse();
  const [round, setRound] = useState(rs.length ? rs[0].id : '');
  if (!rs.length) return <Card><Empty>먼저 "회차 관리"에서 회차를 만드세요.</Empty></Card>;
  const roundId = rs.some((r) => r.id === round) ? round : rs[0].id;
  const run = (text) => {
    const rows = parseCSV(text.replace(/^﻿/, '')).slice(1);
    const links = store.list('surveyLinks', (l) => l.round_id === roundId);
    let ok = 0; const bad = [];
    rows.forEach((r, i) => {
      const link = links.find((l) => l.className === (r[1] || '').trim());
      const scores = []; const comments = [];
      for (let k = 0; k < 7; k++) { scores.push(parseInt(r[3 + k * 2], 10)); comments.push((r[4 + k * 2] || '').trim()); }
      if (!link || scores.some((s) => !(s >= 1 && s <= 5))) { bad.push(i + 2); return; }
      store.upsert('surveyResponses', { round_id: roundId, link_id: link.id, grade: (r[2] || '').trim(), scores: scores, comments: comments,
        submittedAt: (r[0] || '').trim(), source: '구글폼 가져오기', excluded: false, excludeReason: '' });
      ok++;
    });
    toast(ok + '건 가져옴' + (bad.length ? ' · 건너뜀 ' + bad.length + '건' : ''));
    if (bad.length) openModal((close) => <Modal title="가져오지 못한 행" onClose={close}><p>{'행 번호: ' + bad.join(', ') + ' — 반 이름이 회차의 반과 다르거나 점수가 1~5가 아닙니다.'}</p></Modal>);
  };
  return (
    <Card title="구글폼 응답 가져오기">
      <div>
        <Field label="넣을 회차"><Select options={rs.map((r) => ({ value: r.id, label: r.name }))} value={roundId} onChange={setRound} /></Field>
        <p className="small muted">구글 시트 → 파일 → 다운로드 → CSV. 열 순서는 타임스탬프, 반, 학년, 1번 점수, 1번 코멘트 … 7번 점수, 7번 코멘트입니다. 반 이름은 회차의 반 이름과 똑같아야 합니다.</p>
        <label className="btn primary">CSV 파일 선택<input type="file" accept=".csv" style={{ display: 'none' }} onChange={(ev) => {
          const file = ev.target.files[0]; if (!file) return;
          readText(file, run); ev.target.value = '';
        }} /></label>
      </div>
    </Card>
  );
}

export default function TeacherEval() {
  const [st, set] = useViewState('teachereval', { tab: 'result', teacher: null, round: 'all' });
  const t = [{ id: 'result', label: '결과' }, { id: 'rounds', label: '회차 관리' }, { id: 'import', label: '가져오기' }];
  return (
    <div className="page">
      <PageHead title="강사 평가" sub="중·고등 무기명 설문 · 문항별 누적 평균과 학생 코멘트 (F12)">
        <button className="btn primary" onClick={() => openModal((close) => <NewRoundModal close={close} />)}>+ 회차 만들기</button>
      </PageHead>
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'result' ? <Result st={st} set={set} /> : st.tab === 'rounds' ? <Rounds /> : <Importer />}
    </div>
  );
}
