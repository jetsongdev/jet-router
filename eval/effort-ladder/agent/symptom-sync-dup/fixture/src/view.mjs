export function visible(state) { return state.records.filter((x) => !x.deleted); }
