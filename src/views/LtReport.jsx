/* 레벨테스트 채점 입력(틀린 문항만, 부분 점수 없음) + 학부모 상담 리포트 (F2/F3). 틀린 문항 칸에 시험지 캡처를 붙여 넣는다(lead.clips)
 * 분석 로직은 lib/analysis.js, 테스트지 키는 leveltest-keys/*.json (data/leveltestForms.js 로 내장) */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { D, store } from '../lib/store.js';
import { useStore } from '../lib/hooks.js';
import { analysis as A } from '../lib/analysis.js';
import { visits as V } from '../lib/visits.js';
import { Badge, Empty, Field, Modal, PageHead, Select, openModal, pickFile, readText, toast } from '../ui.jsx';

const CIRC = ['①', '②', '③', '④', '⑤'];
const AREA_ORDER = ['문법', '독해', '영작', '단어', '듣기'];

const formOf = (l) => (l.testFormId ? store.get('testForms', l.testFormId) : null);
const isGraded = (l) => !!(formOf(l) && l.gradedAt);

// 총점 요약 (학생 프로필 '등록 상담 레벨테스트'): 채점 키가 있으면 점수, 영역 점수만 입력했으면 맞은 개수 합 / 문항 수
function total(l) {
  const f = formOf(l);
  if (f && l.gradedAt) {
    const an = A.analyze(f, l.wrong);
    return { value: an.points, max: an.totalPts, unit: '점', form: f.form.id + ' · ' + f.form.grade + ' 영어' };
  }
  const sc = Object.values(l.scores || {}).filter((s) => s && s.total > 0 && s.correct != null);
  if (!sc.length) return null;
  return { value: sc.reduce((n, s) => n + s.correct, 0), max: sc.reduce((n, s) => n + s.total, 0), unit: '문항', form: '— (영역 점수만 입력)' };
}

function derivedScores(an) {
  const sc = {};
  an.areas.forEach((a) => { sc[a.area] = { total: a.total, correct: a.correct }; });
  return sc;
}

/* ---------- 테스트지 키 가져오기 ---------- */
function importKey() {
  pickFile('.json,application/json', (f) => readText(f, (text) => {
    try {
      const k = JSON.parse(text);
      if (!k.form || !k.form.id || !Array.isArray(k.items) || !k.skillCatalog) throw new Error('테스트지 키 형식이 아닙니다 (form·items·skillCatalog 필요)');
      store.upsert('testForms', Object.assign({ id: k.form.id }, k));
      toast('테스트지 키 가져옴: ' + k.form.id);
    } catch (e) { toast('가져오지 못했습니다: ' + e.message); }
  }));
}

