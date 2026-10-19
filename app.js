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
      .select('hidden_channels, marquee_text')
      .eq('id', 'main_config')
      .single();

    if (!error && data) {
      if (data.hidden_channels) {
        globalHiddenChannels = data.hidden_channels;
      }
      if (data.marquee_text) {
        localStorage.setItem("donatelos_marquee_text", data.marquee_text);
        const track = document.getElementById("dynamic-announcement-track");
        if (track) {
          track.innerHTML = `
            <span>${data.marquee_text}</span>
            <span>${data.marquee_text}</span>
            <span>${data.marquee_text}</span>
          `;
        }
      }
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
    if (grid) grid.innerHTML = "<p class='loading-text'>Cargando programación y uniendo listas...</p>";
    
    const regioUrl = "http://srregio.online/10326/playlist.m3u";
    
    const [textBase, textRegio] = await Promise.all([
      fetchWithFallbackProxy(url).catch(err => {
        console.warn("Fallo al cargar la lista base:", err);
        return "";
      }),
      fetchWithFallbackProxy(regioUrl).catch(err => {
        console.warn("Fallo al cargar Sr. Regio:", err);
        return "";
      })
    ]);

    const rawChannelsBase = textBase ? parseM3U(textBase) : [];
    const rawChannelsRegio = textRegio ? parseM3U(textRegio) : [];

    const combinedRaw = [...rawChannelsBase, ...rawChannelsRegio].slice(0, 12000);
    
    loadSavedCustomChannels(); 

    const activeChannels = combinedRaw.filter(c => !offlineUrls.has(c.url));
    
    if (activeChannels.length > 0) {
      channels = [...channels, ...activeChannels];
    }
    
    window.channels = channels;
    localStorage.setItem("donatelos_base_channels", JSON.stringify(channels));

    const finalChannelsToRender = getFinalChannelsList(channels);

    if (!finalChannelsToRender || finalChannelsToRender.length === 0) {
      if (grid) grid.innerHTML = "<p class='loading-text'>No se encontraron canales disponibles.</p>";
      return;
    }

    renderChannels(finalChannelsToRender);

  } catch (error) {
    console.error("Error crítico en loadChannels:", error);
    if (grid) grid.innerHTML = "<p class='loading-text'>Error al cargar las transmisiones.</p>";
  }
}

