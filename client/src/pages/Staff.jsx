import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AdminPage, StatGrid, StatCard, StatusPill, ListPanel, ListRow } from "../components/admin/AdminUI";

const statusOptions = ["clocked_in", "on_break", "absent", "clocked_out"];

export default function AdminStaff() {
  const [staff, setStaff] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftDraft, setShiftDraft] = useState("");
  const [newTask, setNewTask] = useState({ description: "", assignedTo: "", due: "" });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskDraft, setTaskDraft] = useState({ description: "", assignedTo: "", due: "" });
  const [newStaff, setNewStaff] = useState({ name: "", role: "", shift: "", isRider: false, grantLogin: false, email: "", password: "" });
  const [addingStaff, setAddingStaff] = useState(false);
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const load = () =>
    Promise.all([api.getStaff(), api.getTasks()])
      .then(([s, t]) => { setStaff(s.staff); setTasks(t.tasks); })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const handleStatusChange = async (id, status) => {
    setActionError(null);
    try {
      await api.updateStaffStatus(id, status);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const startShiftEdit = (person) => {
    setEditingShiftId(person.id);
    setShiftDraft(person.shift);
  };

  const saveShift = async (id) => {
    setActionError(null);
    try {
      await api.updateStaffShift(id, shiftDraft);
      setEditingShiftId(null);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const toggleTask = async (task) => {
    setActionError(null);
    try {
      await api.updateTask(task.id, { done: !task.done });
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const startTaskEdit = (task) => {
    setEditingTaskId(task.id);
    setTaskDraft({ description: task.description, assignedTo: task.assignedTo, due: task.due });
  };

  const saveTaskEdit = async (id) => {
    setActionError(null);
    try {
      await api.updateTask(id, taskDraft);
      setEditingTaskId(null);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!confirm(`Delete task "${task.description}"?`)) return;
    setActionError(null);
    try {
      await api.deleteTask(task.id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.description || !newTask.assignedTo) return;
    setActionError(null);
    try {
      await api.createTask(newTask);
      setNewTask({ description: "", assignedTo: "", due: "" });
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.role || !newStaff.shift) return;
    setActionError(null);
    setAddingStaff(true);
    try {
      await api.createStaffMember({
        name: newStaff.name,
        role: newStaff.role,
        shift: newStaff.shift,
        isRider: newStaff.isRider,
        ...(newStaff.grantLogin ? { email: newStaff.email, password: newStaff.password } : {})
      });
      setNewStaff({ name: "", role: "", shift: "", isRider: false, grantLogin: false, email: "", password: "" });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setAddingStaff(false);
    }
  };

  const handleRemoveStaff = async (person) => {
    if (!confirm(`Remove ${person.name} from the roster? This also removes their login if they have one.`)) return;
    setActionError(null);
    try {
      await api.deleteStaffMember(person.id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (error) return <AdminPage title="Staff"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load staff: {error}</p></AdminPage>;
  if (!staff || !tasks) return <AdminPage title="Staff"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const onShift = staff.filter((s) => s.status === "clocked_in").length;
  const absent = staff.filter((s) => s.status === "absent").length;

  return (
    <AdminPage eyebrow={`${staff.length} team members`} title="Staff">
      <StatGrid columns={3}>
        <StatCard label="On shift now" value={onShift} />
        <StatCard label="Open tasks" value={tasks.filter((t) => !t.done).length} />
        <StatCard label="Absent today" value={absent} warn={absent > 0} />
      </StatGrid>

      {actionError && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError}</p>}

      <div className="admin-two-col">
        <div>
          <ListPanel>
            {staff.map((s) => (
              <ListRow key={s.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div className="admin-avatar">{s.name.split(" ").map((n) => n[0]).join("")}</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13 }}>
                      {s.name}
                      {s.isRider && (
                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: "var(--a-success-bg)", color: "var(--a-success-text)", padding: "1px 6px", borderRadius: 999 }}>
                          RIDER
                        </span>
                      )}
                    </p>
                    {editingShiftId === s.id ? (
                      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                        <input value={shiftDraft} onChange={(e) => setShiftDraft(e.target.value)} className="admin-inline-input" style={{ width: 90 }} />
                        <button onClick={() => saveShift(s.id)} className="admin-link-btn">Save</button>
                        <button onClick={() => setEditingShiftId(null)} className="admin-link-btn muted">Cancel</button>
                      </div>
                    ) : (
                      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                        {s.role} · {s.shift}
                        {isOwner && <button onClick={() => startShiftEdit(s)} className="admin-link-btn" style={{ marginLeft: 6 }}>edit</button>}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <StatusPill status={s.status} />
                  <select className="admin-select-sm" value={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)}>
                    {statusOptions.map((opt) => <option key={opt} value={opt}>{opt.replace("_", " ")}</option>)}
                  </select>
                  {isOwner && <button onClick={() => handleRemoveStaff(s)} className="admin-link-btn danger">remove</button>}
                </div>
              </ListRow>
            ))}
          </ListPanel>

          {isOwner && (
            <form onSubmit={handleAddStaff} className="admin-form-panel" style={{ marginTop: 14 }}>
              <p className="admin-section-title">Add a staff member</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <input className="admin-search" placeholder="Name" value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                <input className="admin-search" placeholder="Role (e.g. Chef)" value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                <input className="admin-search" placeholder="Shift (e.g. 9am–5pm)" value={newStaff.shift} onChange={(e) => setNewStaff({ ...newStaff, shift: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--a-text-secondary)", marginBottom: 8 }}>
                <input type="checkbox" checked={newStaff.isRider} onChange={(e) => setNewStaff({ ...newStaff, isRider: e.target.checked })} />
                This person is a delivery rider
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--a-text-secondary)", marginBottom: 8 }}>
                <input type="checkbox" checked={newStaff.grantLogin} onChange={(e) => setNewStaff({ ...newStaff, grantLogin: e.target.checked })} />
                Also grant them app access (email + password login)
              </label>
              {newStaff.grantLogin && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <input type="email" className="admin-search" placeholder="Email" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
                  <input type="password" className="admin-search" placeholder="Password (min 6 chars)" value={newStaff.password} onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
                </div>
              )}
              <button type="submit" disabled={addingStaff} className="admin-btn-primary">
                {addingStaff ? "Adding…" : "Add to roster"}
              </button>
            </form>
          )}
        </div>

        <div>
          <div className="admin-form-panel" style={{ marginBottom: 14 }}>
            <p className="admin-section-title">Task assignments</p>
            {tasks.map((t, i) => (
              <div key={t.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: i < tasks.length - 1 ? "1px solid var(--a-border)" : "none" }}>
                <button
                  onClick={() => toggleTask(t)}
                  className="admin-link-btn"
                  style={{ fontSize: 13, color: t.done ? "var(--a-success-text)" : "var(--a-text-muted)" }}
                  aria-label={t.done ? "Mark not done" : "Mark done"}
                >
                  {t.done ? "✓" : "○"}
                </button>
                {editingTaskId === t.id ? (
                  <div style={{ flex: 1 }}>
                    <input value={taskDraft.description} onChange={(e) => setTaskDraft({ ...taskDraft, description: e.target.value })} className="admin-inline-input" style={{ width: "100%", boxSizing: "border-box", marginBottom: 4 }} />
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      <select value={taskDraft.assignedTo} onChange={(e) => setTaskDraft({ ...taskDraft, assignedTo: e.target.value })} className="admin-inline-input" style={{ flex: 1 }}>
                        {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                      <input value={taskDraft.due} onChange={(e) => setTaskDraft({ ...taskDraft, due: e.target.value })} placeholder="Due" className="admin-inline-input" style={{ width: 80 }} />
                    </div>
                    <button onClick={() => saveTaskEdit(t.id)} className="admin-link-btn">Save</button>
                    <button onClick={() => setEditingTaskId(null)} className="admin-link-btn muted" style={{ marginLeft: 8 }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--a-text-muted)" : "var(--a-text-primary)" }}>
                      {t.description}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                      {t.assignedTo} · {t.due}
                      <button onClick={() => startTaskEdit(t)} className="admin-link-btn" style={{ marginLeft: 8 }}>edit</button>
                      <button onClick={() => handleDeleteTask(t)} className="admin-link-btn danger" style={{ marginLeft: 6 }}>delete</button>
                    </p>
                  </div>
                )}
              </div>
            ))}
            {tasks.length === 0 && <p style={{ fontSize: 13, color: "var(--a-text-secondary)", padding: "12px 0" }}>No tasks yet.</p>}
          </div>

          <form onSubmit={handleAddTask} className="admin-form-panel">
            <p className="admin-section-title">Assign a task</p>
            <input className="admin-search" placeholder="Task" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} style={{ marginBottom: 8 }} required />
            <select className="admin-search" value={newTask.assignedTo} onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })} style={{ marginBottom: 8 }} required>
              <option value="">Assign to…</option>
              {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <input className="admin-search" placeholder="Due (e.g. 4:00 PM)" value={newTask.due} onChange={(e) => setNewTask({ ...newTask, due: e.target.value })} style={{ marginBottom: 10 }} />
            <button type="submit" className="admin-btn-primary">Add task</button>
          </form>
        </div>
      </div>

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.3fr 1fr; } }
        .admin-avatar {
          width: 28px; height: 28px; border-radius: 50%; background: var(--a-bg);
          display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0;
        }
        .admin-search { width: 100%; border: 1px solid var(--a-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; box-sizing: border-box; }
        .admin-inline-input { font-size: 12px; padding: 3px 6px; border: 1px solid var(--a-border); border-radius: 4px; }
        .admin-select-sm { border: 1px solid var(--a-border); border-radius: 6px; padding: 5px 8px; font-size: 12px; background: var(--a-panel); }
        .admin-form-panel { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 16px; }
        .admin-btn-primary { width: 100%; padding: 10px; background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; }
        .admin-btn-primary:disabled { background: var(--a-border); color: var(--a-text-muted); }
        .admin-link-btn { border: none; background: none; color: var(--a-green); cursor: pointer; font-size: 11px; padding: 0; }
        .admin-link-btn.muted { color: var(--a-text-muted); }
        .admin-link-btn.danger { color: var(--a-danger-text); }
      `}</style>
    </AdminPage>
  );
}
