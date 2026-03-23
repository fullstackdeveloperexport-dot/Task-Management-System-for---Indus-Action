import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";
const TOKEN_STORAGE_KEY = "ruleflow.tokens";

const emptyTaskForm = {
  title: "",
  description: "",
  priority: "medium",
  due_date: "",
  department: "",
  min_experience_years: "",
  location: "",
  max_active_tasks: "",
};

function readStoredTokens() {
  const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function writeStoredTokens(tokens) {
  if (tokens) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    return;
  }
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function apiFetch(path, options = {}, accessToken) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatRules(task) {
  const parts = [];

  if (task.rule_department) {
    parts.push(`Department = ${task.rule_department}`);
  }
  if (task.rule_min_experience_years !== null && task.rule_min_experience_years !== undefined) {
    parts.push(`Experience >= ${task.rule_min_experience_years}`);
  }
  if (task.rule_location) {
    parts.push(`Location = ${task.rule_location}`);
  }
  if (task.rule_max_active_tasks !== null && task.rule_max_active_tasks !== undefined) {
    parts.push(`Active Tasks < ${task.rule_max_active_tasks}`);
  }

  return parts.length > 0 ? parts.join(", ") : "No rules";
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });
  const [tokens, setTokens] = useState(() => readStoredTokens());
  const [me, setMe] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState({});
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const accessToken = tokens?.access_token || null;
  const isAdminView = me?.role === "admin" || me?.role === "manager";

  useEffect(() => {
    writeStoredTokens(tokens);
  }, [tokens]);

  useEffect(() => {
    if (!accessToken) {
      setMe(null);
      setMyTasks([]);
      setAllTasks([]);
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        const profile = await apiFetch("/users/me", {}, accessToken);
        if (cancelled) {
          return;
        }
        setMe(profile);

        const myTaskList = await apiFetch("/tasks/my-eligible-tasks?limit=50", {}, accessToken);
        if (cancelled) {
          return;
        }
        setMyTasks(myTaskList);

        if (profile.role === "admin" || profile.role === "manager") {
          const taskList = await apiFetch("/tasks?limit=50", {}, accessToken);
          if (cancelled) {
            return;
          }
          setAllTasks(taskList);
        }
      } catch (err) {
        setError(err.message);
        setTokens(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function refreshData() {
    if (!accessToken) {
      return;
    }

    const myTaskList = await apiFetch("/tasks/my-eligible-tasks?limit=50", {}, accessToken);
    setMyTasks(myTaskList);

    if (isAdminView) {
      const taskList = await apiFetch("/tasks?limit=50", {}, accessToken);
      setAllTasks(taskList);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authMode === "signup") {
        await apiFetch("/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            full_name: authForm.full_name,
            password: authForm.password,
          }),
        });
      }

      const nextTokens = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      });

      setTokens(nextTokens);
      setAuthForm({
        email: authForm.email,
        password: "",
        full_name: "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createTask(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiFetch(
        "/tasks/",
        {
          method: "POST",
          body: JSON.stringify({
            title: taskForm.title,
            description: taskForm.description || null,
            priority: taskForm.priority,
            due_date: taskForm.due_date ? new Date(taskForm.due_date).toISOString() : null,
            rules: {
              department: taskForm.department || null,
              min_experience_years:
                taskForm.min_experience_years === "" ? null : Number(taskForm.min_experience_years),
              location: taskForm.location || null,
              max_active_tasks:
                taskForm.max_active_tasks === "" ? null : Number(taskForm.max_active_tasks),
            },
          }),
        },
        accessToken,
      );

      setTaskForm(emptyTaskForm);
      await refreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId, status) {
    setError("");
    try {
      await apiFetch(
        `/tasks/${taskId}`,
        {
          method: "PUT",
          body: JSON.stringify({ status }),
        },
        accessToken,
      );
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEligibleUsers(taskId) {
    setError("");
    try {
      const users = await apiFetch(`/tasks/${taskId}/eligible-users?limit=10`, {}, accessToken);
      setEligibleUsers((current) => ({ ...current, [taskId]: users }));
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    setTokens(null);
    setMe(null);
    setMyTasks([]);
    setAllTasks([]);
    setEligibleUsers({});
    setError("");
  }

  if (!accessToken) {
    return (
      <div className="page">
        <h1>Task Management System</h1>
        <div className="panel">
          <div className="button-row">
            <button type="button" onClick={() => setAuthMode("login")}>
              Login
            </button>
            <button type="button" onClick={() => setAuthMode("signup")}>
              Signup
            </button>
          </div>

          <form onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <label>
                Full Name
                <input
                  value={authForm.full_name}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, full_name: event.target.value }))
                  }
                  required
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? "Please wait" : authMode === "login" ? "Login" : "Signup"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Task Management System</h1>

      <div className="panel">
        <p>Name: {me?.full_name}</p>
        <p>Role: {me?.role}</p>
        <p>Department: {me?.department}</p>
        <p>Location: {me?.location}</p>
        <p>Active Tasks: {me?.active_task_count}</p>
        <div className="button-row">
          <button type="button" onClick={refreshData}>
            Refresh
          </button>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>My Eligible Tasks</h2>
        {myTasks.length === 0 ? (
          <p>No tasks found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due Date</th>
                <th>Reason</th>
                <th>Update Status</th>
              </tr>
            </thead>
            <tbody>
              {myTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.id}</td>
                  <td>{task.title}</td>
                  <td>{task.status}</td>
                  <td>{task.priority}</td>
                  <td>{formatDate(task.due_date)}</td>
                  <td>{task.assignment_reason || "-"}</td>
                  <td>
                    <select
                      value={task.status}
                      onChange={(event) => updateTaskStatus(task.id, event.target.value)}
                    >
                      <option value="todo">todo</option>
                      <option value="in_progress">in_progress</option>
                      <option value="done">done</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isAdminView && (
        <>
          <div className="panel">
            <h2>Create Task With Rules</h2>
            <form onSubmit={createTask}>
              <label>
                Title
                <input
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>

              <label>
                Priority
                <select
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, priority: event.target.value }))
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </label>

              <label>
                Due Date
                <input
                  type="datetime-local"
                  value={taskForm.due_date}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, due_date: event.target.value }))
                  }
                />
              </label>

              <label>
                Department
                <select
                  value={taskForm.department}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, department: event.target.value }))
                  }
                >
                  <option value="">any</option>
                  <option value="finance">finance</option>
                  <option value="hr">hr</option>
                  <option value="it">it</option>
                  <option value="operations">operations</option>
                </select>
              </label>

              <label>
                Minimum Experience
                <input
                  type="number"
                  min="0"
                  value={taskForm.min_experience_years}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      min_experience_years: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Location
                <input
                  value={taskForm.location}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, location: event.target.value }))
                  }
                />
              </label>

              <label>
                Max Active Tasks
                <input
                  type="number"
                  min="1"
                  value={taskForm.max_active_tasks}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      max_active_tasks: event.target.value,
                    }))
                  }
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "Please wait" : "Create Task"}
              </button>
            </form>
          </div>

          <div className="panel">
            <h2>All Tasks</h2>
            {allTasks.length === 0 ? (
              <p>No tasks found.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Assignment State</th>
                    <th>Assigned User</th>
                    <th>Rules</th>
                    <th>Eligible Users</th>
                  </tr>
                </thead>
                <tbody>
                  {allTasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.id}</td>
                      <td>{task.title}</td>
                      <td>{task.status}</td>
                      <td>{task.assignment_state}</td>
                      <td>{task.assigned_user_id || "-"}</td>
                      <td>{formatRules(task)}</td>
                      <td>
                        <button type="button" onClick={() => loadEligibleUsers(task.id)}>
                          Load
                        </button>
                        {eligibleUsers[task.id] && (
                          <ul>
                            {eligibleUsers[task.id].map((user) => (
                              <li key={user.id}>
                                {user.full_name} | {user.department} | {user.experience_years} | {user.active_task_count}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
