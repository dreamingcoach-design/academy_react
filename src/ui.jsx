/* UI 헬퍼: 모달, 토스트, 공통 컴포넌트 (academy-os app/js/ui.js 와 같은 클래스·구조) */
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/* ---------- 작은 구독 저장소 (토스트·모달 목록) ---------- */
function createList() {
  let items = [];
  const subs = new Set();
  return {
    get: () => items,
    set: (next) => { items = next; subs.forEach((fn) => fn()); },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}
let seq = 0;

/* ---------- 토스트 ---------- */
const toasts = createList();
export function toast(msg) {
  const id = ++seq;
  toasts.set(toasts.get().concat([{ id, msg, out: false }]));
  setTimeout(() => toasts.set(toasts.get().map((t) => (t.id === id ? Object.assign({}, t, { out: true }) : t))), 2200);
  setTimeout(() => toasts.set(toasts.get().filter((t) => t.id !== id)), 2600);
}
export function Toasts() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.get);
  if (!list.length) return null;
  return createPortal(<div id="toasts">{list.map((t) => <div key={t.id} className={'toast' + (t.out ? ' out' : '')}>{t.msg}</div>)}</div>, document.body);
}

/* ---------- 모달 ----------
 * openModal((close) => <내용 컴포넌트 close={close} />) — 내용 컴포넌트가 <Modal> 을 그린다.
 * 모달 목록은 앱이 다시 그려질 때마다 render 함수를 다시 불러, 열린 창도 최신 데이터를 보여 준다 */
const modals = createList();
export function openModal(render) {
  const id = ++seq;
  const close = () => modals.set(modals.get().filter((m) => m.id !== id));
  modals.set(modals.get().concat([{ id, render, close }]));
  return close;
}
export function closeAllModals() { modals.set([]); }
export function ModalHost() {
  const list = useSyncExternalStore(modals.subscribe, modals.get);
  if (!list.length) return null;
  return createPortal(<Fragment>{list.map((m) => <Fragment key={m.id}>{m.render(m.close)}</Fragment>)}</Fragment>, document.body);
}

// actions: [{ label, kind, onClick(close) → false 면 닫지 않음, keepOpen, disabled }]. 없으면 [닫기] 하나
export function Modal({ title, wide, onClose, actions, children }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const first = boxRef.current && boxRef.current.querySelector('input,select,textarea');
    if (first) first.focus();
  }, []);
  const acts = (actions || []).filter(Boolean);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} ref={boxRef}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          {acts.length ? acts.map((a, i) => (
            <button key={i} className={'btn ' + (a.kind || '')} disabled={a.disabled}
              onClick={() => { if (a.onClick) { if (a.onClick(onClose) === false) return; } if (!a.keepOpen) onClose(); }}>{a.label}</button>
          )) : <button className="btn" onClick={onClose}>닫기</button>}
        </div>
      </div>
    </div>
  );
}

export function confirmBox(msg, onYes, danger) {
  openModal((close) => (
    <Modal title="확인" onClose={close} actions={[{ label: '취소' }, { label: '확인', kind: danger ? 'danger' : 'primary', onClick: () => { onYes(); } }]}>
      <p>{msg}</p>
    </Modal>
  ));
}

/* ---------- 입력 ---------- */
export function Field({ label, hint, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint ? <span className="hint">{hint}</span> : null}</label>;
}

// options: 문자열 또는 { value, label }
export function Select({ options, value, onChange, ...rest }) {
  return (
    <select value={value == null ? undefined : value} onChange={(e) => onChange && onChange(e.target.value)} {...rest}>
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        return <option key={val} value={val}>{typeof o === 'object' ? o.label : o}</option>;
      })}
    </select>
  );
}

