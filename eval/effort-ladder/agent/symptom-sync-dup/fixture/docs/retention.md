# Replay and retention

An operation key is a stable retry id for the whole state: process the first operation with that key and ignore all later occurrences, even if the later payload differs or arrives in another call. Keep seen keys indefinitely. Different keys for the same ID are distinct updates and compete using the version ordering in the README.

A winning deletion remains in records while `now - time < ttl`. Once `now - time >= ttl`, omit that tombstone from records but retain its winning version in fences indefinitely. Fences also track winning live updates. Compare every incoming operation to the fence, including after a tombstone is removed; an older update must not resurrect a deleted item. A newer winning live update replaces the fence and appears in records. Purge expired tombstones after applying the batch, including when the batch is empty. Fences and seen keys are internal state, so omitting a tombstone from records does not erase either of them.
