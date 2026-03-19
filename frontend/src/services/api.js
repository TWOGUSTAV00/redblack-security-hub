const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

export async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
  } catch (_error) {
    throw new Error('Nao foi possivel conectar ao backend do Nemo IA. Verifique se o backend do Render esta no ar.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Erro HTTP ${response.status}`);
  }

  return response.json();
}

export { API_BASE_URL };
