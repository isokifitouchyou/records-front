import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  clearApiUrl,
  clearToken,
  getApiUrl,
  getToken,
  setApiUrl,
  setToken,
  onUnauthorized,
} from "./api";

function formatLocalFromUtcIso(utcIso) {
  if (!utcIso) return "";
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return String(utcIso);
  return d.toLocaleString();
}

function isMobileLike() {
  // táctil / “coarse pointer” suele ser móvil/tablet
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

// --- JWT exp helpers (opcional pero útil) ---
function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = String(token || "").split(".");
    if (!payloadB64) return null;

    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getJwtExpMs(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000; // exp en segundos -> ms
}

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mobileLike] = useState(() => isMobileLike());

  // Pantallas
  const [screen, setScreen] = useState("records"); // "records" | "shortcuts"

  // Login
  const [apiUrl, setApiUrlState] = useState(getApiUrl() || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Records
  const [records, setRecords] = useState([]);
  const [newRecordText, setNewRecordText] = useState("");
  const recordInputRef = useRef(null);

  // Shortcuts
  const [shortcuts, setShortcuts] = useState([]);
  const [newShortcutText, setNewShortcutText] = useState("");
  const shortcutInputRef = useRef(null);

  // edición in-place (compartida)
  const [editingType, setEditingType] = useState(""); // "record" | "shortcut" | ""
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");

  // reenfoque tras operaciones (porque disabled+focus no funciona)
  const [shouldRefocus, setShouldRefocus] = useState(""); // "record" | "shortcut" | ""

  const isLogged = useMemo(() => Boolean(token), [token]);

  function doLogout(message = "") {
    clearToken();
    setTokenState("");
    setError(message);

    // limpiar credenciales del formulario
    setUsername("");
    setPassword("");

    // limpiar estado app
    setRecords([]);
    setShortcuts([]);
    setEditingType("");
    setEditingId("");
    setEditingText("");

    // opcional: limpiar textos de creación/inputs
    setNewRecordText("");
    setNewShortcutText("");
    setShouldRefocus("");
  }

  // ✅ Si cualquier request devuelve 401, api.js llama a esto automáticamente
  useEffect(() => {
    const unsub = onUnauthorized((msg) => {
      doLogout(msg || "Sesión caducada. Vuelve a entrar.");
    });
    return unsub;
  }, []);

  // ✅ Logout automático al llegar la expiración del JWT (opcional)
  useEffect(() => {
    if (!token) return;

    const expMs = getJwtExpMs(token);
    if (!expMs) return;

    const SKEW_MS = 5000;
    const delay = Math.max(0, expMs - Date.now() - SKEW_MS);

    const id = setTimeout(() => {
      doLogout("Sesión caducada. Vuelve a entrar.");
    }, delay);

    return () => clearTimeout(id);
  }, [token]);

  useEffect(() => {
    if (!loading && shouldRefocus === "record") {
      recordInputRef.current?.focus();
      setShouldRefocus("");
    } else if (!loading && shouldRefocus === "shortcut") {
      shortcutInputRef.current?.focus();
      setShouldRefocus("");
    }
  }, [loading, shouldRefocus]);

  async function loadRecords() {
    const { records } = await api.listRecords();
    setRecords(records || []);
  }

  async function loadShortcuts() {
    const { shortcuts } = await api.listShortcuts();
    setShortcuts(shortcuts || []);
  }

  async function refreshCurrentScreen() {
    if (screen === "records") await loadRecords();
    else await loadShortcuts();
  }

  useEffect(() => {
    if (!isLogged) return;

    // al entrar, carga ambos para que cambiar de pantalla sea instantáneo
    (async () => {
      setError("");
      setLoading(true);
      try {
        await Promise.all([loadRecords(), loadShortcuts()]);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLogged]);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const normalized = setApiUrl(apiUrl);
      if (!/^https?:\/\/.+/i.test(normalized)) {
        throw new Error("La URL de la API debe empezar por http:// o https://");
      }
      const { token } = await api.login(username, password);
      setToken(token);
      setTokenState(token);

      // opcional: por seguridad, limpiar password tras login
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    doLogout("");
  }

  function handleResetApiUrl() {
    clearApiUrl();
    doLogout("");
    setApiUrlState("");
  }

  function startEdit(type, item) {
    setEditingType(type);
    setEditingId(item.id);
    setEditingText(item.text || "");
  }

  function cancelEdit() {
    setEditingType("");
    setEditingId("");
    setEditingText("");
  }

  async function saveEdit() {
    setError("");
    setLoading(true);
    try {
      const text = editingText.trim();
      if (!text) throw new Error("El texto no puede estar vacío.");

      if (editingType === "record") {
        await api.updateRecord(editingId, text);
        await loadRecords();
      } else if (editingType === "shortcut") {
        await api.updateShortcut(editingId, text);
        await loadShortcuts();
      }

      cancelEdit();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createRecordFromInput() {
    setError("");
    setLoading(true);
    try {
      const text = newRecordText.trim();
      if (!text) throw new Error("El texto no puede estar vacío.");

      await api.createRecord(text);
      setNewRecordText("");
      setShouldRefocus("record");
      await loadRecords();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createShortcutFromInput() {
    setError("");
    setLoading(true);
    try {
      const text = newShortcutText.trim();
      if (!text) throw new Error("El texto no puede estar vacío.");

      await api.createShortcut(text);
      setNewShortcutText("");
      setShouldRefocus("shortcut");
      await loadShortcuts();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecord(id) {
    const ok = window.confirm("¿Seguro que quieres borrar este registro?");
    if (!ok) return;

    setError("");
    setLoading(true);
    try {
      await api.deleteRecord(id);
      if (editingType === "record" && editingId === id) cancelEdit();
      await loadRecords();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteShortcut(id) {
    const ok = window.confirm("¿Seguro que quieres borrar este acceso directo?");
    if (!ok) return;

    setError("");
    setLoading(true);
    try {
      await api.deleteShortcut(id);
      if (editingType === "shortcut" && editingId === id) cancelEdit();
      await loadShortcuts();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function registerFromShortcut(text) {
    setError("");
    setLoading(true);
    try {
      const t = String(text || "").trim();
      if (!t) throw new Error("El texto del shortcut está vacío.");

      await api.createRecord(t);
      await loadRecords();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isLogged) {
    return (
      <div style={{ maxWidth: 460, margin: "40px auto", padding: 16 }}>
        <h2>Login</h2>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <label>
            URL de la API
            <input className="input" value={apiUrl} onChange={(e) => setApiUrlState(e.target.value)} />
          </label>

          <label>
            Usuario
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>

          <label>
            Contraseña
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn btnPrimary" disabled={loading}>
            Entrar
          </button>

          <button className="btn" type="button" onClick={handleResetApiUrl} disabled={loading}>
            Borrar URL y sesión
          </button>
        </form>

        {error && <p style={{ color: "#fb7185" }}>{error}</p>}
        <p className="muted" style={{ marginTop: 10 }}>
          La API debe exponer <code>/auth/login</code>, <code>/records</code> y <code>/shortcuts</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16 }}>
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>{screen === "records" ? "Registros" : "Accesos directos"}</h2>
          <div className="muted">
            API: <code>{getApiUrl()}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setScreen("records")} disabled={loading || screen === "records"}>
            Registros
          </button>
          <button className="btn" onClick={() => setScreen("shortcuts")} disabled={loading || screen === "shortcuts"}>
            Shortcuts
          </button>
          <button className="btn" onClick={refreshCurrentScreen} disabled={loading}>
            Recargar
          </button>
          <button className="btn" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#fb7185" }}>{error}</p>}
      {loading && <p className="muted">Cargando...</p>}

      {screen === "records" ? (
        <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
          <div className="toolbar" style={{ padding: 12, gap: 10, alignItems: "stretch" }}>
            <strong style={{ paddingTop: 6 }}>Nuevo registro</strong>

            <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "stretch" }}>
              <textarea
                ref={recordInputRef}
                className="input"
                rows={mobileLike ? 3 : 2}
                placeholder={
                  mobileLike
                    ? "Escribe un texto..."
                    : "Escribe un texto (Enter envía, Shift+Enter salto de línea)..."
                }
                value={newRecordText}
                onChange={(e) => setNewRecordText(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  // Móvil: Enter = salto de línea normal; enviar con botón
                  if (mobileLike) return;

                  // PC: Enter envía, Shift+Enter salto de línea
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading && newRecordText.trim()) createRecordFromInput();
                  }
                }}
              />

              <button
                className="btn btnPrimary"
                onClick={createRecordFromInput}
                disabled={loading || !newRecordText.trim()}
              >
                {mobileLike ? "Enviar" : "Guardar"}
              </button>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th className="th" style={{ width: 220 }}>
                  Fecha (local)
                </th>
                <th className="th">Texto</th>
                <th className="th" style={{ width: 190, textAlign: "center" }}>
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {records.map((r) => {
                const isEditing = editingType === "record" && editingId === r.id;

                return (
                  <tr key={r.id}>
                    <td className="td" style={{ fontFamily: "monospace" }}>
                      {formatLocalFromUtcIso(r.tsUtc)}
                    </td>

                    <td className="td" style={{ whiteSpace: "pre-wrap" }}>
                      {isEditing ? (
                        <textarea
                          className="input"
                          rows={mobileLike ? 3 : 2}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          disabled={loading}
                          onKeyDown={(e) => {
                            if (mobileLike) return;

                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (!loading && editingText.trim()) saveEdit();
                            }
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        r.text
                      )}
                    </td>

                    <td className="td" style={{ textAlign: "center" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          <button className="btn btnPrimary" onClick={saveEdit} disabled={loading}>
                            Guardar
                          </button>
                          <button className="btn" onClick={cancelEdit} disabled={loading}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          <button className="btn btnPrimary" onClick={() => startEdit("record", r)} disabled={loading}>
                            Editar
                          </button>
                          <button className="btn" onClick={() => deleteRecord(r.id)} disabled={loading} title="Borrar">
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {records.length === 0 && (
                <tr>
                  <td className="td muted" colSpan={3}>
                    No hay registros todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
          <div className="toolbar" style={{ padding: 12, gap: 10, alignItems: "stretch" }}>
            <strong style={{ paddingTop: 6 }}>Nuevo shortcut</strong>

            <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "stretch" }}>
              <textarea
                ref={shortcutInputRef}
                className="input"
                rows={mobileLike ? 3 : 2}
                placeholder={
                  mobileLike
                    ? "Texto del acceso directo..."
                    : "Texto del acceso directo (Enter guarda, Shift+Enter salto de línea)..."
                }
                value={newShortcutText}
                onChange={(e) => setNewShortcutText(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (mobileLike) return;

                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading && newShortcutText.trim()) createShortcutFromInput();
                  }
                }}
              />

              <button
                className="btn btnPrimary"
                onClick={createShortcutFromInput}
                disabled={loading || !newShortcutText.trim()}
              >
                Guardar
              </button>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th className="th" style={{ width: 220 }}>
                  Fecha (local)
                </th>
                <th className="th">Texto</th>
                <th className="th" style={{ width: 260, textAlign: "center" }}>
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {shortcuts.map((s) => {
                const isEditing = editingType === "shortcut" && editingId === s.id;

                return (
                  <tr key={s.id}>
                    <td className="td" style={{ fontFamily: "monospace" }}>
                      {formatLocalFromUtcIso(s.tsUtc)}
                    </td>

                    <td className="td" style={{ whiteSpace: "pre-wrap" }}>
                      {isEditing ? (
                        <textarea
                          className="input"
                          rows={mobileLike ? 3 : 2}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          disabled={loading}
                          onKeyDown={(e) => {
                            if (mobileLike) return;

                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (!loading && editingText.trim()) saveEdit();
                            }
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        s.text
                      )}
                    </td>

                    <td className="td" style={{ textAlign: "center" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          <button className="btn btnPrimary" onClick={saveEdit} disabled={loading}>
                            Guardar
                          </button>
                          <button className="btn" onClick={cancelEdit} disabled={loading}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            className="btn btnPrimary"
                            onClick={() => registerFromShortcut(s.text)}
                            disabled={loading}
                            title="Crea un registro con este texto"
                          >
                            Registrar
                          </button>

                          <button className="btn" onClick={() => startEdit("shortcut", s)} disabled={loading}>
                            Editar
                          </button>

                          <button className="btn" onClick={() => deleteShortcut(s.id)} disabled={loading} title="Borrar">
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {shortcuts.length === 0 && (
                <tr>
                  <td className="td muted" colSpan={3}>
                    No hay shortcuts todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="muted" style={{ padding: 12, margin: 0 }}>
            Pulsa <strong>Registrar</strong> para crear un registro en el servidor con ese texto.
          </p>
        </div>
      )}

      <p className="muted" style={{ marginTop: 12 }}>
        En PC: Enter envía y Shift+Enter inserta salto de línea. En móvil: Enter inserta salto de línea y se envía con el
        botón.
      </p>
    </div>
  );
}
