// Preloaded only in the grader's temporary input directory.
const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const log = __LOG_PATH__;
const root = __INPUT_PATH__;
const append = fs.appendFileSync.bind(fs);
const descriptors = new Map();
function record(value) {
  if (value && typeof value === 'object' && Number.isInteger(value.fd)) value = value.fd;
  if (typeof value === 'number') value = descriptors.get(value);
  if (value instanceof URL) value = fileURLToPath(value);
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value !== 'string') return;
  const resolved = path.resolve(value);
  if (path.dirname(resolved) === root && resolved.endsWith('.md')) append(log, path.basename(resolved) + '\n');
}
function wrap(object, name, fn) {
  const original = object[name];
  if (typeof original === 'function') {
    const wrapped = fn(original);
    for (const symbol of Object.getOwnPropertySymbols(original)) {
      if (symbol !== require('node:util').promisify.custom) Object.defineProperty(wrapped, symbol, Object.getOwnPropertyDescriptor(original, symbol));
    }
    const custom = require('node:util').promisify.custom;
    if (typeof original[custom] === 'function') wrapped[custom] = function (...args) { record(args[0]); return original[custom].apply(this, args); };
    object[name] = wrapped;
  }
}
for (const name of ['readFile', 'readFileSync', 'createReadStream', 'openAsBlob']) {
  wrap(fs, name, original => function (p, ...args) { record(name === 'createReadStream' && args[0]?.fd != null ? args[0].fd : p); return original.call(this, p, ...args); });
}
for (const name of ['read', 'readSync', 'readv', 'readvSync']) {
  wrap(fs, name, original => function (fd, ...args) { record(fd); return original.call(this, fd, ...args); });
}
wrap(fs, 'openSync', original => function (p, ...args) { const fd = original.call(this, p, ...args); descriptors.set(fd, p); return fd; });
wrap(fs, 'open', original => function (p, ...args) {
  const callback = args.pop();
  return original.call(this, p, ...args, (error, fd) => { if (!error) descriptors.set(fd, p); callback(error, fd); });
});
wrap(fs, 'closeSync', original => function (fd, ...args) { try { return original.call(this, fd, ...args); } finally { descriptors.delete(fd); } });
wrap(fs, 'close', original => function (fd, ...args) { descriptors.delete(fd); return original.call(this, fd, ...args); });
wrap(promises, 'readFile', original => function (p, ...args) { record(p); return original.call(this, p, ...args); });
wrap(promises, 'open', original => async function (p, ...args) {
  const handle = await original.call(this, p, ...args);
  descriptors.set(handle.fd, p);
  for (const name of ['read', 'readv', 'readFile', 'readLines', 'createReadStream', 'readableWebStream']) {
    wrap(handle, name, method => function (...methodArgs) { record(p); return method.apply(this, methodArgs); });
  }
  wrap(handle, 'close', method => function (...methodArgs) { descriptors.delete(handle.fd); return method.apply(this, methodArgs); });
  return handle;
});
require('node:module').syncBuiltinESMExports();
