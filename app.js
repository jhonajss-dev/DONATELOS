let channels = [];
let hls = null;
let retryCount = 0;
let currentRawUrl = "";
const offlineUrls = new Set(JSON.parse(localStorage.getItem("futbolitos_offline") || "[]"));

const video = document.getElementById("video");
const channelTitle = document.getElementById("current-channel-title");
const grid = document.getElementById("channels-grid");
const sectionHeading = document.getElementById("section-heading");

// Configuración de Supabase
const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

let db = null;
if (window.supabase) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Variable para almacenar los canales ocultos globales desde la nube
let globalHiddenChannels = [];

// Función para cargar la configuración global de canales ocultos desde Supabase
async function loadGlobalConfig() {
  if (!db) return;
  try {
    const { data, error } = await db
      .from('site_config')
      .select('hidden_channels')
      .eq('id', 'main_config')
      .single();

    if (!error && data && data.hidden_channels) {
      globalHiddenChannels = data.hidden_channels;
    }
  } catch (e) {
    console.log("Usando configuración local de respaldo");
  }
}

// Carga los canales personalizados guardados por el administrador
function loadSavedCustomChannels() {
  const saved = localStorage.getItem("donatelos_custom_channels");
  if (saved) {
    try {
      const customChannels = JSON.parse(saved);
      channels = [...customChannels, ...channels];
    } catch (e) {
      console.error("Error al cargar canales personalizados", e);
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (db) {
    await loadGlobalConfig(); 
    loadInitialMessages();
    subscribeToRealtimeChat();
  }

  const searchInput = document.getElementById("search");
  if (searchInput) {
    searchInput.addEventListener("input", applyCurrentFilters);
  }

  const shareBtn = document.getElementById('btn-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', shareCurrentChannel);
  }
  
  await loadChannels("https://iptv-org.github.io/iptv/index.m3u");
});

// Sistema inteligente de respaldo con múltiples proxies para evitar bloqueos
async function fetchWithFallbackProxy(targetUrl) {
  const proxies = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  for (const getProxyUrl of proxies) {
    try {
      const proxyUrl = getProxyUrl(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) continue;

      const text = await res.text();
      if (text && !text.startsWith("Oops") && !text.startsWith("<")) return text;
    } catch (e) {
      console.warn("Proxy falló, probando el siguiente...", e);
    }
  }

  try {
    const directRes = await fetch(targetUrl);
    if (directRes.ok) return await directRes.text();
  } catch (e) {
    console.warn("Petición directa falló");
  }

  throw new Error("No se pudo obtener la lista M3U a través de ningún proxy.");
}

async function loadChannels(url) {
  try {
    if (grid) grid.innerHTML = "<p class='loading-text'>Cargando programación y filtrando transmisiones activas...</p>";
    
    const text = await fetchWithFallbackProxy(url);
    const rawChannels = parseM3U(text).slice(0, 5000);
    
    // Filtramos los que estén offline
    const activeChannels = rawChannels.filter(c => !offlineUrls.has(c.url));
    
    channels = activeChannels;
    loadSavedCustomChannels(); 
    
    window.channels = channels;
    localStorage.setItem("donatelos_base_channels", JSON.stringify(channels));

    const finalChannelsToRender = getFinalChannelsList(channels);
    renderChannels(finalChannelsToRender);
  } catch (error) {
    if (grid) grid.innerHTML = "<p class='loading-text'>Error al cargar las transmisiones.</p>";
  }
}

function parseM3U(m3uText) {
  const lines = m3uText.split("\n");
  const parsedChannels = [];
  let currentChannel = {};

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      currentChannel.name = nameMatch ? nameMatch[1].trim() : "Canal sin nombre";
      currentChannel.logo = logoMatch ? logoMatch[1] : "https://via.placeholder.com/150?text=TV";
    } else if (line.startsWith("http://") || line.startsWith("https://")) {
      currentChannel.url = line;
      if (currentChannel.name) parsedChannels.push(currentChannel);
      currentChannel = {};
    }
  }
  return parsedChannels;
}

function playHlsStream(url, name) {
  if (hls) hls.destroy();
  currentRawUrl = url;
  if (channelTitle) channelTitle.innerText = name;

  const proxyUrl = "https://corsproxy.io/?";
  const finalUrl = url.startsWith("http://") ? proxyUrl + encodeURIComponent(url) : url;

  video.muted = true;

  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(finalUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().then(() => {
        setTimeout(() => { video.muted = false; }, 1000);
      }).catch(e => console.log("Bloqueado"));
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = finalUrl;
    video.play().then(() => {
      setTimeout(() => { video.muted = false; }, 1000);
    }).catch(e => console.log("Bloqueado"));
  }
}

