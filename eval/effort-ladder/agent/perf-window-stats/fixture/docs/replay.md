# Replay semantics

Process events in arrival order, not timestamp order. After advancing the watermark, expire all previously retained events at or before the lower boundary. Insert the current event only when its timestamp lies strictly above that boundary; a late event exactly on the boundary is discarded, as is one older than it. A late event inside the interval contributes immediately, even after a newer event. Such rejected arrivals still produce a snapshot, whose watermark never moves backward. Equal timestamps and equal values are independent measurements, not retries or duplicates.

There is no final flush. Every snapshot reflects only the arrivals through its own index. Width and percentile stay fixed throughout a replay. This document describes the same contract for both online and offline replay, so the implementation may preprocess the known input without changing arrival-order results.
