// Standard Fetch Wrapper with simulated cookie-session auth headers
export async function fetchAPI(endpoint, options = {}) {
  // Read active user session from cookies on the client side
  let activeRole = 'ADMIN';
  let activeId = 'user-sec-1';

  if (typeof window !== 'undefined') {
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('bsmc_session='));
    if (sessionCookie) {
      try {
        const session = JSON.parse(decodeURIComponent(sessionCookie.split('=')[1]));
        if (session) {
          activeRole = session.role;
          activeId = session.id;
        }
      } catch (err) {
        console.error("Failed to parse session cookie:", err);
      }
    }
  }

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': activeRole,
      'x-user-id': activeId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'An unexpected error occurred');
  }

  return response.json();
}
