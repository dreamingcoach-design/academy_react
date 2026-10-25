/* 설정: 규칙·훅·채널 / 문항 맵 / 문제유형 마스터 / 문제은행·영상 / 데이터 관리 */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { go } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { sender } from '../lib/sender.js';
import { Badge, Card, Field, Modal, PageHead, Placeholder, Select, Table, confirmBox, copyText, download, openModal, readText, toast } from '../ui.jsx';
import { leadMsg as LM } from './LeadMsg.jsx';

const AREAS = ['단어', '독해', '문법', '영작', '듣기'];

// 알림톡 발송 설정: 발송 서버 주소·토큰(이 기기에만 저장) + 템플릿별 SOLAPI 템플릿 ID·카카오 심사 상태
function AlimtalkCard() {
  const [c, setC] = useState(() => { const x = sender.conf(); return { url: x.url || '', token: x.token || '' }; });
  const [status, setStatus] = useState('');
  const save = () => { sender.setConf({ url: c.url.trim(), token: c.token.trim() }); toast('저장'); };
  const test = () => { save(); setStatus('확인 중…');
    sender.health().then((s) => { setStatus(s.ok ? '연결됨' + (s.dryRun ? ' (테스트 모드: 실제 발송 안 함)' : '') : s.reason); }); };
  const rows = Object.keys(LM.T).map((id) => Object.assign({}, LM.tplInfo(id), { id: id, code: id }));
  return (
    <Card title="알림톡 발송 (SOLAPI)" right={<Badge tone="gray">승인 + 템플릿 ID가 있어야 발송 버튼이 켜집니다</Badge>}>
      <div>
        <div className="row">
          <Field label="발송 서버 주소"><input type="text" value={c.url} placeholder="https://발송서버주소" onChange={(e) => setC(Object.assign({}, c, { url: e.target.value }))} /></Field>
          <Field label="접속 토큰"><input type="password" value={c.token} placeholder="서버 접속 토큰" onChange={(e) => setC(Object.assign({}, c, { token: e.target.value }))} /></Field>
        </div>
        <div className="actions" style={{ alignItems: 'center', marginBottom: 12 }}>
          <button className="btn sm" onClick={save}>저장</button><button className="btn sm" onClick={test}>연결 확인</button><span className="small muted">{status}</span>
        </div>
        <Table rows={rows} cols={[
          { label: '코드', key: 'code' }, { label: '단계', render: (r) => LM.T[r.code].stage }, { label: '안내', render: (r) => LM.T[r.code].label },
          { label: 'SOLAPI 템플릿 ID', render: (r) => <input key={r.code + ':' + (r.templateId || '')} type="text" defaultValue={r.templateId || ''} placeholder="승인 후 입력"
            onBlur={(ev) => { if (ev.target.value.trim() === (LM.tplInfo(r.code).templateId || '')) return; store.upsert('msgTemplates', { id: r.code, status: LM.tplInfo(r.code).status, templateId: ev.target.value.trim() }); toast('저장'); }} /> },
          { label: '카카오 심사', render: (r) => <Select options={LM.TPL_STATUS.map((s) => ({ value: s, label: s }))} value={r.status}
            onChange={(v) => { store.upsert('msgTemplates', { id: r.code, templateId: LM.tplInfo(r.code).templateId, status: v }); toast('저장'); }} /> },
          { label: '', render: (r) => <button className="btn sm" onClick={() => approvalModal(r.code)}>신청 문안</button> },
        ]} />
      </div>
    </Card>
  );
}

// SOLAPI 콘솔 › 알림톡 템플릿 등록에 붙여넣을 문안 (글자 수는 알림톡 한도 1,000자 기준)
function approvalModal(code) {
  const text = LM.approvalText(code);
  openModal((close) => (
    <Modal title={code + ' ' + LM.T[code].label + ' · 심사 신청 문안'} wide onClose={close} actions={[{ label: '닫기' }, { label: '복사', kind: 'primary', onClick: () => { copyText(text); return false; } }]}>
      <p className="small muted">#{'{'}…{'}'} 칸은 보낼 때마다 바뀌는 변수입니다. 학원 정보(주소·계좌 등)는 문구에 들어 있어, 바뀌면 다시 심사받아야 합니다.{' '}
        {text.length > 1000 ? <Badge tone="bad">{text.length + '자 · 1,000자 초과 — 나눠서 신청 필요'}</Badge> : <Badge tone="gray">{text.length + '자'}</Badge>}</p>
      <textarea rows={18} readOnly style={{ width: '100%', lineHeight: 1.6 }} value={text} />
    </Modal>
  ));
}

