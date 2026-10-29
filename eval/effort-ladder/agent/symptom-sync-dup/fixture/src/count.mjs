export function count(state) { return state.records.filter((x) => !x.deleted).length; }