/* ---------- 채점 입력: 틀린 문항만 ---------- */
function GradeModal({ l, close }) {
  const fs = store.list('testForms');
  const [formId, setFormId] = useState(l.testFormId || fs[0].id);
  const [wrong, setWrong] = useState(() => JSON.parse(JSON.stringify(l.wrong || {})));
  const f = store.get('testForms', formId);
  const setW = (no, patch) => setWrong(Object.assign({}, wrong, { [no]: Object.assign({}, wrong[no], patch) }));
  const toggleNo = (no) => { const n = Object.assign({}, wrong); if (n[no]) delete n[no]; else n[no] = { pick: null, earned: 0, err: [] }; setWrong(n); };
  const nos = Object.keys(wrong).map(Number).filter((no) => f.items.some((x) => x.no === no)).sort((a, b) => a - b);
  const an = A.analyze(f, wrong);

  return (
    <Modal title={l.student + ' · 레벨테스트 채점 입력'} wide onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      const w = {};
      nos.forEach((n) => { w[n] = Object.assign({}, wrong[n], { earned: 0 }); }); // 부분 점수 없음
      const a = A.analyze(f, w);
      // 시험지를 바꾸면 문항 번호가 달라지므로 붙여 둔 문항 캡처도 비운다
      const clips = l.testFormId && l.testFormId !== f.id ? {} : (l.clips || {});
      store.upsert('leads', { id: l.id, testFormId: f.id, wrong: w, scores: derivedScores(a), gradedAt: D.today(), reportEdits: {}, clips: clips });
    } }]}>
      <p className="small muted">틀린 문항 번호만 눌러 표시하세요(빨강). 부분 점수는 없습니다. 객관식은 학생이 고른 보기를, 서술형·영작은 오류 유형(왜 틀렸는지)과 학생이 쓴 답을 입력하면 근본 원인 분석이 더 정확해집니다.</p>
      <Field label="테스트지">
        <Select options={fs.map((x) => ({ value: x.id, label: x.form.id + ' · ' + x.form.grade + ' 영어 (' + x.items.length + '문항)' }))} value={formId}
          onChange={(v) => { setFormId(v); setWrong({}); }} />
      </Field>
      <div>
        {AREA_ORDER.map((area) => {
          const its = f.items.filter((i) => i.area === area);
          if (!its.length) return null;
          return (
            <div key={area} className="lt-garea"><b>{area}</b>
              {its.map((i) => <button key={i.no} type="button" className={'lt-no' + (wrong[i.no] ? ' wrong' : '')} title={i.unit + ' · ' + i.pts + '점'} onClick={() => toggleNo(i.no)}>{String(i.no)}</button>)}
            </div>
          );
        })}
      </div>
      <div className="lt-sum small muted">
        {'틀린 문항 ' + an.wrongNos.length + '개 · 예상 총점 ' + an.points + ' / ' + an.totalPts + (l.grade && f.form.grade !== l.grade ? ' · 주의: 학생 학년(' + l.grade + ')과 테스트지 학년(' + f.form.grade + ')이 다릅니다' : '')}
      </div>
      <div>
        {nos.map((no) => {
          const it = f.items.find((x) => x.no === no), w = wrong[no];
          const errs = Object.keys(it.err || {});
          return (
            <div key={no} className="lt-row">
              <div className="lt-title"><b>{no + '번 '}</b><Badge tone="gray">{it.area}</Badge>{' '}<span className="small muted">{it.unit + ' · ' + it.pts + '점'}</span></div>
              {it.kind === 'mc' ? [
                <div key="c" className="chips">{[1, 2, 3, 4, 5].map((c) => (
                  <button key={c} type="button" className={'chip' + (w.pick === c ? ' on' : '')} disabled={c === it.ans} title={c === it.ans ? '정답 보기' : ''}
                    onClick={() => setW(no, { pick: w.pick === c ? null : c })}>{CIRC[c - 1]}</button>
                ))}</div>,
                <span key="s" className="small muted">{w.pick ? '고른 보기 ' + CIRC[w.pick - 1] : '고른 보기를 모르면 비워 두세요'}</span>,
              ] : [
                <input key="t" type="text" className="lt-text" placeholder="학생이 쓴 답 (선택 — 리포트에 그대로 보여 줍니다)" value={w.text || ''} onChange={(ev) => setW(no, { text: ev.target.value })} />,
                errs.length ? <div key="e" className="lt-errs">{errs.map((code) => (
                  <label key={code} className="lt-err">
                    <input type="checkbox" checked={(w.err || []).indexOf(code) >= 0} onChange={(ev) => {
                      const cur = (w.err || []).filter((x) => x !== code);
                      setW(no, { err: ev.target.checked ? cur.concat([code]) : cur });
                    }} />
                    <span>{it.err[code]}</span>
                  </label>
                ))}</div> : null,
              ]}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
function grade(l) {
  if (!store.list('testForms').length) { toast('등록된 테스트지 키가 없습니다. 레벨테스트 탭에서 키를 가져오세요'); return; }
  openModal((close) => <GradeModal l={l} close={close} />);
}

/* ---------- 문항 캡처 칸: 클릭 후 Ctrl+V(이미지·텍스트), 끌어다 놓기, 파일 선택 ---------- */
const CLIP_MAX_W = 1200;
// 붙여 넣은 이미지를 가로 1200px 이하로 줄여 저장한다 (브라우저 저장 공간 절약)
function shrink(file) {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, CLIP_MAX_W / img.naturalWidth), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let d = c.toDataURL('image/webp', 0.86);
      if (d.indexOf('data:image/webp') !== 0) d = c.toDataURL('image/jpeg', 0.86);
      ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('이미지를 읽지 못했습니다')); };
    img.src = url;
  });
}
function clipBytes() {
  return store.list('leads').reduce((s, x) => s + Object.keys(x.clips || {}).reduce((t, k) => t + ((x.clips[k].src || x.clips[k].text || '').length), 0), 0);
}