function parseM3U(m3uText) {
  const lines = m3uText.split("\n");
  const parsedChannels = [];
  let currentChannel = {};

  for (let line of lines) {
    line = line.trim();

    // 1. Ignorar líneas vacías y directivas VLC o metadatos intermedios que ensucian
    if (!line || line.startsWith("#EXTVLCOPT:") || line.startsWith("#EXTGRP:")) {
      continue;
    }

    // 2. Procesar la información del canal (#EXTINF)
    if (line.startsWith("#EXTINF:")) {
      // Extraemos el logo si existe
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      
      // Extraemos todo lo que está después de la última coma de la línea #EXTINF
      const commaIndex = line.lastIndexOf(",");
      let rawName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : "Canal sin nombre";

      // Filtro estricto: Si el nombre capturado contiene rastros de User-Agent, lo descartamos
      if (
        rawName.includes("like Gecko") || 
        rawName.includes("Chrome/") || 
        rawName.includes("Mozilla/") || 
        rawName.includes("Safari/") ||
        rawName.includes("http-user-agent")
      ) {
        rawName = "Canal en Vivo";
      }

      currentChannel.name = rawName;
      currentChannel.logo = logoMatch ? logoMatch[1] : "https://via.placeholder.com/150?text=TV";
    } 
    // 3. Procesar la URL de transmisión
    else if (line.startsWith("http://") || line.startsWith("https://")) {
      currentChannel.url = line;
      
      // Asegurarnos de que el canal tenga un nombre válido antes de agregarlo
      if (!currentChannel.name || currentChannel.name.includes("like Gecko")) {
        currentChannel.name = "Canal en Vivo";
      }

      parsedChannels.push({ ...currentChannel });
      
      // Reiniciamos el objeto para la siguiente iteración
      currentChannel = {};
    }
  }

  return parsedChannels;
}
function playHlsStream(url, name) {
  if (hls) hls.destroy();
  currentRawUrl = url;
  if (channelTitle) channelTitle.innerText = name;

  if (name && name.toUpperCase().includes("ESPN")) {
    fetchSportsEventsForESPN();
  } else {
    const panel = document.getElementById("sports-matches-panel");
    if (panel) panel.innerHTML = "";
  }

  let finalUrl = url;

  if (
    url.includes("jmp2.uk") || 
    url.includes("srregio.online") || 
    (window.location.protocol === 'https:' && url.startsWith("http://"))
  ) {
    finalUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  }

  video.muted = true;

  if (Hls.isSupported()) {
    hls = new Hls({ 
      enableWorker: true, 
      lowLatencyMode: true,
      manifestLoadingTimeOut: 15000, 
      manifestLoadingMaxRetry: 4    
    });

    hls.loadSource(finalUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().then(() => {
        setTimeout(() => { video.muted = false; }, 1000);
      }).catch(e => console.log("Autoplay bloqueado por el navegador"));
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn("Error de red o CORS. Cambiando de proxy alternativo...");
            
            if (finalUrl.includes("corsproxy.io")) {
              finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
              hls.loadSource(finalUrl);
              hls.startLoad();
            } else if (finalUrl.includes("allorigins")) {
              finalUrl = url; 
              hls.loadSource(finalUrl);
              hls.startLoad();
            } else {
              hls.startLoad(); 
            }
            break;
            
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
            
          default:
            hls.destroy();
            break;
        }
      }
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

    // Filtro para excluir canales sin logo o con logo por defecto vacío
    if (!ch.logo || ch.logo.trim() === "" || ch.logo.includes("placeholder")) {
      return false;
    }

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

  const uniqueChannels = finalChannels.filter((channel, index, self) =>
    index === self.findIndex((c) => c.url === channel.url)
  );

  grid.innerHTML = "";
  
  if (uniqueChannels.length === 0) {
    grid.innerHTML = "<p class='loading-text'>No se encontraron canales disponibles.</p>";
    return;
  }

  const limitedChannels = uniqueChannels.slice(0, 500);

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

  const sidebarGrid = document.getElementById("sidebar-channels-grid");
  if (sidebarGrid) {
    sidebarGrid.innerHTML = "";
    uniqueChannels.slice(0, 100).forEach(c => {
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
        displayMessage(msg); 
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

async function loadDynamicMarquee() {
  const track = document.getElementById("dynamic-announcement-track");
  if (!track) return;

  let message = localStorage.getItem("donatelos_marquee_text") || "ESPERAR UNOS SEGUNDOS PARA QUE TERMINEN DE CARGAR LOS CANALES Y EVITAR INTERRUPCIONES";

  if (typeof db !== 'undefined' && db) {
    try {
      const { data, error } = await db.from('site_config').select('marquee_text').eq('id', 'main_config').single();
      if (data && data.marquee_text) {
        message = data.marquee_text;
        localStorage.setItem("donatelos_marquee_text", message);
      }
    } catch (e) {
      console.error("Error al sincronizar el anuncio con Supabase:", e);
    }
  }

  track.innerHTML = `
    <span>${message}</span>
    <span>${message}</span>
    <span>${message}</span>
  `;
}

window.addEventListener("DOMContentLoaded", loadDynamicMarquee);

function renombrarCanales() {
  const elementos = document.querySelectorAll('.channel-name, .nombre-canal'); 

  elementos.forEach(elemento => {
    const textoActual = elemento.textContent;

    if (textoActual.trim() === "ESPN 4") {
      elemento.textContent = "ESPN Premium";
    }
    if (textoActual.trim() === "ESPN Extra") {
      elemento.textContent = "ESPN VIP";
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(renombrarCanales, 1500);
});
/* ==========================================================================
   PANEL DE ADMINISTRACIÓN (Paginado para +12,000 canales)
   ========================================================================== */

let currentAdminPage = 1;
const CHANNELS_PER_PAGE = 50;
let filteredAdminChannels = [];

// Función para abrir/renderizar el panel de administración
function renderAdminPanel() {
  // Tomamos todos los canales disponibles en memoria
  const sourceList = window.channels && window.channels.length > 0 ? window.channels : channels;
  
  // Limpiamos la lista quitando valores nulos o corruptos
  filteredAdminChannels = sourceList.filter(c => c && c.name && !c.name.includes("like Gecko"));
  currentAdminPage = 1;
  displayAdminPage();
}

function displayAdminPage() {
  const container = document.getElementById("admin-channels-list");
  if (!container) return;

  container.innerHTML = "";

  const start = (currentAdminPage - 1) * CHANNELS_PER_PAGE;
  const end = start + CHANNELS_PER_PAGE;
  const pageChannels = filteredAdminChannels.slice(start, end);

  if (pageChannels.length === 0) {
    container.innerHTML = "<p style='color:#9ca3af; padding:15px; text-align:center;'>No se encontraron canales.</p>";
    return;
  }

  pageChannels.forEach((canal, index) => {
    const globalIndex = start + index; // Índice numérico real
    const row = document.createElement("div");
    row.className = "admin-channel-row";
    row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid #1e293b; color:white; background:#0f172a; margin-bottom:4px; border-radius:6px;";

    // Pasamos el número 'globalIndex' a los eventos para evitar romper el DOM
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
        <img src="${canal.logo || 'https://via.placeholder.com/150'}" width="32" height="32" style="object-fit:contain; border-radius:4px; background:#000;" onerror="this.src='https://via.placeholder.com/150'">
        <span style="font-size:0.9rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:250px;">${escapeHTML(canal.name)}</span>
      </div>
      <div style="display:flex; gap:6px; shrink:0;">
        <button type="button" onclick="adminToggleHide(${globalIndex})" style="background:#10b981; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; color:white;">👁️</button>
        <button type="button" onclick="adminOpenEdit(${globalIndex})" style="background:#f59e0b; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; color:white;">✏️</button>
        <button type="button" onclick="adminDeleteChannel(${globalIndex})" style="background:#ef4444; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; color:white;">🗑️</button>
      </div>
    `;
    container.appendChild(row);
  });

  renderAdminPaginationControls();
}

function renderAdminPaginationControls() {
  const totalPages = Math.ceil(filteredAdminChannels.length / CHANNELS_PER_PAGE);
  let navContainer = document.getElementById("admin-pagination");

  if (!navContainer) {
    navContainer = document.createElement("div");
    navContainer.id = "admin-pagination";
    navContainer.style.cssText = "display:flex; gap:12px; justify-content:center; align-items:center; margin:15px 0; color:white;";
    const listElem = document.getElementById("admin-channels-list");
    if (listElem) listElem.after(navContainer);
  }

  if (navContainer) {
    navContainer.innerHTML = `
      <button ${currentAdminPage === 1 ? "disabled" : ""} onclick="changeAdminPage(-1)" style="padding:6px 12px; background:#334155; color:white; border:none; border-radius:4px; cursor:pointer;">◀ Anterior</button>
      <span style="font-size:0.85rem;">Página ${currentAdminPage} de ${totalPages || 1} (${filteredAdminChannels.length} canales)</span>
      <button ${currentAdminPage >= totalPages ? "disabled" : ""} onclick="changeAdminPage(1)" style="padding:6px 12px; background:#334155; color:white; border:none; border-radius:4px; cursor:pointer;">Siguiente ▶</button>
    `;
  }
}

function changeAdminPage(delta) {
  currentAdminPage += delta;
  displayAdminPage();
}

// Buscador directo del panel de administración
function filterAdminChannels(query) {
  const q = query.toLowerCase().trim();
  const sourceList = window.channels && window.channels.length > 0 ? window.channels : channels;
  
  if (!q) {
    filteredAdminChannels = sourceList.filter(c => c && c.name && !c.name.includes("like Gecko"));
  } else {
    filteredAdminChannels = sourceList.filter(c => c && c.name && c.name.toLowerCase().includes(q) && !c.name.includes("like Gecko"));
  }
  currentAdminPage = 1;
  displayAdminPage();
}

// Ocultar / Mostrar canal desde el Admin
function adminToggleHide(globalIndex) {
  const channel = filteredAdminChannels[globalIndex];
  if (!channel) return;

  let localHidden = JSON.parse(localStorage.getItem("donatelos_hidden_channels") || "[]");
  if (localHidden.includes(channel.name)) {
    localHidden = localHidden.filter(name => name !== channel.name);
    alert(`El canal "${channel.name}" ahora es VISIBLE.`);
  } else {
    localHidden.push(channel.name);
    alert(`El canal "${channel.name}" ha sido OCULTADO.`);
  }

  localStorage.setItem("donatelos_hidden_channels", JSON.stringify(localHidden));
  renderChannels(channels);
  displayAdminPage();
}

// Eliminar canal personalizado
function adminDeleteChannel(globalIndex) {
  const channel = filteredAdminChannels[globalIndex];
  if (!channel) return;

  if (confirm(`¿Estás seguro de eliminar el canal "${channel.name}"?`)) {
    let customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
    customChannels = customChannels.filter(c => c.name !== channel.name && c.url !== channel.url);
    
    localStorage.setItem("donatelos_custom_channels", JSON.stringify(customChannels));
    
    // Actualizamos la memoria
    channels = channels.filter(c => c.name !== channel.name);
    window.channels = channels;
    
    renderChannels(channels);
    renderAdminPanel();
  }
}

// Editar nombre o URL de canal
function adminOpenEdit(globalIndex) {
  const channel = filteredAdminChannels[globalIndex];
  if (!channel) return;

  const newName = prompt("Nuevo nombre del canal:", channel.name);
  if (newName !== null && newName.trim() !== "") {
    const editedChannels = JSON.parse(localStorage.getItem("donatelos_edited_channels") || "{}");
    editedChannels[channel.name] = { ...channel, name: newName.trim() };
    
    localStorage.setItem("donatelos_edited_channels", JSON.stringify(editedChannels));
    
    location.reload(); // Recarga para actualizar las vistas
  }
}
// Función para buscar eventos deportivos y mostrarlos al seleccionar ESPN
async function fetchSportsEventsForESPN() {
  try {
    const targetUrl = `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=4328`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(proxyUrl);
    const data = await response.json();
    
    if (data.events && data.events.length > 0) {
      renderSportsPanel(data.events);
    } else {
      console.log("No hay eventos próximos disponibles en este momento.");
    }
  } catch (error) {
    console.error("Error al obtener los partidos de TheSportsDB:", error);
  }
}

// Función para renderizar los partidos de forma visible debajo del reproductor
function renderSportsPanel(events) {
  let panel = document.getElementById("sports-matches-panel");
  
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sports-matches-panel";
    panel.style.cssText = "background: #15181e; color: #fff; padding: 15px; margin: 15px 0; border-radius: 8px; border: 1px solid #2a2f38; width: 100%; box-sizing: border-box;";
    
    // Buscamos el contenedor principal donde está el reproductor para agregarlo justo debajo
    const videoContainer = document.querySelector("video").closest("div") || document.getElementById("video-container");
    if (videoContainer && videoContainer.parentNode) {
      videoContainer.parentNode.insertBefore(panel, videoContainer.nextSibling);
    } else {
      document.body.appendChild(panel);
    }
  }

  let htmlContent = `<h3 style="margin-top:0; color:#ff4757; font-size: 16px; margin-bottom: 12px;">📺 Partidos en Cartelera / Transmisión</h3><ul style="list-style: none; padding: 0; margin: 0;">`;
  
  events.forEach(event => {
    htmlContent += `
      <li style="padding: 10px 0; border-bottom: 1px solid #2a2f38; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 14px;">⚽ <b>${event.strEvent}</b></span>
        <span style="font-size: 12px; color: #aaa; background: #1e222b; padding: 4px 8px; border-radius: 4px;">${event.dateEvent} ${event.strTime ? event.strTime.slice(0,5) : ''}</span>
      </li>
    `;
  });
  
  htmlContent += `</ul>`;
  panel.innerHTML = htmlContent;
}
// Función para renderizar los partidos con el diseño tabular de la imagen de referencia
function renderSportsPanel(events) {
  let panel = document.getElementById("sports-matches-panel");
  
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sports-matches-panel";
    panel.style.cssText = "background: #12161c; color: #fff; padding: 20px; margin: 20px 0; border-radius: 12px; border: 1px solid #21262d; width: 100%; box-sizing: border-box; font-family: sans-serif;";
    
    const videoContainer = document.querySelector("video").closest("div") || document.getElementById("video-container");
    if (videoContainer && videoContainer.parentNode) {
      videoContainer.parentNode.insertBefore(panel, videoContainer.nextSibling);
    } else {
      document.body.appendChild(panel);
    }
  }

  let htmlContent = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #21262d; padding-bottom: 12px; margin-bottom: 15px;">
      <div>
        <h3 style="margin: 0; color: #3fb950; font-size: 18px;">⚽ PRÓXIMOS PARTIDOS EN CARTELERA</h3>
        <span style="font-size: 12px; color: #8b949e;">${events.length} eventos programados</span>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 1fr 1.5fr; font-size: 12px; color: #8b949e; padding: 8px 12px; border-bottom: 1px solid #21262d; font-weight: bold;">
      <div>PARTIDO / COMPETICIÓN</div>
      <div>FECHA / HORA</div>
      <div>CANAL / EVIDENCIA</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
  `;
  
  events.forEach(event => {
    htmlContent += `
      <div style="display: grid; grid-template-columns: 2fr 1fr 1.5fr; padding: 12px; background: #161b22; border: 1px solid #21262d; border-radius: 8px; align-items: center; font-size: 13px;">
        <div>
          <div style="font-weight: bold; color: #f0f6fc; margin-bottom: 3px;">${event.strEvent}</div>
          <div style="font-size: 11px; color: #8b949e;">${event.strLeague || 'Evento deportivo'} ${event.strCountry ? '• ' + event.strCountry : ''}</div>
        </div>
        <div>
          <div style="color: #f0f6fc; font-weight: 500;">${event.dateEvent}</div>
          <div style="color: #8b949e; font-size: 11px;">${event.strTime ? event.strTime.slice(0,5) : 'Por confirmar'}</div>
        </div>
        <div>
          <span style="background: #238636; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">Transmite ESPN</span>
        </div>
      </div>
    `;
  });
  
  htmlContent += `</div>`;
  panel.innerHTML = htmlContent;
}
// Asegurar desplazamiento automático en la lista de canales al usar el control remoto (TV)
document.addEventListener('focus', function(event) {
  if (event.target && event.target.classList.contains('channel-item')) {
    event.target.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }
}, true);
async function cargarCarteleraDeportivaDesdeSupabase() {
  if (!db) return;

  const { data: partidos, error } = await db
    .from('partidos_cartelera')
    .select('*');

  if (error || !partidos || partidos.length === 0) {
    console.log("No hay partidos programados en la cartelera.");
    return;
  }

  // 1. Dibujar el botón "Agenda" en la zona indicada
  const inlineContainer = document.getElementById("inline-sports-container");
  if (inlineContainer) {
    inlineContainer.innerHTML = `
      <button onclick="toggleSportsModal()" style="
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #f8fafc;
        padding: 8px 16px;
        border-radius: 10px;
        cursor: pointer;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        backdrop-filter: blur(8px);
        transition: all 0.2s ease;
      " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
        <span style="font-size: 14px;">📅</span>
        <span>Agenda</span>
        <span style="background: rgba(249, 115, 22, 0.2); color: #fb923c; padding: 1px 6px; border-radius: 6px; font-size: 11px; font-weight: 600;">
          ${partidos.length}
        </span>
      </button>
    `;
  }

  // 2. Crear la Ventana Modal para los Partidos
  let modal = document.getElementById("sports-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "sports-modal";
    modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 999999;
      justify-content: center;
      align-items: center;
      padding: 16px;
      box-sizing: border-box;
    `;
    document.body.appendChild(modal);
  }

  // 3. Renderizar los partidos dentro del Modal
  let modalContent = `
    <div style="background: #0f172a; border: 1px solid rgba(255,255,255,0.1); width: 100%; max-width: 650px; max-height: 85vh; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
      
      <div style="padding: 16px 20px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">📅</span>
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc;">Agenda de Partidos</h3>
        </div>
        <button onclick="toggleSportsModal()" style="background: rgba(255,255,255,0.1); border: none; color: #94a3b8; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 16px; font-weight: bold;">✕</button>
      </div>

      <div style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
  `;

  partidos.forEach(event => {
    modalContent += `
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); padding: 12px 14px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${event.home_logo || 'https://via.placeholder.com/24'}" width="24" height="24" style="object-fit:contain;" onerror="this.src='https://via.placeholder.com/24'">
            <span style="font-weight: 600; font-size: 13px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">${escapeHTML(event.home_team)}</span>
          </div>
          <span style="color: #64748b; font-size: 12px; font-weight: bold;">-</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${event.away_logo || 'https://via.placeholder.com/24'}" width="24" height="24" style="object-fit:contain;" onerror="this.src='https://via.placeholder.com/24'">
            <span style="font-weight: 600; font-size: 13px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">${escapeHTML(event.away_team)}</span>
          </div>
        </div>

        <div style="font-size: 11px; color: #94a3b8; font-weight: 500; white-space: nowrap;">
          ${escapeHTML(event.match_time || '')}
        </div>

        <div>
          <button onclick="playMatchFromModal('${event.stream_url}', '${escapeHTML(event.channel_name)}')" style="background: #2563eb; color: white; padding: 6px 12px; border: none; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
            📺 ${escapeHTML(event.channel_name)} ↗
          </button>
        </div>

      </div>
    `;
  });

  modalContent += `
      </div>
    </div>
  `;

  modal.innerHTML = modalContent;
}

function toggleSportsModal() {
  const modal = document.getElementById("sports-modal");
  if (!modal) return;
  modal.style.display = (modal.style.display === "none" || modal.style.display === "") ? "flex" : "none";
}

function playMatchFromModal(url, name) {
  playHlsStream(url, name);
  toggleSportsModal();
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(cargarCarteleraDeportivaDesdeSupabase, 1000);
});

function toggleLiveBubble() {
  const content = document.getElementById('live-bubble-content');
  const icon = document.getElementById('bubble-toggle-icon');
  if (!content) return;
  if (content.style.display === 'none') {
    content.style.display = 'block';
    if (icon) icon.textContent = '▼';
  } else {
    content.style.display = 'none';
    if (icon) icon.textContent = '▲';
  }
}