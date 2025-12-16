import { useEffect, useMemo, useRef, useState } from "react";
import { api, clearApiUrl, clearToken, getApiUrl, getToken, setApiUrl, setToken } from "./api";

function formatLocalFromUtcIso(utcIso) {
  if (!utcIso) return "";
  const d = new Date(utcIso); // interpreta ISO con Z como UTC
  if (Number.isNaN(d.getTime())) return String(utcIso);
  return d.toLocaleString(); // formato local del navegador
}

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login
  const [apiUrl, setApiUrlState] = useState(getApiUrl() || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Records
  const [records, setRecords] = useState([]);
  const [newText, setNewText] = useState("");

  // edición in-place
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");

  const inputRef = useRef(null);

  const isLogged = useMemo(() => Boolean(token), [token]);

  async function loadRecords() {
    setError("");
    setLoading(true);
    try {
      const { records } = await api.listRecords();
      setRecords(records || []);
    } catch (e) {
      setRecords([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLogged) loadRecords();
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
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    setTokenState("");
    setRecords([]);
    setError("");
    setEditingId("");
    setEditingText("");
  }

  function handleResetApiUrl() {
    clearApiUrl();
    clearToken();
    setTokenState("");
    setRecords([]);
    setApiUrlState("");
    setUsername("");
    setPassword("");
    setError("");
    setEditingId("");
    setEditingText("");
  }

  async function createRecord() {
    setError("");
    setLoading(true);
    try {
      const text = newText.trim();
      if (!text) throw new Error("El texto no puede estar vacío.");
      await api.createRecord(text);

      // IMPORTANTE: no limpiamos el input (lo dejas listo con el mismo texto)
      // Si prefieres dejarlo vacío pero preparado, dímelo y lo cambiamos.
      setNewText("");

      await loadRecords();

      // Re-enfocar el input para seguir metiendo textos
      inputRef.current?.focus();
      inputRef.current?.select?.(); // selecciona el texto para sobrescribir rápido
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditingText(r.text || "");
  }

  function cancelEdit() {
    setEditingId("");
    setEditingText("");
  }

  async function saveEdit() {
    setError("");
    setLoading(true);
    try {
      const text = editingText.trim();
      if (!text) throw new Error("El texto no puede estar vacío.");
      await api.updateRecord(editingId, text);
      cancelEdit();
      await loadRecords();
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
      if (editingId === id) cancelEdit();
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
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          <button className="btn btnPrimary" disabled={loading}>Entrar</button>

          <button className="btn" type="button" onClick={handleResetApiUrl} disabled={loading}>
            Borrar URL y sesión
          </button>
        </form>

        {error && <p style={{ color: "#fb7185" }}>{error}</p>}
        <p className="muted" style={{ marginTop: 10 }}>
          La API debe exponer <code>/auth/login</code> y <code>/records</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16 }}>
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Registros</h2>
          <div className="muted">
            API: <code>{getApiUrl()}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={loadRecords} disabled={loading}>Recargar</button>
          <button className="btn" onClick={handleLogout}>Salir</button>
        </div>
      </div>

      {error && <p style={{ color: "#fb7185" }}>{error}</p>}
      {loading && <p className="muted">Cargando...</p>}

      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        <div className="toolbar" style={{ padding: 12, gap: 10 }}>
          <strong>Nuevo registro</strong>

          <div style={{ display: "flex", gap: 8, flex: 1 }}>
            <input
              ref={inputRef}
              className="input"
              placeholder="Escribe un texto y pulsa Enter..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!loading && newText.trim()) createRecord();
                }
              }}
            />
            <button className="btn btnPrimary" onClick={createRecord} disabled={loading || !newText.trim()}>
              Guardar
            </button>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th className="th" style={{ width: 220 }}>Fecha (local)</th>
              <th className="th">Texto</th>
              <th className="th" style={{ width: 190, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {records.map((r) => {
              const isEditing = editingId === r.id;

              return (
                <tr key={r.id}>
                  <td className="td" style={{ fontFamily: "monospace" }}>
                    {formatLocalFromUtcIso(r.tsUtc)}
                  </td>

                  <td className="td">
                    {isEditing ? (
                      <input
                        className="input"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        disabled={loading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
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
                        <button className="btn btnPrimary" onClick={() => startEdit(r)} disabled={loading}>
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

      <p className="muted" style={{ marginTop: 12 }}>
        El servidor guarda el timestamp en UTC por consistencia, y aquí se muestra en hora local.
      </p>
    </div>
  );
}
