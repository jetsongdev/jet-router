export function parseArgs(args, definitions) {
  const options = {};
  const positional = [];
  const byName = new Map(definitions.map(definition => [definition.name, definition]));
  for (const definition of definitions) {
    if (definition.default !== undefined) options[definition.name] = definition.default;
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }
    const equal = argument.indexOf('=');
    const name = argument.slice(2, equal < 0 ? undefined : equal);
    const definition = byName.get(name);
    if (!definition) throw new Error(`unknown option: --${name}`);
    if (definition.type === 'boolean') {
      if (equal >= 0) throw new Error(`--${name} takes no value`);
      options[name] = true;
      continue;
    }
    const value = equal < 0 ? args[++index] : argument.slice(equal + 1);
    if (value === undefined) throw new Error(`missing value: --${name}`);
    options[name] = convert(value, definition);
  }
  return { options, positional };
}

function convert(value, definition) {
  if (definition.type === 'integer') {
    if (!/^-?\d+$/.test(value)) throw new Error(`invalid integer: --${definition.name}`);
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`invalid integer: --${definition.name}`);
    return number;
  }
  if (definition.choices && !definition.choices.includes(value)) {
    throw new Error(`invalid value: --${definition.name}`);
  }
  return value;
}

export function usage(command, definitions) {
  const lines = [`Usage: ${command} [options]`, '', 'Options:'];
  for (const definition of definitions) {
    const suffix = definition.type === 'boolean' ? '' : ' VALUE';
    const label = `  --${definition.name}${suffix}`;
    lines.push(`${label.padEnd(24)}${definition.description ?? ''}`);
  }
  return lines.join('\n');
}

export function requirePositionals(values, count) {
  if (values.length !== count) {
    throw new Error(`expected ${count} positional arguments`);
  }
  return values;
}

export function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}
