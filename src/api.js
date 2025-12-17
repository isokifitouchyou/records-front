const TOKEN_KEY = "token";
const API_URL_KEY = "apiUrl";

// -------------------- Token / ApiUrl storage --------------------

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

// -------------------- 401 handling (event) --------------------

let unauthorizedHandlers = [];

/**
 * Permite que el front se suscriba a eventos de "no autorizado" (401).
 * Devuelve una función para desuscribirse.
 */
export function onUnauthorized(fn) {
  unauthorizedHandlers.push(fn);
  return () => {
    unauthorizedHandlers = unauthorizedHandlers.filter((h) => h !== fn);
  };
}

function notifyUnauthorized(message) {
  unauthorizedHandlers.forEach((h) => {
    try {
      h(message);
    } catch {
      // no-op
    }
  });
}

// -------------------- Request helper --------------------

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

  // ✅ Caso especial: 401 => limpiamos token y avisamos a la app
  if (res.status === 401) {
    const msg = data?.error || "Token inválido o caducado.";
    clearToken();
    notifyUnauthorized(msg);
    throw new Error(msg);
  }

  if (!res.ok) {
    const msg = data?.error || `Error HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// -------------------- Public API --------------------

export const api = {
  // Auth (password)
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),

  // Telegram (ahora exige pin)
  requestTelegramCode: (pin) => request("/auth/telegram/request-code", { method: "POST", body: { pin } }),
  verifyTelegramCode: (code) => request("/auth/telegram/verify", { method: "POST", body: { code } }),

  // Records
  listRecords: () => request("/records"),
  createRecord: (text) => request("/records", { method: "POST", body: { text } }),
  updateRecord: (id, text) => request(`/records/${encodeURIComponent(id)}`, { method: "PATCH", body: { text } }),
  deleteRecord: (id) => request(`/records/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Shortcuts
  listShortcuts: () => request("/shortcuts"),
  createShortcut: (text) => request("/shortcuts", { method: "POST", body: { text } }),
  updateShortcut: (id, text) => request(`/shortcuts/${encodeURIComponent(id)}`, { method: "PATCH", body: { text } }),
  deleteShortcut: (id) => request(`/shortcuts/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
