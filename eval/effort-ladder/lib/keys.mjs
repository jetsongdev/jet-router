import { openSync, closeSync, fstatSync, readSync, realpathSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
const names = ['ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY'];
const fail = code => Object.assign(new Error(code), { code });

export function loadKeys(path = process.env.LADDER_KEYS_FILE || '/Users/chsong/.config/effort-router/keys.env') {
  let fd;
  try {
    const actual = realpathSync(resolve(path));
    const rel = relative(repo, actual);
    if (rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw fail('inside-repository');
    fd = openSync(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw fail('missing');
    if ((stat.mode & 0o7777) !== 0o600) throw fail('insecure-mode');
    if (stat.uid !== process.getuid()) throw fail('not-owner');
    if (stat.size > 65536) throw fail('too-large');
    const buffer = Buffer.alloc(65537);
    let used = 0, count;
    while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
    if (used > 65536) throw fail('too-large');
    const lines = buffer.subarray(0, used).toString('utf8').split(/\r?\n/);
    const result = {};
    for (const name of names) {
      const entries = lines.filter(line => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line));
      if (entries.length !== 1) continue;
      const value = entries[0].replace(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*`), '').trim();
      const quoted = value.match(/^(["'])([^"'\r\n]*)\1\s*(?:#.*)?$/);
      if (quoted) result[name] = quoted[2];
      else if (value === '') result[name] = '';
      else if (/^[^\s"']+(?:\s+#.*)?$/.test(value)) result[name] = value.split(/\s+#/)[0];
    }
    return result;
  } catch (error) {
    if (['inside-repository', 'missing', 'insecure-mode', 'not-owner', 'too-large'].includes(error.code)) throw error;
    throw fail(error.code === 'ENOENT' ? 'missing' : 'unreadable');
  } finally { if (fd !== undefined) closeSync(fd); }
}
