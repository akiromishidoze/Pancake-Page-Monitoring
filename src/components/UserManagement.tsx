'use client';

import { useState, useEffect, startTransition, FormEvent } from 'react';

type User = {
  id: number;
  email: string;
  username: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState('viewer');

  const [editId, setEditId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to load users'); return; }
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { startTransition(() => { void loadUsers(); }); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: createEmail, username: createUsername || undefined, password: createPassword, role: createRole }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to create user'); return; }
      setSuccess(`User "${createEmail}" created`);
      setShowCreate(false);
      setCreateEmail(''); setCreateUsername(''); setCreatePassword(''); setCreateRole('viewer');
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    }
  }

  async function handleUpdate(id: number) {
    setError('');
    setSuccess('');
    const body: Record<string, unknown> = {};
    if (editEmail) body.email = editEmail;
    if (editRole) body.role = editRole;
    if (editPassword) body.password = editPassword;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to update user'); return; }
      setSuccess('User updated');
      setEditId(null);
      setEditEmail(''); setEditRole(''); setEditPassword('');
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  }

  async function handleToggleActive(user: User) {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to toggle user'); return; }
      setSuccess(user.is_active ? 'User deactivated' : 'User activated');
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle user');
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Delete user "${user.email}"? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to delete user'); return; }
      setSuccess(`User "${user.email}" deleted`);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user');
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-200">User Management</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs px-3 py-1.5 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 transition-colors cursor-pointer"
        >
          {showCreate ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-4 rounded border border-slate-700 bg-slate-800/50 p-3 space-y-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email *</label>
            <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} required
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Username</label>
            <input type="text" value={createUsername} onChange={e => setCreateUsername(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Password *</label>
            <input type="password" value={createPassword} onChange={e => setCreatePassword(e.target.value)} required minLength={8}
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Role</label>
            <select value={createRole} onChange={e => setCreateRole(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit"
            className="text-xs px-4 py-1.5 rounded border border-green-700 bg-green-900/30 text-green-300 hover:bg-green-800/40 transition-colors cursor-pointer">
            Create User
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500">Loading...</div>
      ) : users.length === 0 ? (
        <div className="text-xs text-slate-500">No users found</div>
      ) : (
        <div className="space-y-2">
          {users.map(user => (
            <div key={user.id} className="rounded border border-slate-700 bg-slate-800/30 p-3">
              {editId === user.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input type="email" value={editEmail || user.email} onChange={e => setEditEmail(e.target.value)}
                      className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
                    <select value={editRole || user.role} onChange={e => setEditRole(e.target.value)}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200">
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                    placeholder="New password (leave blank to keep)"
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(user.id)}
                      className="text-xs px-3 py-1 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 cursor-pointer">
                      Save
                    </button>
                    <button onClick={() => { setEditId(null); setEditEmail(''); setEditRole(''); setEditPassword(''); }}
                      className="text-xs px-3 py-1 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">{user.email}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${user.role === 'admin' ? 'bg-purple-900/40 text-purple-300' : 'bg-slate-700 text-slate-400'}`}>
                        {user.role}
                      </span>
                      <span className={`text-xs ${user.is_active ? 'text-green-400' : 'text-red-400'}`}>
                        {user.is_active ? 'active' : 'inactive'}
                      </span>
                    </div>
                    {user.username && user.username !== user.email && (
                      <div className="text-xs text-slate-500 mt-0.5">{user.username}</div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditId(user.id); setEditEmail(''); setEditRole(''); setEditPassword(''); }}
                      className="text-xs px-2 py-1 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 cursor-pointer">
                      Edit
                    </button>
                    <button onClick={() => handleToggleActive(user)}
                      className={`text-xs px-2 py-1 rounded border cursor-pointer ${user.is_active ? 'border-yellow-700 bg-yellow-900/20 text-yellow-300 hover:bg-yellow-800/30' : 'border-green-700 bg-green-900/20 text-green-300 hover:bg-green-800/30'}`}>
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(user)}
                      className="text-xs px-2 py-1 rounded border border-red-800 bg-red-900/20 text-red-300 hover:bg-red-800/30 cursor-pointer">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