export function Settings() {
  const guardians = store.list('guardians');
  return (
    <div className="page">
      <PageHead title="규칙·훅·채널" sub="기준값은 규칙 레지스트리(core/02)에서만 정의하고, 화면은 이를 읽어 씁니다" />
      <div className="grid g2">
        <Card title="적용 중인 주요 규칙 값" right={<Badge tone="gray">원본: core/02 · english rules.md</Badge>}>
          <Table cols={[{ label: '규칙', render: (r) => r[0] }, { label: '값', render: (r) => r[1] }]} rows={[
            ['ENG-TEST-07 내신 기준 시작', '시험 ' + dom.NAESHIN_WEEKS_DAYS + '일 전 (4~5주 중 5주 기본값)'], ['Q-04 미완료 처리', '다음 날 오후 5시 등원'],
            ['ENG-REM 점검', '10문제 중 80% 통과, 미통과 시 새 10문제'], ['ENG-REPORT-01 리포트', '초·중등 월 1회, 신규 학생 4주차'],
          ]} />
        </Card>
        <Card title="채널">
          <Table cols={[{ label: '코드', render: (r) => r[0] }, { label: '채널', render: (r) => r[1] }, { label: '상태', render: (r) => <Badge tone={r[2] === '사용' ? 'ok' : 'gray'}>{r[2]}</Badge> }]} rows={[
            ['CH-01', '카카오 알림톡 (SOLAPI)', '준비 중'], ['CH-02', '문자 (알림톡 실패 시 대체)', '준비 중'], ['CH-04', '학원친구 (OS 밖, 복사·붙여넣기)', '사용'],
          ]} />
        </Card>
      </div>
      <AlimtalkCard />
      <Card title="학부모 수신동의">
        <Table rows={guardians} empty="등록된 학부모 전화번호가 없습니다" cols={[
          { label: '학생', render: (g) => { const s = store.get('students', g.student_id); return s ? s.name : '—'; } }, { label: '학부모 전화번호', key: 'parentPhone' },
          { label: '수신동의', render: (g) => <label><input type="checkbox" checked={!!g.consent} onChange={(ev) => { store.upsert('guardians', { id: g.id, consent: ev.target.checked }); toast('저장'); }} /> 동의</label> },
        ]} />
      </Card>
    </div>
  );
}

/* ---------- 문항 맵 ---------- */
function AddMapModal({ close }) {
  const [f, setF] = useState({ book: '', count: 20, area: '문법' });
  return (
    <Modal title="문항 맵 추가" onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (!f.book.trim()) { toast('이름을 입력하세요'); return false; }
      const t = store.list('errorTypes', (x) => x.active && x.area === f.area)[0];
      const items = []; for (let n = 1; n <= +f.count; n++) items.push({ no: n, area: f.area, type: t ? t.code : '' });
      store.upsert('itemMaps', { book: f.book.trim(), kind: '교재', items: items });
    } }]}>
      <Field label="교재·시험"><input type="text" placeholder="교재명 또는 시험 회차" value={f.book} onChange={(e) => setF(Object.assign({}, f, { book: e.target.value }))} /></Field>
      <div className="row">
        <Field label="문항 수"><input type="number" min={1} max={100} value={f.count} onChange={(e) => setF(Object.assign({}, f, { count: e.target.value }))} /></Field>
        <Field label="영역"><Select options={AREAS} value={f.area} onChange={(v) => setF(Object.assign({}, f, { area: v }))} /></Field>
      </div>
      <p className="small muted">문항 번호별 문제유형은 저장 후 편집에서 지정합니다.</p>
    </Modal>
  );
}

