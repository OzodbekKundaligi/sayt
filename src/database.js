// database.js - API client for SQLite3 backend

const API_URL = import.meta.env.VITE_API_URL || '/api';

const request = async (path, options = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

// Initialize database (no-op for API)
export const initDatabase = async () => {
  await request('/health');
  return true;
};

// Save database (handled by server)
export const saveDatabase = () => {};

// Database operations via API
export const dbOperations = {
  // Users
  async createUser(user) {
    return request('/users', {
      method: 'POST',
      body: JSON.stringify(user)
    });
  },

  async getUsers() {
    return request('/users');
  },

  async getUserByEmail(email) {
    if (!email) return null;
    return request(`/users/by-email?email=${encodeURIComponent(email)}`);
  },

  async updateUser(userId, updates) {
    return request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async getUserById(userId) {
    return request(`/users/${userId}`);
  },

  async updateUserRole(userId, role, actorId) {
    return request(`/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role, actor_id: actorId })
    });
  },

  async setUserBanned(userId, banned, actorId) {
    return request(`/users/${userId}/ban`, {
      method: 'PUT',
      body: JSON.stringify({ banned, actor_id: actorId })
    });
  },

  async setUserPro(userId, isPro, actorId) {
    return request(`/users/${userId}/pro`, {
      method: 'PUT',
      body: JSON.stringify({ is_pro: isPro, actor_id: actorId })
    });
  },

  async deleteUser(userId, actorId) {
    const query = actorId ? `?actor_id=${encodeURIComponent(actorId)}` : '';
    return request(`/users/${userId}${query}`, { method: 'DELETE' });
  },

  // Startups
  async createStartup(startup) {
    return request('/startups', {
      method: 'POST',
      body: JSON.stringify(startup)
    });
  },

  async getStartups() {
    return request('/startups');
  },

  async updateStartup(startupId, updates) {
    return request(`/startups/${startupId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async updateStartupStatus(startupId, status, rejectionReason, actorId) {
    return request(`/startups/${startupId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status,
        rejection_reason: rejectionReason || null,
        actor_id: actorId
      })
    });
  },

  async deleteStartup(startupId, actorId) {
    const query = actorId ? `?actor_id=${encodeURIComponent(actorId)}` : '';
    return request(`/startups/${startupId}${query}`, { method: 'DELETE' });
  },

  // Join Requests
  async createJoinRequest(requestBody) {
    return request('/join-requests', {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
  },

  async getJoinRequests() {
    return request('/join-requests?status=pending');
  },

  async updateRequestStatus(requestId, status) {
    return request(`/join-requests/${requestId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  async deleteRequest(requestId) {
    return request(`/join-requests/${requestId}`, { method: 'DELETE' });
  },

  // Notifications
  async createNotification(notification) {
    return request('/notifications', {
      method: 'POST',
      body: JSON.stringify(notification)
    });
  },

  async getNotifications(userId = null) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/notifications${query}`);
  },

  async markNotificationAsRead(notificationId) {
    return request(`/notifications/${notificationId}/read`, { method: 'PUT' });
  },

  async markAllNotificationsAsRead(userId) {
    return request(`/notifications/mark-all-read?userId=${encodeURIComponent(userId)}`, { method: 'PUT' });
  },

  // Tasks
  async createTask(task) {
    return request('/tasks', {
      method: 'POST',
      body: JSON.stringify(task)
    });
  },

  async updateTaskStatus(taskId, status) {
    return request(`/tasks/${taskId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  async deleteTask(taskId) {
    return request(`/tasks/${taskId}`, { method: 'DELETE' });
  },

  // Categories
  async getCategories() {
    return request('/categories');
  },

  async createCategory(name, actorId) {
    return request('/categories', {
      method: 'POST',
      body: JSON.stringify({ name, actor_id: actorId })
    });
  },

  async deleteCategory(categoryId, actorId) {
    const query = actorId ? `?actor_id=${encodeURIComponent(actorId)}` : '';
    return request(`/categories/${categoryId}${query}`, { method: 'DELETE' });
  },

  // Stats
  async getStats() {
    return request('/stats');
  },

  // Audit logs
  async getAuditLogs(limit = 50) {
    return request(`/audit-logs?limit=${limit}`);
  },

  // Workspace snapshot
  async getStartupWorkspace(startupId) {
    return request(`/startups/${startupId}/workspace`);
  },

  async logWorkspaceActivity(startupId, activity) {
    return request(`/startups/${startupId}/activity`, {
      method: 'POST',
      body: JSON.stringify(activity)
    });
  },

  // Reputation graph
  async getStartupReputation(startupId) {
    return request(`/startups/${startupId}/reputation`);
  },

  async getUserReputation(userId) {
    return request(`/users/${userId}/reputation`);
  },

  async createPeerReview(startupId, review) {
    return request(`/startups/${startupId}/reputation/reviews`, {
      method: 'POST',
      body: JSON.stringify(review)
    });
  },

  // Governance decisions
  async getDecisions(startupId) {
    return request(`/startups/${startupId}/decisions`);
  },

  async createDecision(startupId, payload) {
    return request(`/startups/${startupId}/decisions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async voteDecision(decisionId, payload) {
    return request(`/decisions/${decisionId}/vote`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Founder vote
  async getMemberVotes(startupId) {
    return request(`/startups/${startupId}/member-votes`);
  },

  async createMemberVote(startupId, payload) {
    return request(`/startups/${startupId}/member-votes`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async castMemberVote(voteCaseId, payload) {
    return request(`/member-votes/${voteCaseId}/cast`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Equity ledger
  async getEquity(startupId) {
    return request(`/startups/${startupId}/equity`);
  },

  async upsertEquity(startupId, payload) {
    return request(`/startups/${startupId}/equity`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateEquity(equityId, payload) {
    return request(`/equity/${equityId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async archiveEquity(equityId) {
    return request(`/equity/${equityId}`, { method: 'DELETE' });
  },

  // Agreements + registry
  async getAgreements(startupId) {
    return request(`/startups/${startupId}/agreements`);
  },

  async createAgreement(startupId, payload) {
    return request(`/startups/${startupId}/agreements`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateAgreement(agreementId, payload) {
    return request(`/agreements/${agreementId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async updateStartupRegistry(startupId, payload) {
    return request(`/startups/${startupId}/registry`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  // Investor flow
  async getInvestorIntros(startupId) {
    return request(`/startups/${startupId}/investor-intros`);
  },

  async createInvestorIntro(startupId, payload) {
    return request(`/startups/${startupId}/investor-intros`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateInvestorIntro(introId, payload) {
    return request(`/investor-intros/${introId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  // AI risk
  async getStartupAiRisk(startupId) {
    return request(`/startups/${startupId}/ai-risk`);
  },

  // Pro config and payment requests
  async getProConfig() {
    return request('/pro/config');
  },

  async updateProConfig(payload) {
    return request('/admin/pro/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async getProRequests({ status = '', userId = '', role = '' } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (userId) params.set('userId', userId);
    if (role) params.set('role', role);
    return request(`/pro/requests${params.toString() ? `?${params.toString()}` : ''}`);
  },

  async submitProRequest(payload) {
    return request('/pro/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async reviewProRequest(requestId, payload) {
    return request(`/pro/requests/${requestId}/review`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
};

export default dbOperations;
