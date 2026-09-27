"""Plot saved task outcomes; no model calls. Requires matplotlib."""
import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(sys.argv[1])
names = ['medium', 'current', '01', '02', '03', 'holdout-medium', 'holdout-current']
labels = ['Medium', 'Jev current', 'Variant 1', 'Variant 2', 'Variant 3', 'Medium\n(holdout)', 'Jev\n(holdout)']
reports = [json.loads((root / f'{name}-run/report.json').read_text()) for name in names]
assert all(r['complete'] for r in reports)
rows = [r['results'] for r in reports]
colors = ['#63758b', '#087f8c', '#b3bbc6', '#b3bbc6', '#b3bbc6', '#63758b', '#087f8c']
x = list(range(len(names)))
fig, axes = plt.subplots(3, 1, figsize=(11, 10), layout='constrained')
fig.suptitle('Actual coding outcomes: no quality gain observed', fontsize=17, fontweight='bold')
passed = [sum(row['passed'] for row in group) for group in rows]
axes[0].bar(x, [100 * n / len(group) for n, group in zip(passed, rows)], color=colors)
for i, (n, group) in enumerate(zip(passed, rows)):
    axes[0].text(i, 103, f'{n}/{len(group)}', ha='center')
axes[0].set_ylim(0, 118)
axes[0].set_ylabel('Fully passing runs (%)')
axes[0].set_title('Same frozen checks; three variants tied and were discarded', loc='left')
# Per-run means keep the smaller holdout groups comparable in scale, not difficulty.
outputs = [sum(row['usage']['output_tokens'] for row in group) / len(group) for group in rows]
axes[1].bar(x, outputs, color=colors)
for i, value in enumerate(outputs):
    axes[1].text(i, value + 15, f'{value:.0f}', ha='center')
axes[1].set_ylim(0, max(outputs) * 1.2)
axes[1].set_ylabel('Mean output tokens / run')
axes[1].set_title('Reported usage; reasoning tokens are not added again', loc='left')
for i, group in enumerate(rows):
    values = [row['latencyMs'] / 1000 for row in group]
    offsets = [(j - (len(values) - 1) / 2) * .035 for j in range(len(values))]
    axes[2].scatter([i + offset for offset in offsets], values, color=colors[i], alpha=.8)
    axes[2].plot([i - .25, i + .25], [sum(values) / len(values)] * 2, color='#172b4d', linewidth=2)
axes[2].set_ylim(bottom=0)
axes[2].set_ylabel('Generation latency (seconds)')
axes[2].set_title('Dots: individual runs; horizontal lines: means', loc='left')
for ax in axes:
    ax.set_xticks(x, labels)
    ax.axvline(4.5, color='#aab2bd', linestyle='--')
    ax.spines[['top', 'right']].set_visible(False)
    ax.grid(axis='y', alpha=.15)
    ax.set_axisbelow(True)
fig.supxlabel('Development: 4 tasks × 2 repeats per arm | Holdout: 2 different tasks × 2 repeats\n48 fresh Codex sessions; sequential calls and cache differences limit causal cost/latency claims.', fontsize=10)
for suffix in ['png', 'svg']:
    fig.savefig(root / f'outcomes.{suffix}', dpi=170)
# Matplotlib SVG paths contain trailing spaces; normalize for repository checks.
svg = root / 'outcomes.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
