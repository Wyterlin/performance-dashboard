const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

export async function getWeek(weekCode) {
  return request(`/weeks/${encodeURIComponent(weekCode)}`);
}

export async function saveWeek(weekCode, data) {
  return request(`/weeks/${encodeURIComponent(weekCode)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getTicketSummary(startDate = "", endDate = "") {
  const query = new URLSearchParams();
  if (startDate) query.set("startDate", startDate);
  if (endDate) query.set("endDate", endDate);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/tickets/summary${suffix}`);
}

export async function getDefaultTopics() {
  return request("/defaults/topics");
}