function EditMapModal({ id, close }) {
  const m = store.get('itemMaps', id);
  const types = store.list('errorTypes', (t) => t.active);
  if (!m) return null;
  return (
    <Modal title={m.book + ' 편집'} wide onClose={close} actions={[{ label: '닫기', kind: 'primary' }]}>
      <p className="small muted">문항번호 → 영역·문제유형·배점. 한 번 만들면 모든 학생이 재사용합니다. 핵심 교재는 인계 후 선정합니다.</p>
      <div className="table-wrap"><table className="tbl">
        <thead><tr>{['번호', '영역', '문제유형'].map((x) => <th key={x}>{x}</th>)}</tr></thead>
        <tbody>{m.items.map((it, i) => (
          <tr key={it.no}><td>{it.no}</td><td>{it.area}</td>
            <td><Select options={types.map((t) => ({ value: t.code, label: t.area + ' · ' + t.name }))} value={it.type} onChange={(v) => {
              const ty = store.get('errorTypes', v);
              const items = m.items.slice(); items[i] = { no: it.no, area: ty.area, type: ty.code };
              store.upsert('itemMaps', { id: m.id, items: items });
            }} /></td></tr>
        ))}</tbody>
      </table></div>
    </Modal>
  );
}

export function ItemMap() {
  const maps = store.list('itemMaps');
  return (
    <div className="page">
      <PageHead title="문항 맵 관리" sub="교재·시험 문항번호 → 영역·문제유형 (틀린 번호를 누르면 유형이 자동 부여되는 기준)">
        <button className="btn primary" onClick={() => openModal((close) => <AddMapModal close={close} />)}>+ 문항 맵 추가</button>
      </PageHead>
      <Card>
        <Table rows={maps} empty="등록된 문항 맵이 없습니다" cols={[{ label: '교재·시험', key: 'book' }, { label: '문항 수', render: (m) => m.items.length },
          { label: '', render: (m) => <span><button className="btn sm" onClick={() => openModal((close) => <EditMapModal id={m.id} close={close} />)}>편집</button>{' '}
            <button className="btn sm ghost" onClick={() => confirmBox('이 문항 맵을 삭제할까요? 기존 오답 기록은 유지됩니다.', () => { store.remove('itemMaps', m.id); }, true)}>삭제</button></span> }]} />
      </Card>
    </div>
  );
}

/* ---------- 문제유형 마스터 ---------- */
function AddTypeModal({ close }) {
  const [f, setF] = useState({ code: '', name: '', area: '문법' });
  return (
    <Modal title="문제유형 추가" onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      const code = f.code.trim().toUpperCase();
      if (!code || !f.name.trim()) { toast('코드와 이름을 입력하세요'); return false; }
      if (store.get('errorTypes', code)) { toast('이미 있는 코드입니다'); return false; }
      store.upsert('errorTypes', { id: code, code: code, name: f.name.trim(), area: f.area, active: true });
    } }]}>
      <Field label="코드" hint="한 번 정하면 바꾸지 않습니다 (이름만 변경). 접두사는 영역: WORD·READ·GRM·WRT·LST">
        <input type="text" placeholder="예) GRM-PASSIVE" value={f.code} onChange={(e) => setF(Object.assign({}, f, { code: e.target.value }))} /></Field>
      <Field label="이름"><input type="text" value={f.name} onChange={(e) => setF(Object.assign({}, f, { name: e.target.value }))} /></Field>
      <Field label="영역"><Select options={AREAS} value={f.area} onChange={(v) => setF(Object.assign({}, f, { area: v }))} /></Field>
    </Modal>
  );
}

