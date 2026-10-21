chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "NUEVA_CAPTURA") {
        chrome.storage.local.get(['token'], async (res) => {
            if (!res.token) {
                console.warn("⚠️ Operario no logueado. Ve al icono de la extensión e ingresa.");
                return;
            }

            try {
                const respuesta = await fetch('http://localhost:3000/api/capturas', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${res.token}`
                    },
                    body: JSON.stringify(message.payload)
                });

                if (respuesta.ok) {
                    const data = await respuesta.json();
                    console.log("☁️ [Limatco WMS] Guardado en Google Sheets. ID:", data.id);
                } else {
                    console.error("❌ Error del servidor:", respuesta.status);
                }
            } catch (error) {
                console.error("🌐 Fallo de red. No se pudo conectar al backend.");
            }
        });
    }
});