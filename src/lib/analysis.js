/* 레벨테스트 다각도 분석 (F2/F3): 틀린 문항의 역량 태그를 영역과 무관하게 모아 근본 원인을 추정한다.
 * 화면과 분리된 순수 로직이다 (P11). 입력은 테스트지 키(form)와 틀린 문항(wrong)뿐이다.
 * wrong = { [문항번호]: { pick: 고른 보기(1~5)|null, earned: 받은 점수, err: [오류 유형 코드] } } — 틀린(부분 감점 포함) 문항만 담는다.
 * 규칙: 근거 가중치 선택한 오답 보기 1.0 · 문항 전체 역량 0.6(보기 모름) · 보기가 있을 때 나머지 역량 0.3 · 지문 구문 역량 0.4(간접).
 *       같은 역량이 직접 근거(≥0.6)로 2문항 이상이고 그 역량이 출제된 문항의 절반 이상이면 '주요', 1문항이면 '관찰'. */
const W = { PICK: 1, ITEM: 0.6, REST: 0.3, PASSAGE: 0.4 };
const AREA_ORDER = ['문법', '독해', '영작', '단어', '듣기'];

// 이름에서 괄호 설명을 뺀 짧은 이름 (문장 속에서 쓴다)
function shortName(n) { return String(n).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
function skillInfo(form, code) { const c = form.skillCatalog[code]; return { code: code, name: c ? c[0] : code, short: c ? shortName(c[0]) : code, group: c ? c[1] : '' }; }
function nums(arr) { return arr.slice().sort((a, b) => a - b).join('·'); }

// 틀린 문항 하나가 어떤 역량의 근거가 되는지: [{skill, weight, via}]
function evidenceFor(form, item, w) {
  const seen = {};
  const add = (s, wt, via) => { if (!seen[s] || seen[s].weight < wt) seen[s] = { skill: s, weight: wt, via: via }; };
  if (item.kind === 'mc') {
    const ds = w.pick && item.d && item.d[w.pick];
    if (ds) { ds.forEach((s) => add(s, W.PICK, 'pick')); item.skills.forEach((s) => add(s, W.REST, 'item')); }
    else item.skills.forEach((s) => add(s, W.ITEM, 'item'));
  } else {
    const errs = (w.err || []).filter((e) => item.err && item.err[e]);
    if (errs.length) { errs.forEach((e) => add(e, W.PICK, 'err')); item.skills.forEach((s) => add(s, W.REST, 'item')); }
    else item.skills.forEach((s) => add(s, W.ITEM, 'item'));
  }
  if (item.passage && form.passages && form.passages[item.passage]) form.passages[item.passage].skills.forEach((s) => add(s, W.PASSAGE, 'passage'));
  return Object.keys(seen).map((k) => seen[k]);
}

function lossFrac(item, w) { return Math.max(0, Math.min(1, (item.pts - (w.earned || 0)) / item.pts)); }

function analyze(form, wrong) {
  wrong = wrong || {};
  const byNo = {}; form.items.forEach((i) => { byNo[i.no] = i; });
  const wrongNos = Object.keys(wrong).map(Number).filter((n) => byNo[n] && lossFrac(byNo[n], wrong[n]) > 0);

  // 영역별 결과
  const areas = {};
  form.items.forEach((i) => {
    const a = areas[i.area] = areas[i.area] || { area: i.area, total: 0, correct: 0, partial: 0, pts: 0, earned: 0, wrong: [], items: [] };
    a.total++; a.pts += i.pts; a.items.push(i.no);
    const w = wrongNos.indexOf(i.no) >= 0 ? wrong[i.no] : null;
    if (!w) { a.correct++; a.earned += i.pts; } else { a.earned += Math.min(i.pts, w.earned || 0); a.wrong.push(i.no); if ((w.earned || 0) > 0) a.partial++; }
  });
  const areaList = AREA_ORDER.filter((x) => areas[x]).map((x) => areas[x]);
  const points = areaList.reduce((s, a) => s + a.earned, 0);
  const totalPts = areaList.reduce((s, a) => s + a.pts, 0);

  // 역량별 근거 모으기
  const sk = {};
  // 오류 유형(err)으로 확인하는 개념도 그 문항이 보는 개념으로 센다 — 놓친 문항 수가 출제 문항 수보다 커지지 않게
  const testedBy = {}; form.items.forEach((i) => i.skills.concat(Object.keys(i.err || {})).forEach((s) => { const t = testedBy[s] = testedBy[s] || []; if (t.indexOf(i.no) < 0) t.push(i.no); }));
  wrongNos.forEach((n) => {
    const item = byNo[n], w = wrong[n], lf = lossFrac(item, w);
    evidenceFor(form, item, w).forEach((e) => {
      const o = sk[e.skill] = sk[e.skill] || { code: e.skill, direct: [], indirect: [], viaPassage: [], strength: 0, pickHits: 0 };
      if (e.weight >= W.ITEM && lf >= 0.5) { if (o.direct.indexOf(n) < 0) o.direct.push(n); if (e.via === 'pick' || e.via === 'err') o.pickHits++; }
      else if (e.via === 'passage') { if (o.viaPassage.indexOf(n) < 0) o.viaPassage.push(n); }
      else { if (o.indirect.indexOf(n) < 0) o.indirect.push(n); }
      o.strength += e.weight * lf;
    });
  });
  // 심화 단원(단원명에 '심화')에서만 출제된 역량은 상위 학년 내용이라 우선순위를 뒤로 미룬다
  const isAdv = (n) => /심화/.test(byNo[n].unit || '');
  const skills = Object.keys(sk).map((c) => {
    const o = sk[c], info = skillInfo(form, c), tested = (testedBy[c] || []).length;
    const level = o.direct.length >= 2 && o.direct.length / Math.max(1, tested) >= 0.5 ? 'main' : o.direct.length >= 1 ? 'observe' : 'indirect';
    const advanced = tested > 0 && (testedBy[c] || []).every(isAdv);
    return Object.assign(o, info, { tested: tested, testedNos: testedBy[c] || [], level: level, advanced: advanced });
  }).sort((a, b) => (a.advanced - b.advanced) || (b.direct.length - a.direct.length) || (b.strength - a.strength));
  const main = skills.filter((s) => s.level === 'main'), observe = skills.filter((s) => s.level === 'observe');

  // 단원별 결과 (테스트지 단원 순서 그대로)
  const units = [];
  form.items.forEach((i) => {
    let u = units.find((x) => x.unit === i.unit);
    if (!u) units.push(u = { unit: i.unit, area: i.area, items: [], correct: 0, total: 0, advanced: isAdv(i.no) });
    u.items.push(i.no); u.total++;
    if (wrongNos.indexOf(i.no) < 0) u.correct++;
  });

  // 틀린 문항마다 대표 원인 하나: 표시 순서상 가장 앞선 '주요' 역량의 직접 근거면 그 역량, 아니면 null(그 밖의 오답)
  const causeOf = {};
  wrongNos.forEach((n) => { const s = main.find((m) => m.direct.indexOf(n) >= 0); causeOf[n] = s ? s.code : null; });

  // 영역을 가로지르는 연결: 한 영역의 오답 근거가 된 역량이 다른 영역 오답에도 쓰였는가 (근거 문항 합쳐 2개 이상)
  const areaOf = (n) => byNo[n].area;
  const group = (nos) => nos.reduce((m, n) => { (m[areaOf(n)] = m[areaOf(n)] || []).push(n); return m; }, {});
  const links = [];
  skills.filter((s) => s.direct.length).forEach((s) => {
    // 지문 구문(간접) 근거는 그 역량이 '주요'일 때만 연결에 쓴다 — 약한 근거로 영역 간 원인을 단정하지 않는다
    const from = group(s.direct), reach = group(s.indirect.concat(s.direct)), viaP = s.level === 'main' ? group(s.viaPassage) : {};
    Object.keys(from).forEach((f) => {
      Object.keys(reach).forEach((t) => {
        if (f !== t && from[f].length + reach[t].length >= 2) links.push({ skill: s.code, name: s.name, short: s.short, group: s.group, from: f, fromNos: from[f], to: t, toNos: reach[t], passage: false });
      });
      // 지문에 그 구문이 쓰였을 뿐인 연결은 따로 표시한다 (문항이 직접 묻지 않으므로 '영향 가능성'으로만 쓴다)
      Object.keys(viaP).forEach((t) => {
        if (f !== t && !reach[t]) links.push({ skill: s.code, name: s.name, short: s.short, group: s.group, from: f, fromNos: from[f], to: t, toNos: viaP[t], passage: true });
      });
    });
  });
  const seenL = {}, linksU = links.filter((l) => { const k = l.skill + '>' + l.to; if (seenL[k]) return false; seenL[k] = 1; return true; });

  // 가장 많은 점수를 놓친 영역(실제 잃은 점수 기준)과, 문항이 충분한(5개 이상) 영역 중 가장 안정적인 영역.
  // 비율만 보면 2문항짜리 영역(영작·단어)이 '가장 약한 영역'으로 잡히므로 쓰지 않는다
  const ratio = (a) => a.earned / a.pts, lost = (a) => a.pts - a.earned;
  const mostLost = areaList.slice().sort((x, y) => lost(y) - lost(x))[0];
  // '안정적'이라고 부르려면 그 영역 자체가 70% 이상이어야 한다 (전체가 낮을 때 덜 나쁜 영역을 안정적이라 하지 않는다)
  const steady = areaList.filter((a) => a.total >= 5 && a !== mostLost && ratio(a) >= 0.7).sort((x, y) => ratio(y) - ratio(x))[0] || null;

  return { areas: areaList, points: points, totalPts: totalPts, wrongNos: wrongNos.sort((a, b) => a - b), correctCount: form.items.length - wrongNos.length,
    skills: skills, main: main, observe: observe, links: linksU, mostLost: mostLost && lost(mostLost) > 0 ? mostLost : null, steady: steady,
    units: units, causeOf: causeOf };
}

// 학부모용 문장 조립 (템플릿 — AI 호출 없음). 원장이 화면에서 고칠 수 있다
const GROUP_IMPACT = {
  '문법': '문법 개념은 독해 해석과 영작에서도 반복해서 쓰이므로, 먼저 바로잡을수록 다른 영역까지 함께 좋아집니다.',
  '독해': '글을 읽는 방법(근거 찾기·흐름 파악)의 문제라서, 단어·문법과는 별도로 읽기 훈련이 필요합니다.',
  '단어': '단어 지식은 독해와 영작의 바탕이므로 꾸준한 누적이 필요한 부분입니다.',
  '영작': '알고 있는 내용을 정확한 문장으로 옮기는 단계에서 생긴 오류라서, 쓰기 훈련으로 바로잡을 수 있습니다.',
};

const missLine = (s) => (s.direct.length === s.tested ? s.tested + '문항 모두 놓침' : s.tested + '문항 중 ' + s.direct.length + '문항 놓침') + ' (' + nums(s.direct) + '번)';

function narrative(form, an) {
  const out = { summary: [], causes: [], links: [], closing: '', notes: [] };
  if (!an.wrongNos.length) {
    out.summary.push('모든 문항을 맞혔습니다. 총점은 ' + an.points + '점입니다.');
    out.closing = '뚜렷한 약점이 보이지 않았습니다. 수업에서는 현재 수준을 유지하면서 한 단계 높은 과제로 이어 가겠습니다.';
  } else {
    if (an.mostLost) {
      const m = an.mostLost, lostPts = Math.round((m.pts - m.earned) * 10) / 10;
      out.summary.push('가장 많은 점수를 놓친 영역은 ' + m.area + '(' + lostPts + '점)입니다.' + (an.steady ? ' ' + an.steady.area + '는 상대적으로 안정적이었습니다.' : ''));
    }
    // 심화가 아닌 문법 단원에서 절반 이상 놓친 단원이 2개 이상이면 기초부터 다져야 한다는 점을 먼저 알린다
    const weakBase = an.units.filter((u) => u.area === '문법' && !u.advanced && u.correct / u.total <= 0.5);
    if (weakBase.length >= 2) out.summary.push(weakBase.map((u) => u.unit).join(', ') + ' 단원에서 절반 이상을 놓쳤습니다. 중1 과정의 기본 문법이라, 이 부분을 먼저 다지는 것이 점수를 올리는 가장 빠른 길입니다.');
    out.summary.push('틀린 문항을 영역별로 나누어 보지 않고, 문항들이 공통으로 요구한 개념을 함께 분석했습니다.');
  }
  let rankNo = 0;
  an.main.slice(0, 5).forEach((s) => {
    const lead = '이 개념이 필요한 ' + s.tested + '문항 중 ' + s.direct.length + '문항(' + nums(s.direct) + '번)을 놓쳤습니다.';
    if (s.advanced) {
      out.causes.push({ code: s.code, rank: '심화', level: 'adv', title: s.short, group: s.group, short: '상위 학년 과정 — 기본기를 다진 뒤 다룸 (' + nums(s.direct) + '번)',
        body: lead + ' 상위 학년(심화) 과정이라 아직 배우지 않았다면 틀리는 것이 자연스럽습니다. 기본 개념을 먼저 다진 뒤 다루겠습니다.' });
      return;
    }
    out.causes.push({ code: s.code, rank: rankNo++ === 0 ? '주원인' : '부원인', level: 'main', title: s.short, group: s.group, short: missLine(s),
      body: lead + (s.pickHits >= 1 ? ' 고른 보기도 이 개념의 대표적인 함정이었습니다.' : '') + ' ' + (GROUP_IMPACT[s.group] || '') });
  });
  const shown = {};
  out.causes.forEach((c) => { shown[c.title] = 1; });
  if (!out.causes.length) an.observe.slice(0, 2).forEach((s) => {
    shown[s.short] = 1;
    out.causes.push({ code: s.code, rank: '관찰', level: 'observe', title: s.short, group: s.group, short: missLine(s),
      body: s.tested + '문항 중 ' + s.direct.length + '문항(' + nums(s.direct) + '번)에서 흔들렸습니다. 한 번의 관찰이라 단정하기 어렵고, 수업을 시작한 뒤 다시 확인하겠습니다.' });
  });
  // 주원인 외에 눈에 띄는 관찰 항목 1개 (주원인이 있을 때만 보조로)
  const extra = an.observe.find((x) => !shown[x.short]);
  if (an.main.length && extra && out.causes.length < 3) {
    const s = extra;
    out.causes.push({ code: s.code, rank: '관찰', level: 'observe', title: s.short, group: s.group, short: missLine(s), body: s.tested + '문항 중 ' + s.direct.length + '문항(' + nums(s.direct) + '번)에서 흔들렸습니다. 아직 한 번의 관찰이라 수업에서 다시 확인하겠습니다.' });
  }
  an.links.filter((l) => !l.passage).concat(an.links.filter((l) => l.passage)).slice(0, 3).forEach((l) => {
    out.links.push(l.passage
      ? l.to + ' 지문에 「' + l.short + '」 문장이 들어 있습니다. 이 개념이 약하면 지문 해석이 흔들려 ' + nums(l.toNos) + '번 오답에도 영향을 주었을 수 있습니다.'
      : l.to + '에서 틀린 ' + nums(l.toNos) + '번에도 「' + l.short + '」 개념이 쓰였습니다. ' + l.to + ' 자체보다 「' + l.short + '」에서 비롯된 오답일 가능성이 있습니다.');
  });
  const basics = an.main.filter((s) => !s.advanced);
  if (basics.length) {
    const p = basics[0], s2 = basics[1];
    const reach = {}; an.links.filter((l) => l.skill === p.code && !l.passage).forEach((l) => { reach[l.to] = 1; }); reach[(an.areas.find((a) => a.wrong.indexOf(p.direct[0]) >= 0) || {}).area] = 1;
    const rs = AREA_ORDER.filter((x) => reach[x]);
    out.closing = '이번 결과에서 가장 먼저 다룰 부분은 「' + p.short + '」' + (s2 ? ', 그다음은 「' + s2.short + '」' : '') + '입니다. ' + (rs.length > 1 ? rs.join('·') + ' 영역의 점수가 함께 오를 가능성이 큽니다.' : '이 부분이 정리되면 같은 유형의 오답을 크게 줄일 수 있습니다.');
  } else if (an.wrongNos.length) {
    out.closing = '여러 영역에 걸쳐 반복되는 뚜렷한 약점은 보이지 않았고, 틀린 문항은 개별 실수에 가까워 보입니다. 수업에서 같은 유형을 다시 확인하겠습니다.';
  }
  if (an.units.some((u) => u.advanced)) {
    const adv = an.units.filter((u) => u.advanced), advNos = [].concat.apply([], adv.map((u) => u.items));
    out.notes.push(nums(advNos) + '번은 상위 학년 심화 문항입니다. 기본 실력을 보는 문항이 아니므로 틀렸더라도 우선순위를 뒤로 두었습니다.');
  }
  // 주의 문구
  an.areas.forEach((a) => {
    if (a.total >= 5) return;
    out.notes.push(a.area === '단어' ? '단어는 이번 테스트에서 ' + a.total + '문항만 출제되어 영역 점수만으로는 판단하기 어렵습니다. 독해 속 어휘 문항과 함께 참고했습니다.'
      : a.area + ' 영역은 ' + a.total + '문항이라 점수보다 오류의 종류를 중심으로 보았습니다.');
  });
  if (!an.areas.some((a) => a.area === '듣기')) out.notes.push('듣기는 이번 테스트에 포함되지 않았습니다.');
  out.notes.push('이 분석은 ' + form.items.length + '문항 진단 결과를 바탕으로 한 추정이며, 수업을 시작한 뒤 관찰로 다시 확인합니다.');
  return out;
}

function strengths(form, an, max) {
  const wrongSet = {}; an.wrongNos.forEach((n) => { wrongSet[n] = 1; });
  const byNo = {}; form.items.forEach((i) => { byNo[i.no] = i; });
  const tested = {}; form.items.forEach((i) => i.skills.forEach((s) => { (tested[s] = tested[s] || []).push(i.no); }));
  const allOk = (nos) => nos.every((n) => !wrongSet[n]);
  const covered = {}, big = [], single = [];
  an.units.forEach((u) => {
    if (u.advanced || u.total < 2 || u.area !== '문법' || !allOk(u.items)) return;
    const names = []; u.items.forEach((n) => byNo[n].skills.forEach((c) => { const nm = skillInfo(form, c).short; if (names.indexOf(nm) < 0) names.push(nm); }));
    u.items.forEach((n) => { covered[n] = 1; });
    big.push({ area: u.area, title: u.unit, sub: names.length <= 3 ? names.join('·') : '', nos: u.items });
  });
  Object.keys(tested).forEach((c) => {
    const nos = tested[c], info = skillInfo(form, c);
    if (!allOk(nos) || nos.every((n) => covered[n])) return;
    if (nos.length >= 2) big.push({ area: info.group, title: info.name, sub: '', nos: nos });
    else if (info.group === '독해') single.push({ area: info.group, title: info.short, sub: '', nos: nos });
  });
  // 같은 문항 하나로 잡힌 독해 개념은 한 줄로 합친다
  const merged = [];
  single.forEach((x) => { const m = merged.find((y) => y.nos[0] === x.nos[0]); if (m) m.title += '·' + x.title; else merged.push(x); });
  big.sort((a, b) => b.nos.length - a.nos.length);
  return big.concat(merged).slice(0, max || 4).map((x) => Object.assign(x, { line: (x.nos.length > 1 ? x.nos.length + '문항 모두 정답' : '정답') + ' (' + nums(x.nos) + '번)' }));
}

// 틀린 문항 하나에 붙는 짧은 해설 (학부모가 문항 캡처 옆에서 읽는 문장). 원장이 화면에서 고칠 수 있다
const CIRC = ['①', '②', '③', '④', '⑤'];
function itemNote(form, item, w) {
  const names = (codes) => codes.map((c) => '「' + skillInfo(form, c).short + '」').join('·');
  if (item.kind === 'mc') {
    const ds = w.pick && item.d && item.d[w.pick];
    if (ds) return CIRC[w.pick - 1] + '번은 ' + names(ds) + ' 개념을 놓쳤을 때 고르게 되는 보기입니다.';
    return names(item.skills) + ' 개념이 필요한 문항입니다.' + (w.pick ? '' : ' (고른 보기 미기록)');
  }
  const errs = (w.err || []).filter((e) => item.err && item.err[e]);
  if (errs.length) return errs.map((e) => item.err[e].replace(/\s*\([^)]*점[^)]*\)\s*$/, '')).join(' / ') + '.';
  return names(item.skills) + ' 개념이 필요한 문항입니다.';
}

export const analysis = { analyze: analyze, narrative: narrative, strengths: strengths, itemNote: itemNote, evidenceFor: evidenceFor, lossFrac: lossFrac, W: W };
