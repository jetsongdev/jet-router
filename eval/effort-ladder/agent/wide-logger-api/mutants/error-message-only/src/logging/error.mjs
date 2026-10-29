export function serializeError(error) {
  const result = { message: error.message };
  if (error.code !== undefined) result.code = error.code;
  return result;
}
