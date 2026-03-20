document.addEventListener('DOMContentLoaded', () => {
    // Detect Capacitor/Mobile for performance optimization
    const isMobile = !!window.Capacitor;
    if (isMobile) {
        document.body.classList.add('low-motion');
    }

    // Check if already logged in
    fetch('/api/currentUser')
        .then(res => {
            if (res.ok) {
                window.location.href = '/index.html'; // Redirect to chat if logged in
            }
        })
        .catch(err => console.error(err));

    const loginFormElement = document.getElementById('login-form');
    const registerFormElement = document.getElementById('register-form');

    const loginBox = document.querySelector('.login-box');
    const registerBox = document.getElementById('register-box');

    const showRegisterBtn = document.getElementById('show-register');
    const showLoginBtn = document.getElementById('show-login');

    const errorMessage = document.getElementById('error-message');
    const regErrorMessage = document.getElementById('reg-error-message');
    const successMessage = document.getElementById('success-message');

    // Toggle forms
    showRegisterBtn.addEventListener('click', () => {
        loginBox.classList.add('hidden');
        registerBox.classList.remove('hidden');
        regErrorMessage.classList.add('hidden');
    });

    showLoginBtn.addEventListener('click', () => {
        registerBox.classList.add('hidden');
        loginBox.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');
    });

    // Login Handler
    loginFormElement.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailOrId = document.getElementById('login-email-id').value;
        const password = document.getElementById('login-password').value;
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        btn.textContent = 'Logging in...';
        errorMessage.classList.add('hidden');

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_or_id: emailOrId, password })
            });

            const data = await res.json();

            if (res.ok) {
                window.location.href = '/index.html';
            } else {
                errorMessage.textContent = data.error;
                errorMessage.classList.remove('hidden');
            }
        } catch (error) {
            errorMessage.textContent = 'Network error. Please try again.';
            errorMessage.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Log In';
        }
    });

    // Registration Handler
    registerFormElement.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('reg-email').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        btn.textContent = 'Signing up...';
        regErrorMessage.classList.add('hidden');

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password })
            });

            const data = await res.json();

            if (res.ok) {
                // Show success and switch to login
                registerBox.classList.add('hidden');
                loginBox.classList.remove('hidden');

                successMessage.innerHTML = `Account created!<br>Your User ID is: <b>${data.userId}</b><br>Please log in.`;
                successMessage.classList.remove('hidden');

                // Pre-fill login
                document.getElementById('login-email-id').value = data.userId;
                document.getElementById('login-password').value = '';
            } else {
                regErrorMessage.textContent = data.error;
                regErrorMessage.classList.remove('hidden');
            }
        } catch (error) {
            regErrorMessage.textContent = 'Network error. Please try again.';
            regErrorMessage.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign Up';
        }
    });
});
