const API = process.env.REACT_APP_API_URL || '';

const getToken = () => localStorage.getItem('xpd_token');

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  ...extra,
});

const handle = async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

export const sendMagicLink = (email) =>
  fetch(`${API}/api/auth/magic-link`, { method: 'POST', headers: headers(), body: JSON.stringify({ email }) }).then(handle);

export const verifyMagicLink = (token) =>
  fetch(`${API}/api/auth/verify`, { method: 'POST', headers: headers(), body: JSON.stringify({ token }) }).then(handle);

export const getMe = () =>
  fetch(`${API}/api/auth/me`, { headers: headers() }).then(handle);

export const getUsers = () =>
  fetch(`${API}/api/users`, { headers: headers() }).then(handle);

export const createUser = (data) =>
  fetch(`${API}/api/users`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle);

export const resendInvite = (id) =>
  fetch(`${API}/api/users/${id}/invite`, { method: 'POST', headers: headers() }).then(handle);

export const getProjects = () =>
  fetch(`${API}/api/projects`, { headers: headers() }).then(handle);

export const getProject = (id) =>
  fetch(`${API}/api/projects/${id}`, { headers: headers() }).then(handle);

export const createProject = (data) =>
  fetch(`${API}/api/projects`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle);

export const updateProject = (id, data) =>
  fetch(`${API}/api/projects/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(data) }).then(handle);

export const deleteProject = (id) =>
  fetch(`${API}/api/projects/${id}`, { method: 'DELETE', headers: headers() }).then(handle);

export const grantBonusRevision = (id) =>
  fetch(`${API}/api/projects/${id}/bonus-revision`, { method: 'POST', headers: headers() }).then(handle);

export const getDrawings = (projectId) =>
  fetch(`${API}/api/projects/${projectId}/drawings`, { headers: headers() }).then(handle);

export const uploadDrawing = (projectId, file) => {
  const form = new FormData();
  form.append('pdf', file);
  return fetch(`${API}/api/projects/${projectId}/drawings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  }).then(handle);
};

export const deleteDrawing = (projectId, drawingId) =>
  fetch(`${API}/api/projects/${projectId}/drawings/${drawingId}`, { method: 'DELETE', headers: headers() }).then(handle);

export const getComments = (drawingId) =>
  fetch(`${API}/api/drawings/${drawingId}/comments`, { headers: headers() }).then(handle);

export const addComment = (drawingId, data) =>
  fetch(`${API}/api/drawings/${drawingId}/comments`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle);

export const addReply = (drawingId, commentId, text) =>
  fetch(`${API}/api/drawings/${drawingId}/comments/${commentId}/replies`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ text })
  }).then(handle);

export const improveReply = (drawingId, commentId, draft) =>
  fetch(`${API}/api/drawings/${drawingId}/comments/${commentId}/improve-reply`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ draft })
  }).then(handle);

export const interpretMarkup = (drawingId, commentId, markupDescription) =>
  fetch(`${API}/api/drawings/${drawingId}/comments/${commentId}/interpret`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ markupDescription })
  }).then(handle);

export const confirmRevision = (drawingId, commentId) =>
  fetch(`${API}/api/drawings/${drawingId}/comments/${commentId}/confirm`, {
    method: 'POST', headers: headers()
  }).then(handle);

export const getMarkups = (drawingId) =>
  fetch(`${API}/api/drawings/${drawingId}/markups`, { headers: headers() }).then(handle);

export const saveMarkups = (drawingId, paths, page = 1) =>
  fetch(`${API}/api/drawings/${drawingId}/markups`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ paths, page })
  }).then(handle);

export const incrementMarkupExport = (projectId, num) =>
  req(`/api/projects/${projectId}/markup-export`, { method: 'POST', body: JSON.stringify({ exportNum: num }) });
