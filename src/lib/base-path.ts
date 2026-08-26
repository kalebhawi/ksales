export const BASE_PATH = "/sales";

export function apiUrl(path: string) {
  return `${BASE_PATH}/api${path}`;
}