export function Types() {
  const rows = store.list('errorTypes');
  const used = (code) => store.list('errorItems', (e) => e.type === code).length;
  return (
    <div className="page">
      <PageHead title="문제유형 마스터" sub="오답·문항 맵·영상·점검 문제가 함께 쓰는 공통 태그 (영어 v1 · 내신 시험지 확보 시 조정 예정)">
        <button className="btn primary" onClick={() => openModal((close) => <AddTypeModal close={close} />)}>+ 유형 추가</button>
      </PageHead>
      <Card>
        <Table rows={rows} cols={[{ label: '코드', key: 'code' }, { label: '영역', key: 'area' },
          { label: '이름', render: (t) => <input key={t.id + ':' + t.name} type="text" defaultValue={t.name} onBlur={(ev) => { if (ev.target.value === t.name) return; store.upsert('errorTypes', { id: t.id, name: ev.target.value }); toast('이름 변경'); }} /> },
          { label: '오답 기록', render: (t) => used(t.code) + '건' },
          { label: '상태', render: (t) => <button className="btn sm" onClick={() => store.upsert('errorTypes', { id: t.id, active: !t.active })}>{t.active ? '사용 중 (중지)' : '중지됨 (재사용)'}</button> }]} />
      </Card>
    </div>
  );
}

export function Bank() {
  return <Placeholder title="문제은행·영상 관리" sub="약점 보강의 영상(유튜브 일부 공개)과 점검 문제 관리" status="선결 조건 대기" lines={[
    '영상: 유튜브 영상 ID + 교재·단원·영역·문제유형 태그 등록 (영상 촬영·분할 시작 후)',
    '문제은행: 외부 플랫폼 문제·정답 파일 업로드 → 태그로 출제 (플랫폼·파일 형식은 Q-08, 전달 대기)',
    '영상·문제의 태그는 문제유형 마스터와 동일한 목록을 씁니다', '아이패드 임베드·잠금 실기기 테스트 후 확정 (core/09 §10-4)']} />;
}

/* ---------- 데이터 관리 ---------- */
export function DataAdmin() {
  const counts = ['students', 'leads', 'coachingEntries', 'errorItems', 'itemMaps', 'examPeriods', 'messageLogs'].map((c) => [c, store.list(c).length]);
  return (
    <div className="page">
      <PageHead title="데이터 관리" sub="데이터는 화면과 분리되어 있어 언제든 내보내고 다시 불러올 수 있습니다 (P11)" />
      <div className="grid g2">
        <Card title="저장 현황" right={<Badge tone="gray">이 기기 브라우저에 저장</Badge>}>
          <Table rows={counts} cols={[{ label: '컬렉션', render: (r) => r[0] }, { label: '건수', render: (r) => r[1], class: 'num' }]} />
        </Card>
        <Card title="백업·복원">
          <div>
            <p className="small muted">서버(클라우드) 전에는 이 기기에만 저장됩니다. 정기적으로 내보내기를 해 두세요. 실제 학생 정보가 담긴 파일은 GitHub에 올리지 마세요(.gitignore 대상).</p>
            <div className="row">
              <button className="btn primary" onClick={() => download('academy-os-' + D.today() + '.json', store.exportJSON())}>내보내기 (JSON)</button>
              <label className="btn">불러오기<input type="file" accept=".json" style={{ display: 'none' }} onChange={(ev) => {
                const f = ev.target.files[0]; if (!f) return;
                readText(f, (text) => { try { store.importJSON(text); toast('불러왔습니다'); } catch (e) { toast('불러오지 못했습니다: ' + e.message); } });
                ev.target.value = '';
              }} /></label>
            </div>
            <hr />
            <div className="row">
              <button className="btn" onClick={() => confirmBox('현재 데이터가 사라지고 데모 데이터로 바뀝니다. 계속할까요?', () => { store.resetDemo(); go('home'); }, true)}>데모 데이터로 초기화</button>
              <button className="btn danger" onClick={() => confirmBox('학생·상담·기록 데이터를 모두 삭제합니다(문제유형 마스터·학사 일정·업무 목록은 유지). 실제 운영을 시작할 때만 사용하세요.', () => {
                const keep = store.list('errorTypes'); const per = store.list('academicPeriods'); const tpl = store.list('taskTemplates');
                store.clearAll(); keep.forEach((t) => store.upsert('errorTypes', t)); per.forEach((x) => store.upsert('academicPeriods', x)); tpl.forEach((x) => store.upsert('taskTemplates', x));
                go('home');
              }, true)}>모두 비우고 새로 시작</button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
