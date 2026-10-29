export function serializeError(error) {
  const result = { name: error.name, message: error.message };
  if (error.code !== undefined) result.code = error.code;
  return result;
}
