/* React 연결: 저장소 구독, 화면별 상태, 해시 라우터 */
import { useCallback, useSyncExternalStore } from 'react';
import { store } from './store.js';

// 저장소가 바뀔 때마다 다시 그린다 (원본의 OS.render() 대신)
export function useStore() {
  return useSyncExternalStore(store.subscribe, store.version);
}

/* 화면별 상태(탭·선택 학생 등). 원본처럼 메뉴를 옮겨 다녀도 값이 남는다.
 * set(patch) 하면 같은 이름을 쓰는 모든 컴포넌트가 다시 그려진다 */
const viewStates = {};
const viewSubs = {};
const viewVers = {};
export function useViewState(ns, init) {
  if (!viewStates[ns]) { viewStates[ns] = typeof init === 'function' ? init() : Object.assign({}, init); viewSubs[ns] = new Set(); viewVers[ns] = 0; }
  useSyncExternalStore(
    useCallback((fn) => { viewSubs[ns].add(fn); return () => viewSubs[ns].delete(fn); }, [ns]),
    () => viewVers[ns],
  );
  const st = viewStates[ns];
  const set = useCallback((patch) => {
    Object.assign(viewStates[ns], typeof patch === 'function' ? patch(viewStates[ns]) : patch);
    viewVers[ns] += 1;
    viewSubs[ns].forEach((fn) => fn());
  }, [ns]);
  return [st, set];
}

/* 해시 라우터: #/학생/stu-1 → { id: 'students', arg: 'stu-1' }. 원본과 같은 주소 체계 */
function subscribeHash(fn) { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); }
export function useHash() { return useSyncExternalStore(subscribeHash, () => location.hash); }
export function parseRoute(hash) {
  const parts = (hash.replace(/^#\/?/, '') || 'home').split('/');
  return { id: parts[0], arg: parts.slice(1).join('/') };
}
export function go(route) { location.hash = '#/' + route; }
