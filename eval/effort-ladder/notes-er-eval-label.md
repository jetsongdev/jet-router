# er-eval-label

- 웨이브: w1, w2, w2m, w3, a1, a2, a3, a4 (a4 부분 웨이브)
- JSON: /Users/chsong/Documents/sidespace/projects/effort-router/.worktrees/effort-ladder/eval/effort-ladder/runs/report/labels.json
- Markdown: /Users/chsong/Documents/sidespace/projects/effort-router/.worktrees/effort-ladder/eval/effort-ladder/runs/report/labels.md
- w1 max 제외: 30건
- 기준 단계는 실제 측정된 최고 단계. rule0는 기준 셀 N에 따른 δ, ruleA는 셀별 1건 관용, ruleF는 단측 Fisher p < 0.1을 사용.
- ruleA·ruleF는 기준 통과율 0.6 미만을 too-hard로 별도 표시. 미측정 중간 단계는 충족으로 보지 않음.
- Agent 과제 meta의 선택 budgetUsd는 노력 단계별 실행 및 예약 예산을 덮어쓰며 없는 값은 기존 기본값을 사용.

| 과제 | 기준 | N | rule0 (상태) | ruleA (상태) | ruleF (상태) | too-hard |
|---|---|---|---|---|---|---|
| ag/batch-rollback-debug | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ag/calc-decimal-cli | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ag/game-round-reducer | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ag/link-lint-scope | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ag/log-window-aggregate | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ag/site-route-repair | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ss/front-matter-fields | max | 균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ss/grid-neighbors | max | 균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ss/heading-index | max | 균일 | xhigh (unstable) | xhigh (ok) | medium (ok) | 아니오 |
| ss/line-winner | max | 균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ss/monthly-occurrences | max | 균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ss/patch-components | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| ss/unit-sum | max | 균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| tq/async-memo | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| tq/intervals | max | 균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| tq/keyed-queue | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| tq/ledger | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| tq/ranges | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |
| tq/ttl-lru | max | 불균일 | low (saturated) | low (saturated) | low (saturated) | 아니오 |

- E1은 rule0 기준이며 unstable·unsolved·미측정 과제는 판정에서 제외.
- 보고서 생성: `node scripts/label-report.mjs --waves w1,w2,w2m,w3,a1,a2,a3,a4` 종료 0.
- 검증: `npm test` 종료 0, 49개 통과, skip 0.
