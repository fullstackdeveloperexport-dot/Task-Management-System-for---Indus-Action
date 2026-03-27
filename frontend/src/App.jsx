import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";
const TOKEN_STORAGE_KEY = "ruleflow.tokens";
const departmentOptions = ["finance", "hr", "it", "operations"];
const priorityOptions = ["low", "medium", "high", "urgent"];
const statusOptions = ["todo", "in_progress", "done"];

function createEmptyAuthForm() {
  return {
    email: "",
    password: "",
    full_name: "",
    department: "it",
    experience_years: "0",
    location: "",
  };
}

function createEmptyTaskForm() {
  return {
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
    due_date: "",
    department: "",
    min_experience_years: "",
    location: "",
    max_active_tasks: "",
  };
}

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
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      throw new Error(payload.detail || "Request failed");
    }
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

function formatDateTimeInput(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().slice(0, 16);
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

function buildRulesPayload(taskForm) {
  return {
    department: taskForm.department || null,
    min_experience_years:
      taskForm.min_experience_years === "" ? null : Number(taskForm.min_experience_years),
    location: taskForm.location || null,
    max_active_tasks: taskForm.max_active_tasks === "" ? null : Number(taskForm.max_active_tasks),
  };
}

function buildTaskCreatePayload(taskForm) {
  return {
    title: taskForm.title,
    description: taskForm.description || null,
    priority: taskForm.priority,
    due_date: taskForm.due_date ? new Date(taskForm.due_date).toISOString() : null,
    rules: buildRulesPayload(taskForm),
  };
}

function buildTaskUpdatePayload(taskForm) {
  return {
    title: taskForm.title,
    description: taskForm.description || null,
    priority: taskForm.priority,
    status: taskForm.status,
    due_date: taskForm.due_date ? new Date(taskForm.due_date).toISOString() : null,
    rules: buildRulesPayload(taskForm),
  };
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(() => createEmptyAuthForm());
  const [tokens, setTokens] = useState(() => readStoredTokens());
  const [me, setMe] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [myAssignedTasks, setMyAssignedTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState({});
  const [taskForm, setTaskForm] = useState(() => createEmptyTaskForm());
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const accessToken = tokens?.access_token || null;
  const isAdminView = me?.role === "admin" || me?.role === "manager";
  const canDeleteTasks = me?.role === "admin";

  useEffect(() => {
    writeStoredTokens(tokens);
  }, [tokens]);

  useEffect(() => {
    if (!accessToken) {
      setMe(null);
      setMyTasks([]);
      setAllTasks([]);
      setEditingTaskId(null);
      setTaskForm(createEmptyTaskForm());
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

        const myTaskList = await apiFetch("/my-eligible-tasks?limit=50", {}, accessToken);
        if (cancelled) {
          return;
        }
        setMyTasks(myTaskList);

        const myAssignedTaskList = await apiFetch("/my-assigned-tasks?limit=50", {}, accessToken);
        if (cancelled) {
          return;
        }
        setMyAssignedTasks(myAssignedTaskList);

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

    const myTaskList = await apiFetch("/my-eligible-tasks?limit=50", {}, accessToken);
    setMyTasks(myTaskList);

    const myAssignedTaskList = await apiFetch("/my-assigned-tasks?limit=50", {}, accessToken);
    setMyAssignedTasks(myAssignedTaskList);

    if (isAdminView) {
      const taskList = await apiFetch("/tasks?limit=50", {}, accessToken);
      setAllTasks(taskList);
    }
  }

  function resetTaskEditor() {
    setEditingTaskId(null);
    setTaskForm(createEmptyTaskForm());
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
            department: authForm.department,
            experience_years: Number(authForm.experience_years),
            location: authForm.location,
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
        ...createEmptyAuthForm(),
        email: authForm.email,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitTask(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (editingTaskId) {
        await apiFetch(
          `/tasks/${editingTaskId}`,
          {
            method: "PUT",
            body: JSON.stringify(buildTaskUpdatePayload(taskForm)),
          },
          accessToken,
        );
      } else {
        await apiFetch(
          "/tasks/",
          {
            method: "POST",
            body: JSON.stringify(buildTaskCreatePayload(taskForm)),
          },
          accessToken,
        );
      }

      resetTaskEditor();
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

  async function deleteTask(taskId) {
    const confirmed = window.confirm(`Delete task ${taskId}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    setLoading(true);
    try {
      await apiFetch(
        `/tasks/${taskId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      if (editingTaskId === taskId) {
        resetTaskEditor();
      }
      setEligibleUsers((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      await refreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditTask(task) {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      due_date: formatDateTimeInput(task.due_date),
      department: task.rule_department || "",
      min_experience_years:
        task.rule_min_experience_years === null || task.rule_min_experience_years === undefined
          ? ""
          : String(task.rule_min_experience_years),
      location: task.rule_location || "",
      max_active_tasks:
        task.rule_max_active_tasks === null || task.rule_max_active_tasks === undefined
          ? ""
          : String(task.rule_max_active_tasks),
    });
  }

  function logout() {
    setTokens(null);
    setMe(null);
    setMyTasks([]);
    setMyAssignedTasks([]);
    setAllTasks([]);
    setEligibleUsers({});
    setError("");
    setEditingTaskId(null);
    setTaskForm(createEmptyTaskForm());
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

          <form onSubmit={handleAuthSubmit} className={authMode === "signup" ? "form-grid" : ""}>
            {authMode === "signup" && (
              <>
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

                <label>
                  Department
                  <select
                    value={authForm.department}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, department: event.target.value }))
                    }
                  >
                    {departmentOptions.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Experience
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={authForm.experience_years}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        experience_years: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Location
                  <input
                    value={authForm.location}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, location: event.target.value }))
                    }
                    required
                  />
                </label>
              </>
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
        <p>Experience: {me?.experience_years}</p>
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
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>My Assigned Tasks</h2>
        {myAssignedTasks.length === 0 ? (
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
                <th>Update Status</th>
              </tr>
            </thead>
            <tbody>
              {myAssignedTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.id}</td>
                  <td>{task.title}</td>
                  <td>{task.status}</td>
                  <td>{task.priority}</td>
                  <td>{formatDate(task.due_date)}</td>
                  <td>
                    <select
                      value={task.status}
                      onChange={(event) => updateTaskStatus(task.id, event.target.value)}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
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
            <h2>{editingTaskId ? `Update Task ${editingTaskId}` : "Create Task"}</h2>
            <form onSubmit={submitTask} className="task-form">
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
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
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
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Minimum Experience
                <input
                  type="number"
                  min="0"
                  max="60"
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

              <div className="button-row">
                <button type="submit" disabled={loading}>
                  {loading ? "Please wait" : editingTaskId ? "Update Task" : "Create Task"}
                </button>
                {editingTaskId && (
                  <button type="button" onClick={resetTaskEditor}>
                    Cancel
                  </button>
                )}
              </div>
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
                    <th>Actions</th>
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
                                {user.full_name} | {user.department} | {user.experience_years} |{" "}
                                {user.active_task_count}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <div className="button-stack">
                          <button type="button" onClick={() => startEditTask(task)}>
                            Edit
                          </button>
                          {canDeleteTasks && (
                            <button type="button" onClick={() => deleteTask(task.id)}>
                              Delete
                            </button>
                          )}
                        </div>
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