function ClipBox({ l, k, hint }) {
  const zone = useRef(null);
  const c = ((store.get('leads', l.id) || {}).clips || {})[k];
  // 이 칸은 붙여넣기 전용이다: 직접 타이핑·삭제는 막는다 (React onBeforeInput 은 삭제를 못 막아 원래 이벤트에 건다)
  useEffect(() => {
    const el = zone.current;
    const block = (e) => e.preventDefault();
    el.addEventListener('beforeinput', block);
    return () => el.removeEventListener('beforeinput', block);
  });
  function save(clip) {
    const cur = Object.assign({}, (store.get('leads', l.id) || {}).clips || {});
    if (clip) cur[k] = clip; else delete cur[k];
    store.upsert('leads', { id: l.id, clips: cur });
    if (clipBytes() > 3500000) toast('붙여 넣은 캡처가 많아 브라우저 저장 공간이 거의 찼습니다. 오래된 리포트의 캡처를 지워 주세요');
  }
  const takeFile = (file) => { shrink(file).then((src) => save({ type: 'img', src: src })).catch((e) => toast(e.message)); };
  const onPaste = (e) => {
    e.preventDefault();
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const im = items.find((x) => x.kind === 'file' && /^image\//.test(x.type));
    if (im) { takeFile(im.getAsFile()); return; }
    const txt = (e.clipboardData.getData('text/plain') || '').trim();
    if (txt) save({ type: 'text', text: txt });
  };
  const onDrop = (e) => {
    e.preventDefault();
    const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => /^image\//.test(x.type));
    if (f) takeFile(f);
  };
  // 내용이 바뀌면 칸을 새로 만든다 (입력기 조합 글자 등 브라우저가 직접 넣은 것을 지운다)
  const zoneKey = c ? c.type + ':' + (c.src || c.text || '').length + ':' + (c.src || c.text || '').slice(-24) : 'empty';
  return (
    <div className={'q-clip' + (c ? '' : ' empty no-print-empty')}>
      <div key={zoneKey} ref={zone} className="q-zone" contentEditable="true" suppressContentEditableWarning spellCheck="false" tabIndex={0}
        onPaste={onPaste} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {!c ? <span className="q-hint">{hint || '여기를 클릭한 뒤 Ctrl+V로 문항 캡처를 붙여 넣으세요'}</span>
          : c.type === 'img' ? <img src={c.src} alt="문항 캡처" /> : <div className="q-text">{c.text}</div>}
      </div>
      <div className="q-tools no-print">
        <button type="button" className="btn sm" onClick={() => pickFile('image/*', takeFile)}>{c ? '이미지 바꾸기' : '파일 선택'}</button>
        {c ? <button type="button" className="btn sm" onClick={() => save(null)}>지우기</button> : null}
      </div>
    </div>
  );
}

// 문구 칸: 자동 문구를 기본으로 보여 주고, 고치면 그 값을 저장(재채점하면 초기화). 글자는 DOM 이 들고 있고 React 는 포커스가 없을 때만 맞춘다
function Ed({ l, k, auto, tag, cls }) {
  const ref = useRef(null);
  const edits = l.reportEdits || {};
  const text = edits[k] != null ? edits[k] : auto;
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== text) el.textContent = text;
  });
  const Tag = tag || 'p';
  return <Tag ref={ref} className={'ed' + (cls ? ' ' + cls : '')} contentEditable="true" suppressContentEditableWarning spellCheck="false" onBlur={(e) => {
    const txt = e.currentTarget.textContent.trim(), cur = Object.assign({}, (store.get('leads', l.id) || {}).reportEdits || {});
    if (txt && txt !== auto) cur[k] = txt; else delete cur[k];
    store.upsert('leads', { id: l.id, reportEdits: cur });
  }} />;
}

