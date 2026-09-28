import { readFileSync } from 'node:fs';
import { EFFORTS } from './policy.js';
import { MIN_SAMPLES } from './usage.js';

// Self-contained usage dashboard: no network, no external scripts. The page
// re-runs the same aggregation code as the CLI (src/usage.js, inlined) so
// browser filters and `usage.mjs report` can never disagree.
export function aggregatorSource() {
  const source = readFileSync(new URL('./usage.js', import.meta.url), 'utf8');
  return `const EFFORTS = Object.freeze(${JSON.stringify(EFFORTS)});\n${source
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '')}`;
}

// JSON inside <script> must not be able to close the element.
const embed = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function renderHtml(records, { generatedAt = new Date(), home = '' } = {}) {
  const shown = records.map(r => ({ ...r, project: r.project && home ? r.project.replace(home, '~') : r.project }));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>jet-router 사용량</title>
<style>
:root {
  --bg: #f7f8fa; --panel: #ffffff; --text: #1b2330; --muted: #5d6878; --line: #e2e6ec;
  --actual: #7b8798; --saved: #c2410c; --measured: #0f766e; --weak: #b6bfcc; --ref: #94a3b8;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg: #11151b; --panel: #1a2029; --text: #e6eaf0; --muted: #9aa5b4; --line: #2c3440;
  --actual: #6b7686; --saved: #f97316; --measured: #2dd4bf; --weak: #4a5463; --ref: #64748b;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
main { max-width: 1600px; margin: 0 auto; padding: 24px 16px 48px; }
header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; justify-content: space-between; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 16px; margin: 0 0 12px; }
.muted { color: var(--muted); font-size: 12px; }
button, select, input { font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 16px 0; padding: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.filters label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); min-width: 0; }
.filters select { max-width: 100%; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.card, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.card .value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.card .label { font-size: 12px; color: var(--muted); }
section { margin-bottom: 16px; overflow: hidden; }
.chart { width: 100%; height: auto; display: block; }
.chart text { fill: var(--muted); font-size: 11px; }
.legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--muted); margin-top: 6px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { font-size: 12px; color: var(--muted); font-weight: 500; }
.empty { color: var(--muted); padding: 24px 0; text-align: center; }
footer { font-size: 12px; color: var(--muted); }
.columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 16px; }
.column { min-width: 0; }
/* Wide screens: cards in one row, charts and tables in two columns. */
@media (min-width: 1100px) {
  .cards { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .column th, .column td { padding: 5px 5px; font-size: 12px; }
}
</style>
</head>
<body>
<main>
  <header>
    <h1>jet-router 사용량</h1>
    <span class="muted" id="generated"></span>
    <button type="button" id="theme" aria-pressed="false">다크 모드</button>
  </header>
  <div class="filters">
    <label>시작일<input type="date" id="from"></label>
    <label>종료일<input type="date" id="to"></label>
    <label>프로젝트<select id="project"></select></label>
    <label>모드<select id="mode"><option value="">전체</option><option value="enforce">enforce</option><option value="shadow">shadow</option></select></label>
    <label>차트 단위<select id="bucket"><option value="day">일</option><option value="week">주</option><option value="month">월</option></select></label>
  </div>
  <div class="cards" id="cards"></div>
  <div class="columns">
  <div class="column">
  <section><h2>기간별 출력 토큰과 추정 절감</h2><div id="series"></div>
    <div class="legend"><span><i style="background:var(--actual)"></i>실제 출력</span><span><i style="background:var(--saved)"></i>추정 절감</span></div></section>
  <section><h2>프로젝트별</h2><div class="scroll" id="projects"></div></section>
  </div>
  <div class="column">
  <section><h2>조합별 측정 비율 (적용 ÷ 대조군 평균 출력)</h2><div id="ratios"></div>
    <div class="legend"><span><i style="background:var(--measured)"></i>측정 비율 · 95% 구간 (양쪽 ${MIN_SAMPLES}턴 이상)</span><span><i style="background:var(--weak)"></i>표본 부족 (참고용)</span><span><i style="background:var(--saved)"></i>평가 비율</span></div></section>
  <section><h2>조합별</h2><div class="scroll" id="pairs"></div></section>
  </div>
  </div>
  <footer>추정 절감은 측정 비율(표본 충분)을 우선 쓰고, 없으면 평가 비율(Opus 5.5 xhigh→medium·high)을 씁니다. 둘 다 없는 조합과 양보한 턴은 미추정이며 절감에 넣지 않습니다. 대조군 턴은 절감이 없습니다. 추정 절감률은 추정 대상 턴에 대한 비율이며 전체 사용량 대비가 아닙니다. 비율은 선택 기간의 전체 기록으로 계산하며 프로젝트·모드 필터의 영향을 받지 않습니다. 로컬 기록만 사용하며 네트워크 요청이 없습니다.</footer>
</main>
<script type="application/json" id="data">${embed({ generatedAt: generatedAt.toISOString(), records: shown })}</script>
<script>
${aggregatorSource()}
</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById('data').textContent);
  const $ = id => document.getElementById(id);
  const n = v => Math.round(v).toLocaleString('en-US');
  const el = (tag, attrs = {}, text) => {
    const node = attrs.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (k !== 'svg') node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = (tag, attrs, text) => el(tag, { ...attrs, svg: true }, text);

  $('generated').textContent = '생성 ' + new Date(data.generatedAt).toLocaleString() + ' · 기록 ' + data.records.length + '건';
  const theme = $('theme');
  const setTheme = dark => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    theme.textContent = dark ? '라이트 모드' : '다크 모드';
    theme.setAttribute('aria-pressed', String(dark));
    try { localStorage.setItem('jet-router-theme', dark ? 'dark' : 'light'); } catch {}
  };
  let saved = null;
  try { saved = localStorage.getItem('jet-router-theme'); } catch {}
  setTheme(saved === 'dark');
  theme.addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));

  const days = data.records.map(r => GROUPS.day(r)).sort();
  if (days.length) { $('from').value = days[0]; $('to').value = days.at(-1); }
  const projects = [...new Set(data.records.map(r => r.project ?? '(unknown)'))].sort();
  $('project').append(el('option', { value: '' }, '전체'), ...projects.map(p => el('option', { value: p }, p)));

  function card(label, value, note) {
    const box = el('div', { class: 'card' });
    box.append(el('div', { class: 'label' }, label), el('div', { class: 'value' }, value));
    if (note) box.append(el('div', { class: 'label' }, note));
    return box;
  }

  function table(rows, head) {
    if (!rows.length) return el('div', { class: 'empty' }, '선택한 범위에 기록이 없습니다.');
    const t = el('table');
    const hr = el('tr');
    for (const h of head) hr.append(el('th', {}, h));
    const thead = el('thead');
    thead.append(hr);
    t.append(thead);
    const body = el('tbody');
    for (const r of rows) {
      const tr = el('tr');
      for (const cell of [r.key, n(r.turns), n(r.applied), n(r.upshifts), n(r.yielded), n(r.holdout), n(r.skipped), n(r.output),
        n(r.estimatedSaved) + ' (' + n(r.estimatedTurns) + '턴, 측정 ' + n(r.measuredTurns) + ')', n(r.unestimatedAppliedTurns) + '턴', n(r.shadowPotentialSaved)]) {
        tr.append(el('td', {}, cell));
      }
      body.append(tr);
    }
    t.append(body);
    return t;
  }
  const HEAD = ['구분', '턴', '적용', '상향', '양보', '대조군', '생략', '출력 토큰', '추정 절감', '미추정 적용', 'shadow 잠재 절감'];

  function series(rows) {
    if (!rows.length) return el('div', { class: 'empty' }, '선택한 범위에 기록이 없습니다.');
    const W = 720, H = 280, L = 56, B = 40, T = 12;
    const max = Math.max(1, ...rows.map(r => Math.max(r.output, r.estimatedSaved)));
    const step = (W - L - 8) / rows.length, bar = Math.max(2, Math.min(28, step / 2.6));
    const y = v => T + (H - T - B) * (1 - v / max);
    const chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': '기간별 출력 토큰과 추정 절감' });
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4;
      chart.append(svg('line', { x1: L, x2: W - 8, y1: y(v), y2: y(v), stroke: 'var(--line)' }));
      chart.append(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, n(v)));
    }
    const every = Math.ceil(rows.length / 8);
    rows.forEach((r, i) => {
      const x = L + step * i + step / 2;
      const a = svg('rect', { x: x - bar - 1, y: y(r.output), width: bar, height: y(0) - y(r.output), fill: 'var(--actual)', rx: 2 });
      a.append(svg('title', {}, r.key + ' 실제 출력 ' + n(r.output)));
      const s = svg('rect', { x: x + 1, y: y(Math.max(0, r.estimatedSaved)), width: bar, height: y(0) - y(Math.max(0, r.estimatedSaved)), fill: 'var(--saved)', rx: 2 });
      s.append(svg('title', {}, r.key + ' 추정 절감 ' + n(r.estimatedSaved)));
      chart.append(a, s);
      if (i % every === 0) chart.append(svg('text', { x, y: H - B + 16, 'text-anchor': 'middle' }, r.key));
    });
    return chart;
  }

  function ratios(factors) {
    const rows = factors;
    if (!rows.length) return el('div', { class: 'empty' }, '대조군과 비교할 enforce 기록이 아직 없습니다.');
    const W = 720, rowH = 34, L = 210, R = 24, T = 20, H = T + rows.length * rowH + 24;
    const values = rows.flatMap(f => [f.outputRatio, f.ci95[0], f.ci95[1], SAVINGS_FACTORS[f.model]?.[f.pair]?.outputRatio]).filter(v => typeof v === 'number');
    const max = Math.max(1.2, ...values) * 1.05;
    const x = v => L + (W - L - R) * v / max;
    const chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': '조합별 측정 비율' });
    chart.append(svg('line', { x1: x(1), x2: x(1), y1: T - 8, y2: H - 20, stroke: 'var(--ref)', 'stroke-dasharray': '4 4' }));
    chart.append(svg('text', { x: x(1), y: T - 10, 'text-anchor': 'middle' }, '1.0 (변화 없음)'));
    rows.forEach((f, i) => {
      const cy = T + rowH * i + rowH / 2;
      const color = f.usable ? 'var(--measured)' : 'var(--weak)';
      chart.append(svg('text', { x: L - 10, y: cy + 4, 'text-anchor': 'end' }, f.model.replace('claude-', '') + ' · ' + f.pair + '  (' + f.treatmentTurns + '/' + f.controlTurns + ')'));
      if (f.usable && f.ci95[0] !== null) {
        // Caps keep a narrow interval visible behind the dot.
        chart.append(svg('line', { x1: x(f.ci95[0]), x2: x(f.ci95[1]), y1: cy, y2: cy, stroke: color, 'stroke-width': 3 }));
        for (const end of f.ci95) chart.append(svg('line', { x1: x(end), x2: x(end), y1: cy - 7, y2: cy + 7, stroke: color, 'stroke-width': 2 }));
      }
      if (f.outputRatio !== null) {
        const dot = svg('circle', { cx: x(f.outputRatio), cy, r: 6, fill: color });
        dot.append(svg('title', {}, f.pair + ' 비율 ' + f.outputRatio.toFixed(3) + (f.usable ? ' (' + f.ci95[0].toFixed(3) + '–' + f.ci95[1].toFixed(3) + ')' : ' 표본 부족')));
        chart.append(dot, svg('text', { x: x(Math.max(f.outputRatio, f.ci95[1] ?? 0)) + 10, y: cy + 4 },
          f.outputRatio.toFixed(3) + (f.usable ? ' (' + f.ci95[0].toFixed(3) + '–' + f.ci95[1].toFixed(3) + ')' : ' 표본 부족')));
      } else if (!SAVINGS_FACTORS[f.model]?.[f.pair]) {
        chart.append(svg('text', { x: L + 4, y: cy + 4 }, f.controlTurns ? '적용 턴 없음' : '대조군 없음'));
      }
      const evaluated = SAVINGS_FACTORS[f.model]?.[f.pair];
      if (evaluated) {
        const mark = svg('rect', { x: x(evaluated.outputRatio) - 4, y: cy - 4, width: 8, height: 8, fill: 'var(--saved)', transform: 'rotate(45 ' + x(evaluated.outputRatio) + ' ' + cy + ')' });
        mark.append(svg('title', {}, '평가 비율 ' + evaluated.outputRatio.toFixed(3)));
        chart.append(mark);
      }
    });
    for (const v of [0, 0.5, 1, 1.5, 2, 3].filter(v => v <= max)) chart.append(svg('text', { x: x(v), y: H - 4, 'text-anchor': 'middle' }, v.toFixed(1)));
    return chart;
  }

  function render() {
    const project = $('project').value, mode = $('mode').value;
    const records = data.records.filter(r => (!project || (r.project ?? '(unknown)') === project) && (!mode || r.mode === mode));
    const range = { from: $('from').value || undefined, to: $('to').value || undefined, factorRecords: data.records };
    const bucket = report(records, { by: [$('bucket').value], ...range });
    const t = bucket.total;
    const rate = t.estimatedBaselineOutput ? (100 * t.estimatedSaved / t.estimatedBaselineOutput).toFixed(1) + '%' : '-';
    $('cards').replaceChildren(
      card('턴', n(t.turns), 'enforce ' + n(t.enforceTurns) + ' · shadow ' + n(t.turns - t.enforceTurns)),
      card('적용', n(t.applied), '상향 ' + n(t.upshifts) + ' · 양보 ' + n(t.yielded)),
      card('대조군', n(t.holdout), '생략 ' + n(t.skipped)),
      card('출력 토큰', n(t.output)),
      card('추정 절감', n(t.estimatedSaved), n(t.estimatedTurns) + '턴 · 측정 ' + n(t.measuredTurns)),
      card('추정 대상 절감률', rate, '미추정 적용 ' + n(t.unestimatedAppliedTurns) + '턴'),
      card('shadow 잠재 절감', n(t.shadowPotentialSaved), n(t.shadowEstimatedTurns) + '턴'));
    $('series').replaceChildren(series(bucket.rows));
    $('ratios').replaceChildren(ratios(bucket.factors));
    const byProject = report(records, { by: ['project'], ...range });
    $('projects').replaceChildren(table([...byProject.rows].sort((a, b) => b.estimatedSaved - a.estimatedSaved), HEAD));
    $('pairs').replaceChildren(table(report(records, { by: ['pair'], ...range }).rows, HEAD));
  }
  for (const id of ['from', 'to', 'project', 'mode', 'bucket']) $(id).addEventListener('change', render);
  render();
})();
</script>
</body>
</html>
`;
}
