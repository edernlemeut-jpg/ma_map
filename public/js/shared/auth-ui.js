/**
 * Auth UI module — check auth status and update header display.
 * Import this module on any page that needs conditional auth display.
 *
 * Usage: import { initAuthUI } from '/js/shared/auth-ui.js';
 *        initAuthUI();
 */

let currentUser = null;

export async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      currentUser = null;
      return null;
    }
    const json = await res.json();
    currentUser = json.data;
    return currentUser;
  } catch {
    currentUser = null;
    return null;
  }
}

export function getCurrentUser() {
  return currentUser;
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors — clear local state anyway
  }
  currentUser = null;
  window.location.href = '/login.html';
}

/**
 * Initialize auth UI — checks auth and updates DOM elements.
 * Expects elements with these IDs in the page:
 *   #auth-user-info — shown when logged in (contains username + logout button)
 *   #auth-user-name — text element for display_name
 *   #auth-login-link — shown when not logged in (link to login page)
 *   #auth-logout-btn — logout button
 */
export async function initAuthUI() {
  const user = await checkAuth();

  const userInfo = document.getElementById('auth-user-info');
  const userName = document.getElementById('auth-user-name');
  const loginLink = document.getElementById('auth-login-link');
  const logoutBtn = document.getElementById('auth-logout-btn');

  if (user) {
    if (userInfo) userInfo.classList.remove('hidden');
    if (userName) {
      userName.textContent = user.display_name || user.username;
      // If the element is a plain <span>, wrap the text in a profile link
      if (userName.tagName === 'SPAN') {
        const link = document.createElement('a');
        link.href = '/profile.html';
        link.className = 'hover:text-blue-400 transition-colors cursor-pointer';
        link.textContent = userName.textContent;
        userName.textContent = '';
        userName.appendChild(link);
      }
    }
    // Avatar 25×25 next to username
    if (userInfo && !userInfo.querySelector('#auth-user-avatar')) {
      const avatarEl = document.createElement('span');
      avatarEl.id = 'auth-user-avatar';
      avatarEl.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#374151;font-size:14px;';
      if (user.avatar) {
        avatarEl.innerHTML = `<img src="${user.avatar}" alt="" style="width:25px;height:25px;object-fit:cover;border-radius:50%" onerror="this.parentElement.textContent='👤'">`;
      } else {
        avatarEl.textContent = '👤';
      }
      userInfo.insertBefore(avatarEl, userInfo.firstChild);
    }
    if (loginLink) loginLink.classList.add('hidden');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }
  } else {
    if (userInfo) userInfo.classList.add('hidden');
    if (loginLink) loginLink.classList.remove('hidden');
  }

  return user;
}
