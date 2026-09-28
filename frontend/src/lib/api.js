async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${method} ${path} failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  passages: () => request("GET", "/api/passages"),
  students: () => request("GET", "/api/students"),
  student: (id) => request("GET", `/api/students/${id}`),
  createStudent: (s) => request("POST", "/api/students", s),
  insight: (id) => request("POST", `/api/students/${id}/insight`),
  session: (id) => request("GET", `/api/sessions/${id}`),
  overrideWord: (id, i, status) => request("PATCH", `/api/sessions/${id}/words/${i}`, { status }),
  saveComprehension: (id, c) => request("POST", `/api/sessions/${id}/comprehension`, c),
  voiceToken: () => request("GET", "/api/voice-token"),
};

export function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
