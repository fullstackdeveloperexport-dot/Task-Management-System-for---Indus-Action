import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import logo from "./indus-logo.svg";

const configuredApiBase = import.meta.env.VITE_API_BASE;
const API_BASE = configuredApiBase && !configuredApiBase.includes("backend:")
  ? configuredApiBase
  : "http://localhost:8000/api/v1";
const DEPT_OPTIONS = ["finance", "hr", "it", "operations"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];

async function apiFetch(path, options = {}, accessToken) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const ct = response.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const payload = await response.json();
        throw new Error(payload.detail || `Error ${response.status}`);
      }
      throw new Error((await response.text()) || `Error ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  } catch (err) {
    if (err instanceof TypeError && err.message === "Failed to fetch") {
      throw new Error(`Cannot connect to ${API_BASE}`);
    }
    throw err;
  }
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatCode(task) {
  const year = new Date(task.created_at).getFullYear();
  const dept = (task.rule_department || "GEN").slice(0, 2).toUpperCase();
  return `${dept}/${year}/${String(task.id).padStart(5, "0")}`;
}

function formatLabel(value) {
  return String(value || "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatDepartmentOption(value) {
  if (value === "hr" || value === "it") return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildChartData(tasks) {
  const counts = {};
  for (const task of tasks) {
    const key = (task.rule_department || "unruled").toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function buildStatusData(tasks) {
  const counts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const task of tasks) {
    const key = String(task.status || "todo").toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function ruleSummary(task) {
  if (!task.task_rules?.length) return "No rules";
  return task.task_rules.map(rule => `${formatLabel(rule.field)} ${rule.operator} ${rule.value}`).join(" | ");
}

function StatCard({ label, value, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `4px solid ${color}` }}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function DashboardHeader({ currentView, onNavigate, user, onLogout, isStaff }) {
  const navItems = isStaff
    ? [["dashboard", "Dashboard"], ["tasks", "Task Management"], ["users", "Users"], ["reports", "Reports"]]
    : [["dashboard", "Dashboard"], ["tasks", "My Tasks"], ["reports", "Reports"]];

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-left">
        <img src={logo} alt="Logo" className="dashboard-logo" />
        <span className="dashboard-brand">TaskFlow</span>
      </div>
      <nav className="dashboard-nav">
        {navItems.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`nav-link ${currentView === key ? "active" : ""}`}
            onClick={() => onNavigate(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="dashboard-header-right">
        <div className="user-info">
          <span className="user-name">{user?.full_name || "User"}</span>
          <span className="user-role">{user?.role || "User"}</span>
        </div>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}

function DashboardOverview({ user, tasks, loading }) {
  const chartData = buildChartData(tasks);
  const assigned = tasks.filter(task => task.assignment_state === "assigned").length;
  const noMatch = tasks.filter(task => task.assignment_state === "no_match").length;
  const pending = tasks.filter(task => task.assignment_state === "pending").length;

  return (
    <>
      <div className="welcome-section">
        <h1>Welcome, {user?.full_name}!</h1>
        <p>Rule-based task assignment system</p>
      </div>

      <div className="stat-row">
        <StatCard label="Total Tasks" value={tasks.length} color="#1a4e8a" />
        <StatCard label="Assigned" value={assigned} color="#28a745" />
        <StatCard label="Pending" value={pending} color="#e76f00" />
        <StatCard label="No Match" value={noMatch} color="#d32f2f" />
      </div>

      {loading ? (
        <div className="loading-msg">Loading dashboard…</div>
      ) : (
        <div className="dashboard-content">
          <div className="dashboard-panel">
            <h2 className="panel-title">Task Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#f5f5f5", border: "1px solid #ddd", borderRadius: "6px" }} />
                <Bar dataKey="value" fill="#e76f00" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="dashboard-panel">
            <h2 className="panel-title">Recent Activity</h2>
            <div className="activity-table-wrapper">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Task</th>
                    <th>Code</th>
                    <th>Action</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 10).map(task => (
                    <tr key={task.id}>
                      <td className="date-cell">{formatDate(task.updated_at)}</td>
                      <td className="trainer-cell">{task.title}</td>
                      <td className="center-cell">{formatCode(task)}</td>
                      <td className="action-cell">
                        <span className={`action-badge ${task.assignment_state === "assigned" ? "success" : task.assignment_state === "no_match" ? "failed" : "pending"}`}>
                          {formatLabel(task.assignment_state)}
                        </span>
                      </td>
                      <td className="location-cell">{formatLabel(task.priority)}</td>
                    </tr>
                  ))}
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan="5" className="empty-msg">No tasks available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TaskManagementView({ isStaff, tasks, loading, taskForm, setTaskForm, creatingTask, onCreateTask, onLoadEligibleUsers, onRecomputeTask, selectedEligibleTask, eligibleUsers, eligibleLoading }) {
  return (
    <div className="section-stack">
      {isStaff && (
        <div className="dashboard-panel wide-panel">
          <div className="panel-header-row">
            <div>
              <h2 className="panel-title">Create Task</h2>
              <p className="panel-subtitle">Tasks are assigned automatically based on rules.</p>
            </div>
          </div>
          <form className="task-form-grid" onSubmit={onCreateTask}>
            <label>
              Title
              <input value={taskForm.title} onChange={event => setTaskForm(form => ({ ...form, title: event.target.value }))} required />
            </label>
            <label>
              Priority
              <select value={taskForm.priority} onChange={event => setTaskForm(form => ({ ...form, priority: event.target.value }))}>
                {PRIORITY_OPTIONS.map(priority => (
                  <option key={priority} value={priority}>{formatLabel(priority)}</option>
                ))}
              </select>
            </label>
            <label>
              Due Date
              <input type="datetime-local" value={taskForm.due_date} onChange={event => setTaskForm(form => ({ ...form, due_date: event.target.value }))} />
            </label>
            <label>
              Department Rule
              <select value={taskForm.department} onChange={event => setTaskForm(form => ({ ...form, department: event.target.value }))}>
                <option value="">Any</option>
                {DEPT_OPTIONS.map(dep => (
                  <option key={dep} value={dep}>{formatDepartmentOption(dep)}</option>
                ))}
              </select>
            </label>
            <label>
              Minimum Experience
              <input type="number" min="0" max="60" value={taskForm.min_experience_years} onChange={event => setTaskForm(form => ({ ...form, min_experience_years: event.target.value }))} />
            </label>
            <label>
              Max Active Tasks
              <input type="number" min="1" max="1000" value={taskForm.max_active_tasks} onChange={event => setTaskForm(form => ({ ...form, max_active_tasks: event.target.value }))} />
            </label>
            <label className="full-width-field">
              Description
              <textarea rows="4" value={taskForm.description} onChange={event => setTaskForm(form => ({ ...form, description: event.target.value }))} />
            </label>
            <label className="full-width-field">
              Location Rule
              <input value={taskForm.location} onChange={event => setTaskForm(form => ({ ...form, location: event.target.value }))} placeholder="Mumbai" />
            </label>
            <div className="full-width-field form-actions-row">
              <button type="submit" className="primary-btn" disabled={creatingTask}>{creatingTask ? "Creating…" : "Create Task"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="dashboard-panel wide-panel">
        <div className="panel-header-row">
          <div>
            <h2 className="panel-title">{isStaff ? "Task Management" : "My Tasks"}</h2>
            <p className="panel-subtitle">Live tasks and rule-matching results.</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-msg">Loading tasks…</div>
        ) : (
          <div className="activity-table-wrapper">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Rules</th>
                  {isStaff && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id}>
                    <td className="center-cell">{formatCode(task)}</td>
                    <td className="trainer-cell">{task.title}</td>
                    <td>{formatLabel(task.status)}</td>
                    <td>{task.assigned_user_id || "Unassigned"}</td>
                    <td className="rule-summary-cell">{ruleSummary(task)}</td>
                    {isStaff && (
                      <td>
                        <div className="row-actions">
                          <button type="button" className="secondary-btn" onClick={() => onLoadEligibleUsers(task.id)}>Eligible Users</button>
                          <button type="button" className="secondary-btn" onClick={() => onRecomputeTask(task.id)}>Recompute</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={isStaff ? "6" : "5"} className="empty-msg">No tasks found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isStaff && selectedEligibleTask && (
        <div className="dashboard-panel wide-panel">
          <div className="panel-header-row">
            <div>
              <h2 className="panel-title">Eligible Users For Task #{selectedEligibleTask}</h2>
              <p className="panel-subtitle">Precomputed matches from the worker.</p>
            </div>
          </div>
          {eligibleLoading ? (
            <div className="loading-msg">Loading eligible users…</div>
          ) : (
            <div className="activity-table-wrapper">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Experience</th>
                    <th>Location</th>
                    <th>Active Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleUsers.map(person => (
                    <tr key={person.id}>
                      <td className="trainer-cell">{person.full_name}</td>
                      <td>{person.email}</td>
                      <td>{formatLabel(person.department)}</td>
                      <td>{person.experience_years}</td>
                      <td>{person.location}</td>
                      <td>{person.active_task_count}</td>
                    </tr>
                  ))}
                  {eligibleUsers.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-msg">No eligible users for this task.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsersView({ users, loading }) {
  return (
    <div className="dashboard-panel wide-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">Users</h2>
          <p className="panel-subtitle">Eligibility attributes used by the assignment engine.</p>
        </div>
      </div>
      {loading ? (
        <div className="loading-msg">Loading users…</div>
      ) : (
        <div className="activity-table-wrapper">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Experience</th>
                <th>Location</th>
                <th>Active Tasks</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(person => (
                <tr key={person.id}>
                  <td className="trainer-cell">{person.full_name}</td>
                  <td>{person.email}</td>
                  <td>{formatLabel(person.department)}</td>
                  <td>{person.experience_years}</td>
                  <td>{person.location}</td>
                  <td>{person.active_task_count}</td>
                  <td>{formatLabel(person.role)}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-msg">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportsView({ tasks, users, isStaff }) {
  const statusData = buildStatusData(tasks);
  const assignedTasks = tasks.filter(task => task.assignment_state === "assigned").length;
  const noMatchTasks = tasks.filter(task => task.assignment_state === "no_match").length;
  const usersAtCapacity = users.filter(user => user.active_task_count >= 5).length;
  const dueSoon = tasks.filter(task => task.due_date && new Date(task.due_date) > new Date()).slice(0, 7).length;

  return (
    <div className="section-stack">
      <div className="stat-row">
        <StatCard label="Users" value={isStaff ? users.length : "-"} color="#1a4e8a" />
        <StatCard label="Assigned Tasks" value={assignedTasks} color="#28a745" />
        <StatCard label="No Match" value={noMatchTasks} color="#d32f2f" />
        <StatCard label="Users At Capacity" value={isStaff ? usersAtCapacity : "-"} color="#7b4cc2" />
      </div>

      <div className="dashboard-content">
        <div className="dashboard-panel">
          <h2 className="panel-title">Status Report</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: "#f5f5f5", border: "1px solid #ddd", borderRadius: "6px" }} />
              <Bar dataKey="value" fill="#1a4e8a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="dashboard-panel">
          <h2 className="panel-title">Assignment Summary</h2>
          <div className="summary-list">
            <div className="summary-item"><span>Automatic assignment rate</span><strong>{tasks.length ? `${Math.round((assignedTasks / tasks.length) * 100)}%` : "0%"}</strong></div>
            <div className="summary-item"><span>Open tasks</span><strong>{tasks.filter(task => task.status !== "done").length}</strong></div>
            <div className="summary-item"><span>Tasks due soon</span><strong>{dueSoon}</strong></div>
            <div className="summary-item"><span>Unassigned tasks</span><strong>{tasks.filter(task => !task.assigned_user_id).length}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, tokens, onLogout }) {
  const isStaff = user.role === "admin" || user.role === "manager";
  const [currentView, setCurrentView] = useState("dashboard");
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [selectedEligibleTask, setSelectedEligibleTask] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [pageError, setPageError] = useState("");
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
    department: "",
    min_experience_years: "",
    location: "",
    max_active_tasks: "",
  });

  async function fetchTasks() {
    setLoadingTasks(true);
    try {
      const path = isStaff ? "/tasks/?limit=50&offset=0" : "/my-eligible-tasks?limit=50&offset=0";
      const data = await apiFetch(path, {}, tokens.access_token);
      setTasks(data);
      setPageError("");
    } catch (err) {
      setPageError(err.message);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function fetchUsers() {
    if (!isStaff) return;
    setLoadingUsers(true);
    try {
      const data = await apiFetch("/users/?limit=100&offset=0", {}, tokens.access_token);
      setUsers(data);
      setPageError("");
    } catch (err) {
      setPageError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadEligibleUsers(taskId) {
    setSelectedEligibleTask(taskId);
    setEligibleLoading(true);
    try {
      const data = await apiFetch(`/tasks/${taskId}/eligible-users?limit=100&offset=0`, {}, tokens.access_token);
      setEligibleUsers(data);
      setCurrentView("tasks");
    } catch (err) {
      setPageError(err.message);
    } finally {
      setEligibleLoading(false);
    }
  }

  async function handleRecomputeTask(taskId) {
    try {
      await apiFetch("/tasks/recompute-eligibility", {
        method: "POST",
        body: JSON.stringify({ task_id: taskId }),
      }, tokens.access_token);
      await fetchTasks();
      if (selectedEligibleTask === taskId) {
        await loadEligibleUsers(taskId);
      }
    } catch (err) {
      setPageError(err.message);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    setCreatingTask(true);
    try {
      await apiFetch("/tasks/", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description || null,
          priority: taskForm.priority,
          due_date: taskForm.due_date ? new Date(taskForm.due_date).toISOString() : null,
          rules: {
            department: taskForm.department || null,
            min_experience_years: taskForm.min_experience_years ? Number(taskForm.min_experience_years) : null,
            location: taskForm.location || null,
            max_active_tasks: taskForm.max_active_tasks ? Number(taskForm.max_active_tasks) : null,
          },
        }),
      }, tokens.access_token);
      setTaskForm({
        title: "",
        description: "",
        priority: "medium",
        due_date: "",
        department: "",
        min_experience_years: "",
        location: "",
        max_active_tasks: "",
      });
      setCurrentView("tasks");
      await fetchTasks();
    } catch (err) {
      setPageError(err.message);
    } finally {
      setCreatingTask(false);
    }
  }

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    const id = setInterval(() => {
      fetchTasks();
      fetchUsers();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="dashboard-container">
      <DashboardHeader currentView={currentView} onNavigate={setCurrentView} user={user} onLogout={onLogout} isStaff={isStaff} />
      <main className="dashboard-main">
        {pageError && <div className="error-banner">{pageError}</div>}
        {currentView === "dashboard" && <DashboardOverview user={user} tasks={tasks} loading={loadingTasks} />}
        {currentView === "tasks" && (
          <TaskManagementView
            isStaff={isStaff}
            tasks={tasks}
            loading={loadingTasks}
            taskForm={taskForm}
            setTaskForm={setTaskForm}
            creatingTask={creatingTask}
            onCreateTask={handleCreateTask}
            onLoadEligibleUsers={loadEligibleUsers}
            onRecomputeTask={handleRecomputeTask}
            selectedEligibleTask={selectedEligibleTask}
            eligibleUsers={eligibleUsers}
            eligibleLoading={eligibleLoading}
          />
        )}
        {currentView === "users" && isStaff && <UsersView users={users} loading={loadingUsers} />}
        {currentView === "reports" && <ReportsView tasks={tasks} users={users} isStaff={isStaff} />}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <img src={logo} alt="Logo" className="logo" />
        <span className="brand-title">TaskFlow</span>
      </div>
      <div className="header-right">

      </div>
    </header>
  );
}

function AuthCard({ authMode, setAuthMode, authForm, setAuthForm, handleAuthSubmit, loading, error }) {
  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <img src={logo} alt="Logo" className="auth-logo" />
        <span className="auth-title">{authMode === "login" ? "Login" : "Create Account"}</span>
      </div>
      <div className="auth-divider" />
      <form onSubmit={handleAuthSubmit} className="auth-form">
        {authMode === "signup" && (
          <>
            <label>
              Full Name
              <input value={authForm.full_name} onChange={event => setAuthForm(form => ({ ...form, full_name: event.target.value }))} required />
            </label>
            <label>
              Department
              <select value={authForm.department} onChange={event => setAuthForm(form => ({ ...form, department: event.target.value }))}>
                {DEPT_OPTIONS.map(dep => (
                  <option key={dep} value={dep}>{formatDepartmentOption(dep)}</option>
                ))}
              </select>
            </label>
            <label>
              Experience (Years)
              <input type="number" min="0" max="60" value={authForm.experience_years} onChange={event => setAuthForm(form => ({ ...form, experience_years: event.target.value }))} required />
            </label>
            <label>
              Location
              <input value={authForm.location} onChange={event => setAuthForm(form => ({ ...form, location: event.target.value }))} required />
            </label>
          </>
        )}
        <label>
          Email
          <input type="email" value={authForm.email} onChange={event => setAuthForm(form => ({ ...form, email: event.target.value }))} required placeholder="Enter Email ID" />
        </label>
        <label>
          Password
          <input type="password" value={authForm.password} onChange={event => setAuthForm(form => ({ ...form, password: event.target.value }))} required placeholder="Enter Password" />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Please wait" : authMode === "login" ? "Login" : "Sign Up"}</button>
        {authMode === "login" ? (
          <div className="auth-links">
            <span>Forgot Password?</span>
            <span className="auth-switch">Don't have an account? <button type="button" onClick={() => setAuthMode("signup")}>Sign up</button></span>
          </div>
        ) : (
          <div className="auth-links">
            <span className="auth-switch">Already have an account? <button type="button" onClick={() => setAuthMode("login")}>Sign in</button></span>
          </div>
        )}
      </form>
    </div>
  );
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    full_name: "",
    department: "it",
    experience_years: "0",
    location: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState(null);
  const [user, setUser] = useState(null);

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
      const userData = await apiFetch("/users/me", {}, nextTokens.access_token);
      setUser(userData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setTokens(null);
    setUser(null);
    setAuthMode("login");
    setAuthForm({
      email: "",
      password: "",
      full_name: "",
      department: "it",
      experience_years: "0",
      location: "",
    });
    setError("");
  }

  if (tokens && user) {
    return <Dashboard user={user} tokens={tokens} onLogout={handleLogout} />;
  }

  return (
    <div className="light-bg">
      <Header />
      <main className="auth-main">
        <AuthCard authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} handleAuthSubmit={handleAuthSubmit} loading={loading} error={error} />
      </main>
    </div>
  );
}

export default App;
