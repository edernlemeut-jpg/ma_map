const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const messageEl = document.getElementById('message');

const redirectUrl = new URLSearchParams(location.search).get('redirect') || '/';

// Toggle between forms
showRegister.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  hideMessage();
});

showLogin.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  hideMessage();
});

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();

    if (!res.ok) {
      showMessage(json.error?.message || 'Erreur de connexion', 'error');
      return;
    }

    window.location.href = redirectUrl;
  } catch {
    showMessage('Erreur réseau', 'error');
  }
});

// Register
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;

  if (password !== confirm) {
    showMessage('Les mots de passe ne correspondent pas', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();

    if (!res.ok) {
      showMessage(json.error?.message || 'Erreur d\'inscription', 'error');
      return;
    }

    showMessage(json.data?.message || 'Compte créé !', 'success');
    // Auto-redirect after short delay (cookie is already set)
    setTimeout(() => { window.location.href = redirectUrl; }, 1500);
  } catch {
    showMessage('Erreur réseau', 'error');
  }
});

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.classList.remove('hidden', 'bg-red-900', 'text-red-200', 'bg-green-900', 'text-green-200');
  if (type === 'error') {
    messageEl.classList.add('bg-red-900', 'text-red-200');
  } else {
    messageEl.classList.add('bg-green-900', 'text-green-200');
  }
}

function hideMessage() {
  messageEl.classList.add('hidden');
}
