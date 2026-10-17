const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function loginAdmin() {
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!email || !password) {
    alert("Completa todos los campos.");
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("Detalle del error de Supabase:", error);
    alert("Error de acceso: " + error.message);
  } else {
    alert("¡Inicio de sesión exitoso!");
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("admin-panel").classList.remove("hidden");
    loadAdminChannelsList();
  }
}

async function logoutAdmin() {
  await db.auth.signOut();
  document.getElementById("admin-panel").classList.add("hidden");
  document.getElementById("login-section").classList.remove("hidden");
}

async function sendAnnouncement() {
  const msgInput = document.getElementById("admin-msg");
  const text = msgInput ? msgInput.value.trim() : "";
  if (!text) return;

  const { error } = await db.from('live_chat').insert([{
    nickname: "🛡️ [ADMINISTRADOR]",
    country: "🌐 GLOBAL",
    message: "📢 ANUNCIO: " + text,
    channel: "Señal en vivo"
  }]);

  if (error) {
    alert("Error al enviar el anuncio.");
  } else {
    msgInput.value = "";
    alert("¡Anuncio enviado con éxito a los chats!");
  }
}

function saveChannel() {
  const name = document.getElementById("custom-name").value.trim();
  const logo = document.getElementById("custom-logo").value.trim();
  const url = document.getElementById("custom-url").value.trim();

  if (!url) {
    alert("Ingresa el enlace de transmisión.");
    return;
  }

  const customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
  customChannels.push({ id: Date.now().toString(), name: name || "Canal Admin", logo: logo || "", url: url });
  localStorage.setItem("donatelos_custom_channels", JSON.stringify(customChannels));

  alert("¡Canal guardado correctamente!");
  if (document.getElementById("custom-name")) document.getElementById("custom-name").value = "";
  if (document.getElementById("custom-logo")) document.getElementById("custom-logo").value = "";
  if (document.getElementById("custom-url")) document.getElementById("custom-url").value = "";

  loadAdminChannelsList();
}

// Cargar y filtrar canales en el Panel Admin
function loadAdminChannelsList() {
  const container = document.getElementById("admin-channels-list");
  if (!container) return;

  const baseChannels = JSON.parse(localStorage.getItem("donatelos_base_channels") || "[]");
  const customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
  const editedChannels = JSON.parse(localStorage.getItem("donatelos_edited_channels") || "{}");

  let allChannels = [...customChannels];
  
  baseChannels.forEach(ch => {
    let channelData = editedChannels[ch.name] ? { ...ch, ...editedChannels[ch.name] } : { ...ch };
    allChannels.push(channelData);
  });

  if (allChannels.length === 0) {
    container.innerHTML = `<p style="color: #9ca3af; font-size: 0.8rem; text-align: center; margin: 5px 0;">Primero abre la página principal de TV para cargar la lista de canales.</p>`;
    return;
  }

  // Comprobar si existe el input buscador o crearlo dinámicamente arriba de la lista junto con los botones masivos
  let searchInput = document.getElementById("admin-search-input");
  if (!searchInput) {
    const searchWrapper = document.createElement("div");
    searchWrapper.style.marginBottom = "10px";
    searchWrapper.innerHTML = `
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <button onclick="keepOnlyESPNChannels()" style="flex: 1; padding: 8px 10px; background: #8b5cf6; color: white; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: bold; cursor: pointer;">
          ⚡ Ocultar no ESPN
        </button>
        <button onclick="showAllChannelsGlobal()" style="flex: 1; padding: 8px 10px; background: #10b981; color: white; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: bold; cursor: pointer;">
          🔄 Mostrar Todos
        </button>
      </div>
      <input type="text" id="admin-search-input" placeholder="🔍 Buscar canal para editar o eliminar..." 
        style="width: 100%; padding: 8px 12px; background: #111827; border: 1px solid #374151; color: #fff; border-radius: 6px; font-size: 0.85rem; outline: none;" 
        oninput="filterAdminChannels()" />
    `;
    container.parentNode.insertBefore(searchWrapper, container);
  }

  renderAdminList(allChannels);
}