// 연-월-일 + 시 + 분(10분 단위). onChange 값은 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM', 날짜가 비면 ''
const pad = (n) => String(n).padStart(2, '0');
const HOURS = [{ value: '', label: '시' }];
for (let i = 8; i <= 22; i++) HOURS.push({ value: pad(i), label: pad(i) + '시' });
const MINS = [];
for (let i = 0; i < 60; i += 10) MINS.push({ value: pad(i), label: pad(i) + '분' });
export function DateTime({ value, onChange }) {
  const v = value || '';
  const [s, setS] = useState({ date: v.slice(0, 10), hh: v.length > 10 ? v.slice(11, 13) : '', mm: v.length > 10 ? v.slice(14, 16) : '00' });
  const set = (patch) => {
    const n = Object.assign({}, s, patch);
    setS(n);
    onChange(!n.date ? '' : n.hh ? n.date + 'T' + n.hh + ':' + n.mm : n.date);
  };
  return (
    <div className="dt-input">
      <input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
      <Select options={HOURS} value={s.hh} onChange={(x) => set({ hh: x })} />
      <Select options={MINS} value={s.mm} onChange={(x) => set({ mm: x })} />
    </div>
  );
}

// 여러 개 중 고르는 칩. max 가 있으면 그 개수까지만 선택
export function Chips({ options, value, onChange, max }) {
  const on = new Set(value || []);
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={'chip' + (on.has(o) ? ' on' : '')} onClick={() => {
          if (on.has(o)) on.delete(o);
          else if (max && on.size >= max) { toast('최대 ' + max + '개까지 선택할 수 있습니다'); return; }
          else on.add(o);
          onChange(options.filter((x) => on.has(x)));
        }}>{o}</button>
      ))}
    </div>
  );
}

/* ---------- 화면 구성 ---------- */
export function Tabs({ items, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => <button key={t.id} className={'tab' + (t.id === active ? ' active' : '')} role="tab" onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub ? <p className="sub">{sub}</p> : null}</div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function Card({ title, right, className, style, children }) {
  return (
    <section className={'card ' + (className || '')} style={style}>
      {title || right ? <div className="card-head"><h2>{title || ''}</h2>{right ? <div className="card-right">{right}</div> : null}</div> : null}
      {children}
    </section>
  );
}

export function Kpi({ label, value, note, tone }) {
  return (
    <div className="kpi"><div className="kpi-label">{label}</div>
      <div className={'kpi-value' + (tone ? ' ' + tone : '')}>{value}</div>{note ? <div className="kpi-note">{note}</div> : null}</div>
  );
}

export function Badge({ tone, children }) { return <span className={'badge ' + (tone || '')}>{children}</span>; }

export function Empty({ children }) { return <div className="empty">{children}</div>; }

// cols: [{ label, key, render(row), class }]
export function Table({ cols, rows, clickable, empty }) {
  return (
    <div className="table-wrap">
      <table className={'tbl' + (clickable ? ' clickable' : '')}>
        <thead><tr>{cols.map((c, i) => <th key={i} className={c.class || ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r, ri) => (
            <tr key={r && r.id ? r.id : ri} onClick={clickable ? () => clickable(r) : undefined}>
              {cols.map((c, i) => <td key={i} className={c.class || ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          )) : <tr><td colSpan={cols.length}><Empty>{empty || '데이터가 없습니다'}</Empty></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function Bar({ label, value, max, tone }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row"><span className="bar-label">{label}</span>
      <div className="bar-track"><div className={'bar-fill ' + (tone || '')} style={{ width: pct + '%' }} /></div>
      <span className="bar-val">{value}</span></div>
  );
}

export function Placeholder({ title, sub, lines, status }) {
  return (
    <div className="page">
      <PageHead title={title} sub={sub} />
      <Card><div className="ph">
        <Badge tone="gray">{status || '준비 중'}</Badge>
        <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <p className="muted">기능 정의는 core/07-features.md, 화면 구조는 core/09-system-structure.md 참고</p>
      </div></Card>
    </div>
  );
}

/* ---------- 브라우저 도우미 ---------- */
export function copyText(text) {
  const done = () => toast('복사했습니다');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
  else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;opacity:0';
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했습니다. 직접 선택해 복사하세요'); }
    ta.remove();
  }
}

export function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

// 파일 선택 창을 띄워 고른 파일을 넘긴다
export function pickFile(accept, onFile) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) onFile(f); inp.remove(); });
  document.body.appendChild(inp); inp.click();
  setTimeout(() => inp.remove(), 60000);
}

export function readText(file, onText) {
  const rd = new FileReader();
  rd.onload = () => onText(rd.result);
  rd.readAsText(file, 'utf-8');
}