function getFinalChannelsList(baseChannels) {
  const customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
  const editedChannels = JSON.parse(localStorage.getItem("donatelos_edited_channels") || "{}");
  
  const localHidden = JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]");
  const allHidden = [...new Set([...localHidden, ...globalHiddenChannels])];

  let filteredBase = baseChannels.filter(ch => {
    if (!ch || !ch.name) return false;
    if (allHidden.includes(ch.name)) return false;
    return true;
  });

  filteredBase = filteredBase.map(ch => {
    if (editedChannels[ch.name]) {
      return { ...ch, ...editedChannels[ch.name] };
    }
    return ch;
  });

  return [...customChannels, ...filteredBase];
}
function renderChannels(channelList) {
  if (!grid) return;

  let rawChannels = channelList;
  if (!rawChannels || rawChannels.length === 0) {
    rawChannels = window.channels || channels || [];
  }

  const finalChannels = getFinalChannelsList(rawChannels);

  grid.innerHTML = "";
  
  if (finalChannels.length === 0) {
    grid.innerHTML = "<p class='loading-text'>No se encontraron canales disponibles.</p>";
    return;
  }

  // LIMITAR ESTRICTAMENTE A MÁXIMO 500 CANALES EN PANTALLA PRINCIPAL
  const limitedChannels = finalChannels.slice(0, 500);

  limitedChannels.forEach(c => {
    const card = document.createElement("div");
    card.className = "channel-card";
    card.onclick = () => playHlsStream(c.url, c.name);
    card.innerHTML = `
      <div class="card-thumb">
        <span class="status-badge online">Live</span>
        <img src="${c.logo || 'https://via.placeholder.com/150'}" alt="${c.name}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150'">
      </div>
      <div class="card-body">
        <h4 class="card-title">${c.name}</h4>
      </div>
    `;
    grid.appendChild(card);
  });

  // POBLAR LA MINI LISTA DEBAJO DEL CHAT EN LA BARRA LATERAL
  const sidebarGrid = document.getElementById("sidebar-channels-grid");
  if (sidebarGrid) {
    sidebarGrid.innerHTML = "";
    finalChannels.slice(0, 100).forEach(c => {
      const item = document.createElement("div");
      item.className = "side-channel-item";
      item.onclick = () => playHlsStream(c.url, c.name);
      item.innerHTML = `
        <img src="${c.logo || 'https://via.placeholder.com/150'}" alt="${c.name}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150'">
        <div style="overflow: hidden;">
          <div style="font-size: 0.8rem; font-weight: bold; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${escapeHTML(c.name)}</div>
          <span style="font-size: 0.65rem; color: #34d399;">● En vivo</span>
        </div>
      `;
      sidebarGrid.appendChild(item);
    });
  }
}

function applyCurrentFilters() {
  const query = document.getElementById("search") ? document.getElementById("search").value.toLowerCase() : "";
  const sourceList = window.channels && window.channels.length > 0 ? window.channels : channels;
  
  const baseFiltered = getFinalChannelsList(sourceList);
  const finalDisplayList = baseFiltered.filter(c => c.name.toLowerCase().includes(query));
  
  renderChannels(finalDisplayList.slice(0, 100));
}

function filterByKeyword(keyword) {
  const sourceList = window.channels && window.channels.length > 0 ? window.channels : channels;
  
  const baseFiltered = getFinalChannelsList(sourceList);
  const finalDisplayList = baseFiltered.filter(c => c.name.toLowerCase().includes(keyword.toLowerCase()));
  
  renderChannels(finalDisplayList.slice(0, 100));
}

function changeCategory(url, btn) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  loadChannels(url);
}

function loadInternationalSports(btn) { changeCategory("https://iptv-org.github.io/iptv/categories/sports.m3u", btn); }
function loadCustomNbaList(btn) { changeCategory("https://iptv-org.github.io/iptv/categories/sports.m3u", btn); }
function loadUserCustomList(btn) { renderChannels(channels.slice(0, 50)); }

let currentChatSubscription = null;

// CARGA INICIAL DE MENSAJES (GENERAL PARA TODOS, FORMATO DE HORA 1-12 AM/PM)
async function loadInitialMessages() {
  if (!db) return;

  const { data, error } = await db
    .from('live_chat')
    .select('*')
    .order('id', { ascending: false })
    .limit(50);

  const messagesBox = document.getElementById("chat-messages");
  if (messagesBox) messagesBox.innerHTML = ""; 

  if (!error && data) {
    data.reverse().forEach(msg => displayMessage(msg));
  }
}

