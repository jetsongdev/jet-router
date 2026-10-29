export function authorize(request, permission) {
  return request.principal?.tenant === request.tenant &&
    Array.isArray(request.principal?.permissions) &&
    request.principal.permissions.includes(permission);
}
