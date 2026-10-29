export function requireRecord(value, label = 'value') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

export function requireString(value, label = 'value') {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  return value;
}

export function requireFinite(value, label = 'value') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

export function requireInteger(value, label = 'value') {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be an integer`);
  return value;
}

export function requireArray(value, label = 'value') {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

export function requireFields(record, fields) {
  requireRecord(record);
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) throw new TypeError(`missing field: ${field}`);
  }
  return record;
}

export function optionalString(value, fallback = '') {
  return value === undefined ? fallback : requireString(value);
}

export function optionalNumber(value, fallback = 0) {
  return value === undefined ? fallback : requireFinite(value);
}

export function nonnegative(value, label = 'value') {
  requireFinite(value, label);
  if (value < 0) throw new RangeError(`${label} must be nonnegative`);
  return value;
}

export function oneOf(value, allowed, label = 'value') {
  if (!allowed.includes(value)) throw new RangeError(`invalid ${label}`);
  return value;
}

export function validateEntries(entries, validate) {
  requireArray(entries, 'entries');
  return entries.map((entry, index) => {
    try {
      return validate(entry);
    } catch (cause) {
      throw new TypeError(`invalid entry at index ${index}`, { cause });
    }
  });
}

export function cloneRecord(record) {
  requireRecord(record);
  return structuredClone(record);
}

export function hasOwn(record, name) {
  return Object.hasOwn(requireRecord(record), name);
}

export function nonempty(value, label = 'value') {
  requireString(value, label);
  if (!value.length) throw new RangeError(`${label} must not be empty`);
  return value;
}
