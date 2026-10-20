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

// Función para cargar la configuración global de canales ocultos y anuncios desde Supabase
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
            <span>${escapeHTML(data.marquee_text)}</span>
            <span>${escapeHTML(data.marquee_text)}</span>
            <span>${escapeHTML(data.marquee_text)}</span>
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
  }

  const searchInput = document.getElementById("search");
  if (searchInput) {
    searchInput.addEventListener("input", applyCurrentFilters);
  }

  const shareBtn = document.getElementById('btn-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', shareCurrentChannel);
  }
  
  // Inicialización de la marquesina y el widget de partidos de ESPN
  loadDynamicMarquee();

  await loadChannels("https://iptv-org.github.io/iptv/index.m3u");
});

async function fetchWithFallbackProxy(targetUrl) {
  // Asegurar que si la URL es interna/externa compatible con HTTP/HTTPS, rote por proxies seguros
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

  // Intento de respaldo directo por si el navegador lo permite
  try {
    const directRes = await fetch(targetUrl);
    if (directRes.ok) return await directRes.text();
  } catch (e) {
    console.warn("Petición directa falló por políticas de seguridad HTTP/HTTPS");
  }

  throw new Error("No se pudo obtener la lista a través de ningún proxy disponible.");
}
async function loadChannels(url) {
  try {
    if (grid) grid.innerHTML = "<p class='loading-text'>Cargando programación y uniendo listas...</p>";
    
    const textBase = await fetchWithFallbackProxy(url).catch(err => {
      console.warn("Fallo al cargar la lista base:", err);
      return "";
    });

    const rawChannelsBase = textBase ? parseM3U(textBase) : [];
    const combinedRaw = rawChannelsBase.slice(0, 12000);

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

    if (!line || line.startsWith("#EXTVLCOPT:") || line.startsWith("#EXTGRP:")) {
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const commaIndex = line.lastIndexOf(",");
      let rawName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : "Canal sin nombre";

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
    else if (line.startsWith("http://") || line.startsWith("https://")) {
      currentChannel.url = line;
      
      if (!currentChannel.name || currentChannel.name.includes("like Gecko")) {
        currentChannel.name = "Canal en Vivo";
      }

      parsedChannels.push({ ...currentChannel });
      currentChannel = {};
    }
  }

  return parsedChannels;
}

function playHlsStream(url, name) {
  if (hls) hls.destroy();
  currentRawUrl = url;
  if (channelTitle) channelTitle.innerText = name;

  let finalUrl = url;

  if (
    url.includes("jmp2.uk") || 
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
        <img src="${escapeHTML(c.logo || 'https://via.placeholder.com/150')}" alt="${escapeHTML(c.name)}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150'">
      </div>
      <div class="card-body">
        <h4 class="card-title">${escapeHTML(c.name)}</h4>
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
        <img src="${escapeHTML(c.logo || 'https://via.placeholder.com/150')}" alt="${escapeHTML(c.name)}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150'">
        <div style="overflow: hidden;">
          <div style="font-size: 0.8rem; font-weight: bold; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${escapeHTML(c.name)}</div>
          <span style="font-size: 0.65rem; color: #34d399;">● En vivo</span>
        </div>
      `;
      sidebarGrid.appendChild(item);
    });
  }

  setTimeout(renombrarCanales, 200);
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

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
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

// ==========================================
// ANUNCIO DINÁMICO (MARQUESINA)
// ==========================================
async function loadDynamicMarquee() {
  const track = document.getElementById("dynamic-announcement-track");
  if (!track) return;

  let message = localStorage.getItem("donatelos_marquee_text") || "BIENVENIDOS A DONATELOS TV - DISFRUTA DE TU SEÑAL EN VIVO";

  if (typeof db !== 'undefined' && db) {
    try {
      const { data, error } = await db.from('site_config').select('marquee_text').eq('id', 'main_config').single();
      if (!error && data && data.marquee_text) {
        message = data.marquee_text;
        localStorage.setItem("donatelos_marquee_text", message);
      }
    } catch (e) {
      console.error("Error al sincronizar el anuncio con Supabase:", e);
    }
  }

  track.innerHTML = `
    <span>${escapeHTML(message)}</span>
    <span>${escapeHTML(message)}</span>
    <span>${escapeHTML(message)}</span>
  `;
}

function renombrarCanales() {
  const elementos = document.querySelectorAll('.channel-name, .nombre-canal, .card-title'); 

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

// ==========================================
// PANEL DE ADMINISTRACIÓN
// ==========================================
let currentAdminPage = 1;
const CHANNELS_PER_PAGE = 50;
let filteredAdminChannels = [];

function renderAdminPanel() {
  const sourceList = window.channels && window.channels.length > 0 ? window.channels : channels;
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
    const globalIndex = start + index;
    const row = document.createElement("div");
    row.className = "admin-channel-row";
    row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid #1e293b; color:white; background:#0f172a; margin-bottom:4px; border-radius:6px;";

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

function adminDeleteChannel(globalIndex) {
  const channel = filteredAdminChannels[globalIndex];
  if (!channel) return;

  if (confirm(`¿Estás seguro de eliminar el canal "${channel.name}"?`)) {
    let customChannels = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]");
    customChannels = customChannels.filter(c => c.name !== channel.name && c.url !== channel.url);
    
    localStorage.setItem("donatelos_custom_channels", JSON.stringify(customChannels));
    
    channels = channels.filter(c => c.name !== channel.name);
    window.channels = channels;
    
    renderChannels(channels);
    renderAdminPanel();
  }
}

function adminOpenEdit(globalIndex) {
  const channel = filteredAdminChannels[globalIndex];
  if (!channel) return;

  const newName = prompt("Nuevo nombre del canal:", channel.name);
  if (newName !== null && newName.trim() !== "") {
    const editedChannels = JSON.parse(localStorage.getItem("donatelos_edited_channels") || "{}");
    editedChannels[channel.name] = { ...channel, name: newName.trim() };
    
    localStorage.setItem("donatelos_edited_channels", JSON.stringify(editedChannels));
    location.reload();
  }
}

// Desplazamiento automático para TV / Control Remoto
document.addEventListener('focus', function(event) {
  if (event.target && event.target.classList.contains('channel-item')) {
    event.target.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }
}, true);

// ==========================================
// CONTROL DE VISIBILIDAD DE CONTROLES (PC y TV)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const playerWrapper = document.getElementById("player-wrapper");
  const videoElement = document.getElementById("video");
  if (!playerWrapper || !videoElement) return;

  let idleTimer = null;

  function showPlayerControls(e) {
    // Evitamos conflictos si se interactúa directamente con los botones personalizados externos
    if (e && e.target.tagName === 'BUTTON') return;

    playerWrapper.classList.add("show-controls");
    playerWrapper.classList.remove("fullscreen-hide-controls");
    
    // Forzar al navegador a mantener los controles nativos activos
    videoElement.setAttribute("controls", "controls");

    clearTimeout(idleTimer);

    // Ocultar automáticamente tras 3 segundos de inactividad
    idleTimer = setTimeout(() => {
      playerWrapper.classList.remove("show-controls");
      playerWrapper.classList.add("fullscreen-hide-controls");
    }, 3000);
  }

  // Detectar movimientos del mouse, toques en pantalla táctil o pulsaciones de control remoto
  playerWrapper.addEventListener("mousemove", showPlayerControls);
  playerWrapper.addEventListener("touchstart", showPlayerControls);
  playerWrapper.addEventListener("pointerdown", showPlayerControls);
  playerWrapper.addEventListener("click", showPlayerControls);
  playerWrapper.addEventListener("keydown", showPlayerControls);
});