// Filtrar la lista del panel en tiempo real
function filterAdminChannels() {
  const searchInput = document.getElementById("admin-search-input");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  const baseChannels = JSON.parse(localStorage.getItem("donatelos_base_channels") || "[]");
  const customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
  const editedChannels = JSON.parse(localStorage.getItem("donatelos_edited_channels") || "{}");

  let allChannels = [...customChannels];
  
  baseChannels.forEach(ch => {
    let channelData = editedChannels[ch.name] ? { ...ch, ...editedChannels[ch.name] } : { ...ch };
    allChannels.push(channelData);
  });

  const filtered = allChannels.filter(ch => ch.name.toLowerCase().includes(query));
  renderAdminList(filtered);
}

// Dibujar los canales en el HTML
function renderAdminList(channelsToRender) {
  const container = document.getElementById("admin-channels-list");
  if (!container) return;

  const hiddenChannels = JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]");

  if (channelsToRender.length === 0) {
    container.innerHTML = `<p style="color: #9ca3af; font-size: 0.8rem; text-align: center; margin: 10px 0;">No se encontraron canales que coincidan con la búsqueda.</p>`;
    return;
  }

  let html = "";
  // Muestra hasta 200 resultados según la búsqueda
  channelsToRender.slice(0, 200).forEach((channel, index) => {
    const isCustom = !!channel.id;
    const isHidden = hiddenChannels.includes(channel.name);

    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; background: #030712; padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; font-size: 0.8rem; border: 1px solid #1f2937;">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; max-width: 230px;">
          ${channel.logo ? `<img src="${channel.logo}" style="width: 20px; height: 20px; object-fit: contain; border-radius: 3px;" onerror="this.style.display='none'">` : '📺'}
          <span style="color: ${isHidden ? '#6b7280' : '#fff'}; text-decoration: ${isHidden ? 'line-through' : 'none'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${channel.name}">
            ${channel.name} ${isHidden ? '(Oculto)' : ''}
          </span>
        </div>
        <div style="display: flex; gap: 4px;">
          ${isHidden ? `<button onclick="unhideSingleChannel('${channel.name}')" title="Hacer visible" style="background: #10b981; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 0.75rem;">👁️</button>` : ''}
          <button onclick="editChannelPrompt('${channel.name}')" title="Editar nombre e imagen" style="background: #f59e0b; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 0.75rem; width: auto;">✏️</button>
          <button onclick="deleteOrHideChannel('${channel.name}', ${isCustom}, ${index})" title="Eliminar / Ocultar" style="background: #ef4444; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 0.75rem; width: auto;">🗑️</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function editChannelPrompt(channelName) {
  const editedChannels = JSON.parse(localStorage.getItem("donatelos_edited_channels") || "{}");
  const currentData = editedChannels[channelName] || { name: channelName, logo: "" };

  const newName = prompt("Nuevo nombre para el canal:", currentData.name || channelName);
  if (newName === null) return;

  const newLogo = prompt("Nueva URL de la imagen/logo:", currentData.logo || "");
  if (newLogo === null) return;

  editedChannels[channelName] = {
    name: newName.trim() || channelName,
    logo: newLogo.trim()
  };

  localStorage.setItem("donatelos_edited_channels", JSON.stringify(editedChannels));
  alert("¡Canal actualizado correctamente!");
  filterAdminChannels();
}

function deleteOrHideChannel(channelName, isCustom, customIndex) {
  if (!confirm(`¿Estás seguro de eliminar u ocultar el canal "${channelName}"?`)) return;

  if (isCustom) {
    let customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
    customChannels.splice(customIndex, 1);
    localStorage.setItem("donatelos_custom_channels", JSON.stringify(customChannels));
  } else {
    let hiddenChannels = JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]");
    if (!hiddenChannels.includes(channelName)) {
      hiddenChannels.push(channelName);
      localStorage.setItem("donatelos_hidden_channels", JSON.stringify(hiddenChannels));
    }
  }

  // Sincronizar ocultamiento individual con Supabase
  if (db && !isCustom) {
    db.from('site_config').upsert({ 
      id: 'main_config', 
      hidden_channels: JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]"), 
      updated_at: new Date() 
    });
  }

  alert("Canal eliminado de la plataforma.");
  filterAdminChannels();
}

