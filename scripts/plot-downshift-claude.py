"""Render the Claude downshift comparison; requires matplotlib, no network calls."""
import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root = Path(sys.argv[1])
summary = json.loads((root / 'summary.json').read_text())
rows = summary['perTask']
fig, axes = plt.subplots(3, 1, figsize=(10, 11), layout='constrained')
fig.suptitle('Jev downshift on Claude Opus 5.5: measured tokens and quality', fontsize=17, fontweight='bold')
x = list(range(len(rows)))
for arm, offset, color, label in [('baseline', -.18, '#65758b', 'Default xhigh'), ('recommended', .18, '#c2410c', 'Jev recommendation')]:
    values = [r[arm]['output'] / r[arm]['runs'] for r in rows]
    axes[0].bar([i + offset for i in x], values, width=.35, color=color, label=label)
    for i, value in enumerate(values):
        axes[0].text(i + offset, value + max(values)*.02, f'{value:.0f}', ha='center', fontsize=9)
axes[0].set_xticks(x, [f"{r['task']}\nxhigh → {r['effort']}" for r in rows])
axes[0].set_ylabel('Mean output tokens / run')
axes[0].set_title(f"Output reduction: {summary['outputReductionPct']:.1f}% | Passing runs: {summary['baseline']['passes']}/{summary['baseline']['runs']} vs {summary['recommended']['passes']}/{summary['recommended']['runs']}", loc='left')
axes[0].legend(frameon=False)
# Claude reports uncached input, cache reads and cache writes as separate counts.
for i, arm in enumerate(['baseline', 'recommended']):
    r = summary[arm]
    values = [r['input']/r['runs'], r['cacheRead']/r['runs'], r['cacheCreation']/r['runs'], r['output']/r['runs']]
    left = 0
    for value, color, label in zip(values, ['#475569', '#dce3eb', '#94a3b8', '#c2410c'], ['Uncached input', 'Cache read', 'Cache write', 'Output']):
        axes[1].barh(i, value, left=left, color=color, label=label if i == 0 else None)
        left += value
axes[1].set_yticks([0, 1], ['Default xhigh', 'Jev recommendation'])
axes[1].set_xlabel('Mean reported tokens / run')
axes[1].set_title('Input and cache conditions are nearly identical; the difference is output', loc='left')
axes[1].set_ylim(-.5, 1.9)
axes[1].legend(frameon=False, loc='upper right', ncol=4)
for r in rows:
    axes[2].plot([0, 1], [r['baseline']['latencyMs']/r['baseline']['runs']/1000, r['recommended']['latencyMs']/r['recommended']['runs']/1000], marker='o', label=r['task'])
axes[2].set_xticks([0, 1], ['Default xhigh', 'Jev recommendation'])
axes[2].set_ylabel('Mean generation latency (seconds)')
axes[2].set_ylim(bottom=0)
axes[2].set_title('Descriptive latency: sequential runs, alternating order', loc='left')
axes[2].legend(frameon=False)
for ax in axes:
    ax.spines[['top', 'right']].set_visible(False)
    ax.set_axisbelow(True)
    ax.grid(axis='y', alpha=.15)
fig.supxlabel(f"{len(rows)} reused synthetic tasks × 3 pairs; {len(summary['exclusions'])} tasks without downshift excluded.\nIndependent checks; default xhigh is not a proven minimum. Router cost and actual bills unobserved.", fontsize=10)
for extension in ['png', 'svg']:
    fig.savefig(root / f'comparison.{extension}', dpi=160)
svg = root / 'comparison.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')

fig, ax = plt.subplots(figsize=(10, 5), layout='constrained')
labels = [r['task'] for r in rows] + ['Total']
base = [r['baseline']['costUsd'] for r in rows] + [summary['baseline']['costUsd']]
rec = [r['recommended']['costUsd'] for r in rows] + [summary['recommended']['costUsd']]
x = list(range(len(labels)))
for values, offset, color, label in [(base, -.18, '#65758b', 'Default xhigh'), (rec, .18, '#c2410c', 'Jev recommendation')]:
    ax.bar([i+offset for i in x], values, width=.35, color=color, label=label)
    for i, value in enumerate(values):
        ax.text(i+offset, value+max(base)*.015, f'${value:.3f}', ha='center', fontsize=9)
ax.set_xticks(x, [f"{label}\nSaving: {100*(b-r)/b:.1f}%" for label, b, r in zip(labels, base, rec)])
ax.set_ylim(0, max(base)*1.18)
ax.set_ylabel('CLI-reported USD (3 runs per task)')
ax.set_title('Claude Code reported cost: same cache conditions', fontsize=15, fontweight='bold')
ax.legend(frameon=False)
ax.spines[['top', 'right']].set_visible(False)
ax.set_axisbelow(True)
ax.grid(axis='y', alpha=.15)
fig.supxlabel('total_cost_usd from `claude -p` JSON output (API rate-card estimate).\nJev cost excluded; not an actual Team subscription invoice.', fontsize=9)
for extension in ['png', 'svg']:
    fig.savefig(root / f'costs.{extension}', dpi=160)
svg = root / 'costs.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
