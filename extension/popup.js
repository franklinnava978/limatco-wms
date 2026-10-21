document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const status = document.getElementById('status');
    
    status.innerText = "Conectando...";
    status.style.color = "#333";
    
    try {
        const res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        if (res.ok) {
            chrome.storage.local.set({ token: data.token, userName: data.user });
            mostrarLogueado(data.user);
        } else {
            status.innerText = data.error;
            status.style.color = "red";
        }
    } catch (e) {
        status.innerText = "Error: Backend apagado";
        status.style.color = "red";
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    chrome.storage.local.clear();
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('logged-view').classList.add('hidden');
    document.getElementById('status').innerText = "";
});

function mostrarLogueado(user) {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('logged-view').classList.remove('hidden');
    document.getElementById('user-name').innerText = user;
    document.getElementById('status').innerText = "";
}

chrome.storage.local.get(['token', 'userName'], (res) => {
    if (res.token) mostrarLogueado(res.userName);
});