// Hacer visible un canal individualmente (1x1)
async function unhideSingleChannel(channelName) {
  let hiddenChannels = JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]");
  hiddenChannels = hiddenChannels.filter(name => name !== channelName);
  
  localStorage.setItem("donatelos_hidden_channels", JSON.stringify(hiddenChannels));

  if (db) {
    await db.from('site_config').upsert({ 
      id: 'main_config', 
      hidden_channels: hiddenChannels, 
      updated_at: new Date() 
    });
  }

  alert(`¡Canal "${channelName}" ahora es visible nuevamente!`);
  filterAdminChannels();
}

// Mostrar TODOS los canales ocultos de golpe (Masivo)
async function showAllChannelsGlobal() {
  if (!confirm("¿Estás seguro? Esto volverá a hacer visibles todos los canales que estaban ocultos en la plataforma.")) return;

  localStorage.setItem("donatelos_hidden_channels", JSON.stringify([]));

  if (db) {
    const { error } = await db.from('site_config').upsert({ 
      id: 'main_config', 
      hidden_channels: [], 
      updated_at: new Date() 
    });

    if (!error) {
      alert("¡Éxito! Se han restaurado y hecho visibles todos los canales en la nube y dispositivos.");
      location.reload();
      return;
    }
  }

  alert("¡Listo! Canales restaurados localmente.");
  filterAdminChannels();
}

// Función para ocultar masivamente todos los canales que no sean ESPN
async function keepOnlyESPNChannels() {
  if (!confirm("¿Estás seguro? Esto ocultará todos los canales de la plataforma excepto los que incluyan 'ESPN' en su nombre.")) return;

  const baseChannels = JSON.parse(localStorage.getItem("donatelos_base_channels") || "[]");
  const customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
  let hiddenChannels = JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]");

  baseChannels.forEach(ch => {
    const nameLower = ch.name.toLowerCase();
    const isCustom = customChannels.some(custom => custom.name === ch.name);
    
    // Si no es un canal personalizado y no contiene "espn", lo añadimos a ocultos
    if (!isCustom && !nameLower.includes("espn")) {
      if (!hiddenChannels.includes(ch.name)) {
        hiddenChannels.push(ch.name);
      }
    }
  });

  // Guardamos localmente
  localStorage.setItem("donatelos_hidden_channels", JSON.stringify(hiddenChannels));

  // Y GUARDAMOS EN SUPABASE PARA QUE SE ACTUALICE GLOBALMENTE EN PC Y MÓVIL
  if (db) {
    const { error } = await db
      .from('site_config')
      .upsert({ 
        id: 'main_config', 
        hidden_channels: hiddenChannels, 
        updated_at: new Date() 
      });

    if (!error) {
      alert(`¡Éxito! Se han ocultado los canales masivamente. Todos los dispositivos (PC y celulares) verán ahora únicamente los canales de ESPN.`);
      location.reload();
      return;
    } else {
      console.error("Error al sincronizar con Supabase:", error);
      alert("Se guardó localmente, pero hubo un error al sincronizar con la nube.");
    }
  } else {
    alert("Canales ocultos localmente (No hay conexión con Supabase).");
  }

  alert("¡Listo! Se han ocultado todos los canales que no son de ESPN.");
  filterAdminChannels();
}