/* ---------- 리포트 (1쪽 결과 요약 / 2~3쪽 영역·단원별 틀린 문항과 정리) ---------- */
const unitLabel = (u) => String(u).replace(/^독해 P(\d+)$/, '독해 지문 $1');

function ReportView({ l, onBack }) {
  useStore();
  const f = formOf(l);
  const head = (
    <PageHead title={'레벨테스트 결과 리포트 · ' + l.student} sub="학부모 상담용 리포트 — 문구는 클릭해서 고치고, 틀린 문항 칸에는 시험지 캡처를 붙여 넣으세요">
      <button className="btn" onClick={onBack}>‹ 목록</button>
      <button className="btn" onClick={() => { store.upsert('leads', { id: l.id, reportEdits: {} }); }}>자동 문구로 되돌리기</button>
      <button className="btn" onClick={() => grade(l)}>채점 수정</button>
      <button className="btn primary" onClick={() => window.print()}>인쇄 / PDF 저장</button>
    </PageHead>
  );
  if (!f || !l.gradedAt) return <div className="page">{head}<Empty>채점 입력이 끝난 뒤에 리포트가 만들어집니다</Empty></div>;

  const an = A.analyze(f, l.wrong), nr = A.narrative(f, an), good = A.strengths(f, an, 4);
  const byNo = {}; f.items.forEach((i) => { byNo[i.no] = i; });
  const isWrong = (n) => an.wrongNos.indexOf(n) >= 0;
  const causeBy = {}; nr.causes.forEach((c) => { causeBy[c.code] = c; });
  const ed = (key, auto, tag, cls) => <Ed key={key} l={l} k={key} auto={auto} tag={tag} cls={cls} />;

  /* 1쪽: 결과 요약 */
  const dots = (nos) => <span className="ltr-dots">{nos.map((n) => <i key={n} className={isWrong(n) ? 'x' : undefined} />)}<small>{nos.filter((n) => !isWrong(n)).length + '/' + nos.length}</small></span>;
  const unitRows = (us, key) => <div key={key} className="ltr-ugrid">{us.map((u) => <div key={u.unit} className="ltr-urow"><span>{unitLabel(u.unit)}</span>{dots(u.items)}</div>)}</div>;
  const weakU = an.units.filter((u) => !u.advanced && u.correct / u.total <= 0.5);
  const okU = an.units.filter((u) => !u.advanced && u.correct / u.total > 0.5), advU = an.units.filter((u) => u.advanced);
  const hasListening = an.areas.some((a) => a.area === '듣기');
  const pane = (cls, title, rows, empty) => <div className={'ltr-pane ' + cls}><h4>{title}</h4>{rows.length ? <ul>{rows}</ul> : <p className="small">{empty}</p>}</div>;

  const p1 = (
    <div className="ltr">
      <div className="ltr-head"><div><div className="ltr-brand">SNP 영어학원</div><h1>레벨테스트 결과 리포트</h1></div><div className="small" style={{ color: '#5b6478' }}>{D.ymdhm(V.testAt(l)).slice(0, 10)}</div></div>
      <table className="ltr-info"><tbody>
        <tr>{['학생', '학교 · 학년', '시험지', '문항 수', '정답', '오답', '총점'].map((t) => <th key={t}>{t}</th>)}</tr>
        <tr><td>{l.student}</td><td>{[l.school, l.grade].filter(Boolean).join(' · ') || '-'}</td><td>{f.form.grade + ' 영어'}</td>
          <td>{String(f.items.length)}</td><td>{String(an.correctCount)}</td><td className="bad">{String(an.wrongNos.length)}</td>
          <td className="score">{String(an.points)}<small>{' / ' + an.totalPts}</small></td></tr>
      </tbody></table>

      <h2>① 한눈에 보기</h2>
      {nr.summary.map((t, i) => ed('s' + i, t))}

      <h2>② 영역별 결과</h2>
      {an.areas.map((a) => (
        <div key={a.area} className="ltr-bar"><b>{a.area}</b>
          <div className="track"><i style={{ width: (a.correct / a.total * 100) + '%' }} /></div>
          <div className="n"><b>{String(a.correct)}</b><small>{' / ' + a.total + '문항'}</small></div></div>
      ))}
      {hasListening ? null : <div className="ltr-bar off"><b>듣기</b><span>이번 테스트에는 포함되지 않았습니다</span><span /></div>}

      <h2>③ 단원별 결과</h2>
      {weakU.length ? [<div key="wh" className="ltr-usec w">{'보완이 필요한 단원 (' + weakU.length + ')'}</div>, unitRows(weakU, 'wr')] : null}
      {okU.length ? [<div key="oh" className="ltr-usec o">{'비교적 안정적인 단원 (' + okU.length + ')'}</div>, unitRows(okU, 'or')] : null}
      {advU.length ? [<div key="ah" className="ltr-usec a">상위 학년 심화</div>, unitRows(advU, 'ar')] : null}
      <div className="ltr-legend"><span className="ltr-dots"><i /></span>맞음<span className="ltr-dots"><i className="x" /></span>틀림</div>

      <h2>④ 잘 해낸 부분과 집중 보완할 부분</h2>
      <div className="ltr-two">
        {pane('good', '잘 해낸 부분', good.map((g, i) => <li key={i}><span className="ltr-tag">{g.area}</span>
          <span>{g.title + (g.sub ? ' (' + g.sub + ')' : '')}<em>{g.line}</em></span></li>), '한 단원·개념을 모두 맞힌 경우가 아직 없습니다. 수업에서 강점을 함께 찾아가겠습니다.')}
        {pane('weak', '집중 보완할 부분', nr.causes.map((c) => <li key={c.code}><span className={'ltr-tag ' + c.level}>{c.rank}</span>
          <span>{c.title}<em>{c.short}</em></span></li>), an.wrongNos.length ? '반복되는 공통 개념이 뚜렷하지 않았습니다.' : '틀린 문항이 없습니다.')}
      </div>
      {an.wrongNos.length ? <p className="ltr-foot">실제로 틀린 문항은 다음 쪽에 영역·단원별로 모았습니다.</p> : null}
    </div>
  );

  /* 2~3쪽: 영역·단원별 틀린 문항 (단원당 최대 4개) + 정리 */
  const card = (no) => {
    const it = byNo[no], w = l.wrong[no] || {}, c = causeBy[an.causeOf[no]];
    const ans = it.kind === 'mc'
      ? [<span key="m" className="q-mine">{'학생 ' + (w.pick ? CIRC[w.pick - 1] : '—')}</span>, <span key="r" className="q-right">{'정답 ' + CIRC[it.ans - 1]}</span>]
      : <span className="q-mine">오답</span>;
    return (
      <div key={no} className="q-card">
        <div className="q-hd"><b>{no + '번'}</b>{c ? <span className={'q-cause ' + c.level} title={c.title}>{c.rank}</span> : null}<span className="q-ans">{ans}</span></div>
        <ClipBox l={l} k={String(no)} />
        {it.kind !== 'mc' && (w.text || it.model) ? (
          <div className="q-written">
            {w.text ? <div><span className="lb bad">학생 답</span><span>{w.text}</span></div> : null}
            {it.model ? <div><span className="lb ok">모범 답안</span><span>{it.model}</span></div> : null}
          </div>
        ) : null}
        {ed('n' + no, A.itemNote(f, it, w), 'p', 'q-note')}
      </div>
    );
  };
  const groups = an.units.map((u) => ({ u: u, nos: u.items.filter(isWrong).slice(0, 4) })).filter((g) => g.nos.length);
  // 단원 묶음은 카드 칸 수만큼 폭을 잡고 한 줄에 이어 붙인다 (1문항 = 1칸, 2문항 = 2칸, 3문항 이상 = 한 줄)
  const group = (g) => (
    <div key={g.u.unit} className={'ug n' + g.nos.length}>
      <div className="ug-hd"><span className="ug-area">{g.u.area}</span><b>{unitLabel(g.u.unit)}</b>
        <small>{(g.u.total - g.u.correct) + ' / ' + g.u.total + '문항 틀림' + (g.u.advanced ? ' · 상위 학년 심화' : '')}</small></div>
      <div className="ug-cards">{g.nos.map(card)}</div>
    </div>
  );
  const gram = groups.filter((g) => g.u.area === '문법'), rest = groups.filter((g) => g.u.area !== '문법');
  const restAreas = AREA_ORDER.filter((a) => rest.some((g) => g.u.area === a));
  const count = (gs) => gs.reduce((s, g) => s + g.nos.length, 0);
  const passages = Object.keys(f.passages || {}).filter((p) => an.wrongNos.some((n) => byNo[n].passage === p));
  const links = nr.links.slice(0, 1);
  // 1쪽·단원 머리줄과 겹치는 주의 문구는 뺀다 (듣기 미포함·영역 문항 수·심화 안내)
  const notes = nr.notes.filter((n) => !/듣기는|문항만 출제|문항이라 점수보다|심화 문항입니다/.test(n));

  const p2 = (
    <div className="ltr">
      <div className="ltr-run"><span>{'SNP 영어학원 · ' + l.student + ' 레벨테스트 결과 리포트'}</span><span>틀린 문항 살펴보기</span></div>
      <h2>⑤ 영역·단원별 틀린 문항</h2>
      <p className="ltr-intro">단원별로 틀린 문항을 모았습니다(단원당 최대 4문항). 빨간 태그는 1쪽 ‘집중 보완할 부분’의 원인입니다.</p>
      {gram.length ? [<h3 key="gh">문법 <small>{count(gram) + '문항'}</small></h3>, <div key="gf" className="ug-flow">{gram.map(group)}</div>] : null}
      {rest.length ? <h3>{restAreas.join(' · ') + ' '}<small>{count(rest) + '문항'}</small></h3> : null}
      {passages.length ? <div className="q-pass">{passages.map((p) => (
        <div key={p} className="q-card">
          <div className="q-hd"><b>{'독해 지문 ' + p.replace(/^P/, '')}</b><span className="q-unit">{(f.passages[p].items || []).join('·') + '번'}</span></div>
          <ClipBox l={l} k={p} hint="클릭한 뒤 Ctrl+V로 지문 캡처를 붙여 넣으세요" />
        </div>
      ))}</div> : null}
      {rest.length ? <div className="ug-flow">{rest.map(group)}</div> : null}

      <h2>⑥ 정리</h2>
      <div className="ltr-link">
        {nr.closing ? <div className="row"><b>우선순위</b>{ed('closing', nr.closing, 'span')}</div> : null}
        {links.map((t, i) => <div key={i} className="row"><b>영역 간 연결</b>{ed('k' + i, t, 'span')}</div>)}
        {notes.map((n, i) => <div key={i} className="note">{'※ ' + n}</div>)}
      </div>
    </div>
  );

  return <div className="page">{head}<div className="ltr-wrap">{p1}{an.wrongNos.length ? p2 : null}</div></div>;
}

export const ltReport = { grade, View: ReportView, importKey, isGraded, formOf, total };
