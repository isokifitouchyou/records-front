const TOKEN_KEY = "token";
const API_URL_KEY = "apiUrl";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getApiUrl() {
  return localStorage.getItem(API_URL_KEY) || "";
}
export function setApiUrl(url) {
  const normalized = String(url || "").trim().replace(/\/+$/, "");
  localStorage.setItem(API_URL_KEY, normalized);
  return normalized;
}
export function clearApiUrl() {
  localStorage.removeItem(API_URL_KEY);
}

function mustHaveApiUrl() {
  const base = getApiUrl();
  if (!base) throw new Error("Falta la URL de la API.");
  return base;
}

async function request(path, { method = "GET", body } = {}) {
  const base = mustHaveApiUrl();
  const token = getToken();

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const msg = data?.error || `Error HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),

  listRecords: () => request("/records"),
  createRecord: (text) => request("/records", { method: "POST", body: { text } }),
  updateRecord: (id, text) => request(`/records/${encodeURIComponent(id)}`, { method: "PATCH", body: { text } }),
  deleteRecord: (id) => request(`/records/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