// SUSCRIPCIÓN EN TIEMPO REAL PARA TODOS LOS USUARIOS Y CANALES
function subscribeToRealtimeChat() {
  if (!db) return;
  
  if (currentChatSubscription) {
    db.removeChannel(currentChatSubscription);
  }

  currentChatSubscription = db
    .channel('public:live_chat_general_global')
    .on(
      'postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'live_chat'
      }, 
      payload => {
        const msg = payload.new;
        displayMessage(msg); // Muestra el mensaje en tiempo real a todos los conectados
      }
    )
    .subscribe();
}

function showGTAAdminBanner(msgText, timeStr) {
  const banner = document.getElementById("gta-admin-banner");
  const bannerText = document.getElementById("gta-banner-text");
  const bannerTime = document.getElementById("gta-banner-time");

  if (!banner || !bannerText) return;

  const cleanMessage = msgText.replace("📢 ANUNCIO:", "").trim();
  bannerText.innerText = cleanMessage;
  if (bannerTime) bannerTime.innerText = timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  banner.classList.add("gta-banner-show");

  try {
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch(e) {}

  setTimeout(() => {
    banner.classList.remove("gta-banner-show");
  }, 7000);
}

function displayMessage(data) {
  const messagesBox = document.getElementById("chat-messages");

  const dateObj = data.created_at ? new Date(data.created_at) : new Date();
  
  // Formato de hora de 1 a 12 con AM/PM
  const timeStr = dateObj.toLocaleTimeString([], { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });

  if (data.nickname && data.nickname.includes("ADMINISTRADOR")) {
    showGTAAdminBanner(data.message, timeStr);
  }

  if (!messagesBox) return;

  const msgDiv = document.createElement("div");
  msgDiv.style.fontSize = "0.8rem";
  msgDiv.style.marginBottom = "6px";
  msgDiv.innerHTML = `
    <strong style="color: #ef4444;">${escapeHTML(data.nickname)} · ${escapeHTML(data.country || 'Perú')}</strong> - 
    <span style="color: #6b7280; font-size: 0.7rem;">${timeStr}</span>
    <div style="margin-top: 2px; color: #ffffff; font-weight: bold; background: rgba(239,68,68,0.1); padding: 4px; border-radius: 4px; border-left: 3px solid #ef4444;">
      ${escapeHTML(data.message)}
    </div>
  `;
  messagesBox.appendChild(msgDiv);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

async function sendChatMessage(customMsg = null) {
  const nickInput = document.getElementById("chat-nickname");
  const countrySelect = document.getElementById("chat-country");
  const textInput = document.getElementById("chat-text");

  const nickname = nickInput && nickInput.value.trim() !== "" ? nickInput.value.trim() : "Anónimo";
  const country = countrySelect ? countrySelect.value : "Perú";
  const message = customMsg || (textInput ? textInput.value.trim() : "");
  if (!message) return;

  if (db) {
    const { error } = await db.from('live_chat').insert([
      { 
        nickname: nickname, 
        country: country, 
        message: message, 
        channel: "General" 
      }
    ]);
    if (error) console.error("Error al enviar mensaje:", error);
  } else {
    displayMessage({ nickname, country, message, channel: "General", created_at: new Date() });
  }

  if (!customMsg && textInput) textInput.value = "";
}

function sendQuickStatus(statusText) { sendChatMessage(statusText); }

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function toggleMute() { video.muted = !video.muted; }
function changeVolume(val) { video.volume = val; }
function toggleFullScreen() { if (video.requestFullscreen) video.requestFullscreen(); }
function togglePip() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else if (video.requestPictureInPicture) {
    video.requestPictureInPicture();
  }
}
function toggleCinemaMode() { document.body.classList.toggle("cinema-mode"); }

function shareCurrentChannel() {
  const channelTitleElement = document.getElementById('current-channel-title');
  const channelTitle = channelTitleElement ? channelTitleElement.innerText.trim() : '';

  const shareUrl = new URL(window.location.origin + window.location.pathname);
  if (channelTitle) {
    shareUrl.searchParams.set('channel', channelTitle);
  }

  const shareData = {
    title: `Donatelos TV - ${channelTitle || 'En Vivo'}`,
    text: `¡Mira ${channelTitle || 'televisión en vivo'} gratis en Donatelos TV!`,
    url: shareUrl.toString()
  };

  if (navigator.share) {
    navigator.share(shareData).catch((err) => console.log('Compartir cancelado:', err));
  } else {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`;
    window.open(waUrl, '_blank');
  }
}