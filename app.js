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
// Canales personalizados publicados en la nube (se ven en TODOS los dispositivos)
let globalCustomChannels = [];
try { globalCustomChannels = JSON.parse(localStorage.getItem("donatelos_global_custom") || "[]"); } catch (e) {}

async function loadGlobalCustomChannels() {
  if (!db) return;
  try {
    const { data, error } = await db.from('site_config').select('custom_channels').eq('id', 'main_config').single();
    if (error || !data || !Array.isArray(data.custom_channels)) return; // columna aún no creada o vacía
    const clean = data.custom_channels
      .filter(c => c && c.name && c.url)
      .map(c => ({ name: String(c.name), url: String(c.url), logo: c.logo ? String(c.logo) : "" }));
    const before = JSON.stringify(globalCustomChannels), after = JSON.stringify(clean);
    globalCustomChannels = clean;
    try { localStorage.setItem("donatelos_global_custom", after); } catch (e) {}
    if (before !== after && catalog.length && !playerOpen()) renderChannels(getFinalChannelsList(channels));
  } catch (e) { console.log("Sin canales personalizados en la nube"); }
}

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
  await loadGlobalCustomChannels();
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

document.addEventListener("DOMContentLoaded", () => {
  // Config de Supabase y canales arrancan a la vez (antes uno esperaba al otro)
  configReadyPromise = db ? Promise.resolve(loadGlobalConfig()).catch(() => {}) : Promise.resolve();

  const searchInput = document.getElementById("search");
  if (searchInput) {
    searchInput.addEventListener("input", applyCurrentFilters);
  }

  const shareBtn = document.getElementById('btn-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', shareCurrentChannel);
  }

  loadDynamicMarquee();
  bootChannels();
  setTimeout(startPresence, 1500); // después de pintar, para no frenar la carga
});

const LIST_URL = "https://iptv-org.github.io/iptv/index.m3u";
const CACHE_KEY = "donatelos_cache_v1";
const CACHE_FRESH_MS = 3 * 60 * 60 * 1000; // 3 horas
const MAX_CHANNELS = 500; // cantidad máxima de canales que se muestran

// Elige hasta MAX_CHANNELS canales: con logo, sin nombres repetidos, y dejando espacio
// para que las filas de Deportes y Películas no queden vacías (hasta 1/5 cada una).
function pickChannels(list, max = MAX_CHANNELS) {
  const seen = new Set(), sports = [], movies = [], others = [];
  for (const c of list) {
    if (!c || !c.name || !c.url || !c.logo || c.logo.includes("placeholder")) continue;
    const k = c.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const item = { name: c.name, url: c.url, logo: c.logo };
    if (SPORT_RE.test(c.name)) sports.push(item);
    else if (MOVIE_RE.test(c.name)) movies.push(item);
    else others.push(item);
  }
  const quota = Math.floor(max / 5);
  const chosen = [...sports.slice(0, quota), ...movies.slice(0, quota)];
  let rest = [...others, ...sports.slice(quota), ...movies.slice(quota)];
  return [...chosen, ...rest.slice(0, Math.max(0, max - chosen.length))];
}
let configReadyPromise = Promise.resolve();

function fetchTextWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).then(async res => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (!text || text.startsWith("Oops") || text.startsWith("<")) throw new Error("Respuesta inválida");
    return text;
  }).finally(() => clearTimeout(t));
}
function firstSuccess(promises) {
  return new Promise((resolve, reject) => {
    let pending = promises.length, done = false;
    promises.forEach(p => p.then(
      v => { if (!done) { done = true; resolve(v); } },
      () => { if (--pending === 0 && !done) reject(new Error("Todos fallaron")); }
    ));
  });
}

async function fetchWithFallbackProxy(targetUrl) {
  // 1) Directo (la lista de iptv-org permite CORS): es el camino más rápido
  try { return await fetchTextWithTimeout(targetUrl, 12000); }
  catch (e) { console.warn("Descarga directa falló, probando proxies en paralelo..."); }

  // 2) Proxies en paralelo: gana el primero que responda (antes iban uno tras otro, sin límite de tiempo)
  const proxies = [
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?${encodeURIComponent(u)}`
  ];
  try { return await firstSuccess(proxies.map(p => fetchTextWithTimeout(p(targetUrl), 15000))); }
  catch (e) { /* cae al error de abajo */ }

  throw new Error("No se pudo obtener la lista.");
}

// Guarda una copia liviana (solo lo necesario) para abrir al instante la próxima vez
function saveChannelCache(list) {
  const compact = pickChannels(list);
  try {
    localStorage.removeItem("donatelos_base_channels"); // copia pesada de versiones anteriores
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), list: compact }));
  } catch (e) { console.warn("No se pudo guardar la copia local", e); }
}

function showLoadMessage(msg) {
  if (grid) grid.innerHTML = `<p class="loading-text">${escapeHTML(msg)} <button class="btn" type="button" onclick="loadChannels(LIST_URL)">Reintentar</button></p>`;
}

async function loadChannels(url, opts = {}) {
  const silent = !!opts.silent; // silent = refresca la copia local sin tocar la pantalla
  try {
    const textBase = await fetchWithFallbackProxy(url).catch(err => {
      console.warn("Fallo al cargar la lista base:", err);
      return "";
    });
    const rawChannelsBase = textBase ? parseM3U(textBase) : [];
    const activeChannels = pickChannels(rawChannelsBase.slice(0, 12000).filter(c => !offlineUrls.has(c.url)));

    if (activeChannels.length > 0) saveChannelCache(activeChannels);
    if (silent) return;

    channels = [];
    loadSavedCustomChannels();
    channels = [...channels, ...activeChannels];
    window.channels = channels;

    await configReadyPromise; // para respetar los canales ocultos de Supabase
    const finalChannelsToRender = getFinalChannelsList(channels);
    if (!finalChannelsToRender || finalChannelsToRender.length === 0) {
      showLoadMessage("No se pudieron cargar los canales.");
      return;
    }
    renderChannels(finalChannelsToRender);
  } catch (error) {
    console.error("Error crítico en loadChannels:", error);
    if (!silent) showLoadMessage("Error al cargar las transmisiones.");
  }
}

// Arranque rápido: si hay copia local, se muestra al instante y se actualiza en segundo plano
async function bootChannels() {
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
  if (cache && Array.isArray(cache.list) && cache.list.length) {
    channels = pickChannels(cache.list);
    window.channels = channels;
    renderChannels(getFinalChannelsList(channels));
    configReadyPromise.then(() => {
      if (!playerOpen() && catalog.some(c => globalHiddenChannels.includes(c.name))) renderChannels(getFinalChannelsList(channels));
    });
    if (Date.now() - cache.ts > CACHE_FRESH_MS) loadChannels(LIST_URL, { silent: true });
    return;
  }
  await loadChannels(LIST_URL);
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

  return [...customChannels, ...globalCustomChannels, ...filteredBase];
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

// ==========================================
// INICIO TIPO CATÁLOGO (banner + filas + reproductor)
// ==========================================
let catalog = [];
const byUrl = new Map();
let currentView = "home";
let heroList = [], heroIdx = 0, currentChannel = null;
const RECENT_KEY = "donatelos_recent", LIST_KEY = "donatelos_mylist";
const SPORT_RE = /deport|sport|espn|f[uú]tbol|football|soccer|nba|nfl|tyc|dazn|liga|motor|tenis|tennis/i;
const MOVIE_RE = /cine|movie|film|pel[ií]cula|cinema|series|drama/i;
const ICO_PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICO_PLUS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICO_CHECK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function hueOf(n) { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
function lookup(url) {
  return byUrl.get(url) || lsGet(RECENT_KEY).find(c => c.url === url) || lsGet(LIST_KEY).find(c => c.url === url) || null;
}
function playerOpen() { const p = document.getElementById("player-view"); return !!(p && p.classList.contains("open")); }

function logoHTML(c) {
  if (c.logo) return `<img src="${escapeHTML(c.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  return `<b style="color:#0E0F14;font-size:1.4em">${escapeHTML((c.name || "?").trim().charAt(0).toUpperCase())}</b>`;
}
function cardHTML(c) {
  return `<button class="card" style="--h:${hueOf(c.name)}" data-url="${escapeHTML(c.url)}" aria-label="${escapeHTML(c.name)}">
    <span class="live">EN VIVO</span>
    <span class="tile">${logoHTML(c)}</span>
    <span class="nm">${escapeHTML(c.name)}</span></button>`;
}
function rowHTML(title, list) {
  if (!list.length) return "";
  return `<section class="sec"><h2>${escapeHTML(title)}</h2><div class="row">${list.map(cardHTML).join("")}</div></section>`;
}
function pageHTML(title, list, emptyMsg) {
  const body = list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>` : `<p class="loading-text" style="padding-left:0">${escapeHTML(emptyMsg)}</p>`;
  return `<section class="sec first"><h2>${escapeHTML(title)}</h2>${body}</section>`;
}
function heroHTML() {
  const c = heroList[heroIdx % (heroList.length || 1)];
  if (!c) return "";
  const on = heroIdx % heroList.length;
  const inList = lsGet(LIST_KEY).some(x => x.url === c.url);
  return `<section class="hero" id="hero" style="--h:${hueOf(c.name)}">
    <div class="hero-tile">${logoHTML(c)}</div>
    <div class="hero-copy">
      <span class="eyebrow">EN VIVO AHORA</span>
      <h1>${escapeHTML(c.name)}</h1>
      <p>Señal en vivo en Donatelos TV</p>
      <div class="hero-actions">
        <button class="cta" data-url="${escapeHTML(c.url)}">${ICO_PLAY} Ver ahora</button>
        <button class="circ" data-add="${escapeHTML(c.url)}" aria-label="${inList ? "Quitar de mi lista" : "Agregar a mi lista"}">${inList ? ICO_CHECK : ICO_PLUS}</button>
      </div>
    </div>
    <div class="dots">${heroList.map((_, i) => `<button class="dot${i === on ? " on" : ""}" data-dot="${i}" aria-label="Destacado ${i + 1}"></button>`).join("")}</div>
  </section>`;
}

function renderChannels(channelList) {
  const seenU = new Set(), seenN = new Set();
  catalog = [];
  byUrl.clear();
  for (const c of getFinalChannelsList(channelList || [])) {
    if (!c || !c.url || seenU.has(c.url)) continue;
    const k = (c.name || "").toLowerCase();
    if (seenN.has(k)) continue;
    seenU.add(c.url); seenN.add(k);
    catalog.push(c); byUrl.set(c.url, c);
  }
  renderView();
  if (!urlHandled && catalog.length) openFromUrl();
}

function renderView() {
  if (!grid) return;
  if (!catalog.length) { grid.innerHTML = "<p class='loading-text'>No se encontraron canales disponibles.</p>"; return; }
  const sports = catalog.filter(c => SPORT_RE.test(c.name));
  const movies = catalog.filter(c => MOVIE_RE.test(c.name));
  let html = "";
  if (currentView === "home") {
    const seen = new Set();
    heroList = [...sports.slice(0, 3), ...catalog.slice(0, 3)].filter(c => !seen.has(c.url) && seen.add(c.url)).slice(0, 5);
    html = heroHTML()
      + rowHTML("Continuar viendo", lsGet(RECENT_KEY))
      + rowHTML("Mi lista", lsGet(LIST_KEY))
      + rowHTML("En vivo ahora", catalog.slice(0, 30))
      + rowHTML("Deportes", sports.slice(0, 30))
      + rowHTML("Películas y series", movies.slice(0, 30));
  } else if (currentView === "live") {
    html = pageHTML("En vivo", catalog.slice(0, 500), "No hay canales.");
  } else if (currentView === "sports") {
    html = pageHTML("Deportes", sports.slice(0, 500), "No se encontraron canales de deportes.");
  } else if (currentView === "movies") {
    html = pageHTML("Películas y series", movies.slice(0, 500), "No se encontraron canales de películas.");
  } else if (currentView === "mylist") {
    html = pageHTML("Mi lista", lsGet(LIST_KEY), "Aún no agregaste canales. Toca + en un canal para guardarlo.");
  } else if (currentView === "search") {
    const q = ((document.getElementById("search") || {}).value || "").trim().toLowerCase();
    const res = q ? catalog.filter(c => c.name.toLowerCase().includes(q)).slice(0, 500) : catalog.slice(0, 60);
    html = pageHTML(q ? `Resultados (${res.length})` : "Todos los canales", res, "No encontramos canales con ese nombre.");
  }
  grid.innerHTML = html;
  if (isTV() && !playerOpen() && (!document.activeElement || document.activeElement === document.body)) {
    const f = grid.querySelector(".cta, .card"); if (f) f.focus();
  }
}
function isTV() { return document.documentElement.classList.contains("tv"); }

function setView(v) {
  currentView = v;
  document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  const sb = document.getElementById("search-bar");
  if (sb) sb.classList.toggle("show", v === "search");
  renderView();
  window.scrollTo(0, 0);
  if (v === "search") { const i = document.getElementById("search"); if (i) i.focus(); }
}

// El buscador (app.js ya lo escucha en "input")
function applyCurrentFilters() { if (currentView !== "search") setView("search"); else renderView(); }
function filterByKeyword(k) { const i = document.getElementById("search"); if (i) i.value = k; setView("search"); }

function toggleList(c) {
  if (!c) return;
  let list = lsGet(LIST_KEY);
  if (list.some(x => x.url === c.url)) list = list.filter(x => x.url !== c.url);
  else list.unshift({ name: c.name, url: c.url, logo: c.logo });
  lsSet(LIST_KEY, list);
  updatePvAdd();
  if (!playerOpen() && (currentView === "home" || currentView === "mylist")) renderView();
}
function updatePvAdd() {
  const b = document.getElementById("pv-add");
  if (!b || !currentChannel) return;
  b.textContent = lsGet(LIST_KEY).some(x => x.url === currentChannel.url) ? "✓ En mi lista" : "+ Mi lista";
}

function openPlayer(c) {
  currentChannel = c;
  const r = lsGet(RECENT_KEY).filter(x => x.url !== c.url);
  r.unshift({ name: c.name, url: c.url, logo: c.logo });
  lsSet(RECENT_KEY, r.slice(0, 12));
  document.getElementById("player-view").classList.add("open");
  document.body.classList.add("no-scroll");
  document.getElementById("player-more").innerHTML = catalog.filter(x => x.url !== c.url).slice(0, 30).map(cardHTML).join("");
  updatePvAdd();
  const b = document.getElementById("pv-close"); if (b) b.focus();
  wakePlayerUI();
  try { history.replaceState(null, "", channelLink(c)); } catch (e) {}
  trackPresence(); updateOnlineUI();
  playHlsStream(c.url, c.name);
}
let idleTimer = null;
function wakePlayerUI() {
  const pv = document.getElementById("player-view");
  pv.classList.remove("idle");
  clearTimeout(idleTimer);
  if (isTV()) idleTimer = setTimeout(() => pv.classList.add("idle"), 4000);
}
function stepChannel(delta) {
  if (!currentChannel || !catalog.length) return;
  let i = catalog.findIndex(c => c.url === currentChannel.url);
  i = (i + delta + catalog.length) % catalog.length;
  openPlayer(catalog[i]);
}
function togglePlayPause() { if (video.paused) video.play().catch(() => {}); else video.pause(); }
function closePlayer() {
  clearTimeout(idleTimer);
  document.getElementById("player-view").classList.remove("idle");
  if (hls) { hls.destroy(); hls = null; }
  try { video.pause(); video.removeAttribute("src"); video.load(); } catch (e) {}
  document.getElementById("player-view").classList.remove("open");
  document.body.classList.remove("no-scroll");
  try { history.replaceState(null, "", baseUrl()); } catch (e) {}
  trackPresence(); updateOnlineUI();
  renderView();
}

document.addEventListener("click", e => {
  const v = e.target.closest("[data-view]");
  if (v) { setView(v.dataset.view); return; }
  if (e.target.closest("#pv-close")) { closePlayer(); return; }
  if (e.target.closest("#pv-add")) { toggleList(currentChannel); return; }
  const d = e.target.closest("[data-dot]");
  if (d) { heroIdx = +d.dataset.dot; const h = document.getElementById("hero"); if (h) h.outerHTML = heroHTML(); return; }
  const a = e.target.closest("[data-add]");
  if (a) { toggleList(lookup(a.dataset.add)); return; }
  const p = e.target.closest("[data-url]");
  if (p) { const c = lookup(p.dataset.url); if (c) openPlayer(c); }
});

// Rotación automática del banner (se pausa si el foco está en él)
setInterval(() => {
  if (currentView !== "home" || playerOpen() || heroList.length < 2) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const h = document.getElementById("hero");
  if (!h || h.contains(document.activeElement)) return;
  heroIdx = (heroIdx + 1) % heroList.length;
  h.outerHTML = heroHTML();
}, 8000);

// Botón "atrás" (teclado, Samsung Tizen, LG webOS, Android TV)
document.addEventListener("keydown", e => {
  const tag = (document.activeElement || {}).tagName || "";
  const back = e.key === "Escape" || e.key === "XF86Back" || e.keyCode === 10009 || e.keyCode === 461 || (e.key === "Backspace" && !/INPUT|TEXTAREA/.test(tag));
  if (playerOpen()) {
    const k = e.key, c = e.keyCode;
    const wasIdle = document.getElementById("player-view").classList.contains("idle");
    if (k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause" || c === 415 || c === 19 || c === 179 || c === 10252) { togglePlayPause(); wakePlayerUI(); e.preventDefault(); return; }
    if (k === "ChannelUp" || k === "PageUp" || c === 427) { stepChannel(1); e.preventDefault(); return; }
    if (k === "ChannelDown" || k === "PageDown" || c === 428) { stepChannel(-1); e.preventDefault(); return; }
    if (isTV() && !back) {
      wakePlayerUI();
      if (wasIdle) { if (k === "Enter") togglePlayPause(); e.preventDefault(); return; }
    }
  }
  if (back) {
    if (playerOpen()) { closePlayer(); e.preventDefault(); }
    else if (currentView !== "home") { setView("home"); e.preventDefault(); }
    return;
  }
  spatialNav(e);
});

// Navegación con flechas del control remoto (solo en Smart TV)
function spatialNav(e) {
  if (!document.documentElement.classList.contains("tv")) return;
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!dir) return;
  const ae = document.activeElement;
  if (ae && /INPUT|TEXTAREA/.test(ae.tagName) && dir[0] !== 0) return;
  const pv = document.getElementById("player-view");
  const inPlayer = pv.classList.contains("open");
  const els = [...document.querySelectorAll("button, a[href], input")].filter(el => {
    if (el.closest("#player-view") ? !inPlayer : inPlayer) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!ae || !els.includes(ae)) { if (els[0]) { els[0].focus(); e.preventDefault(); } return; }
  const a = ae.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of els) {
    if (el === ae) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 4) continue;
    const score = along + Math.abs(dx * dir[1] + dy * dir[0]) * 2.5;
    if (score < bs) { bs = score; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest" }); e.preventDefault(); }
}

// ==========================================
// ENLACE DIRECTO A UN CANAL (?canal=nombre)
// ==========================================
function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function baseUrl() { return location.href.split(/[?#]/)[0]; }
function channelLink(c) {
  const u = new URL(baseUrl());
  if (c) u.searchParams.set("canal", slugify(c.name));
  return u.toString();
}
function findChannelByParam(q) {
  const s = slugify(q);
  if (!s) return null;
  return catalog.find(c => slugify(c.name) === s) || catalog.find(c => slugify(c.name).includes(s)) || null;
}
let urlHandled = false;
function openFromUrl() {
  urlHandled = true;
  let q = "";
  try { const p = new URLSearchParams(location.search); q = p.get("canal") || p.get("channel") || ""; } catch (e) {}
  if (!q) return;
  const c = findChannelByParam(q);
  if (c) openPlayer(c); else showToast("Ese canal ya no está disponible");
}

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return new Promise((res, rej) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove();
      ok ? res() : rej(new Error("copy"));
    } catch (e) { rej(e); }
  });
}
function shareCurrentChannel() {
  const c = currentChannel, name = c ? c.name : "";
  const url = channelLink(c);
  const data = { title: `Donatelos TV - ${name || "En Vivo"}`, text: `¡Mira ${name || "televisión en vivo"} gratis en Donatelos TV!`, url };
  if (navigator.share) { navigator.share(data).catch(() => {}); return; }
  copyText(url).then(() => showToast("Enlace copiado")).catch(() => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(data.text + " " + url)}`, "_blank");
  });
}

// ==========================================
// PERSONAS EN LÍNEA (Supabase Realtime Presence)
// Cuenta conexiones reales ahora mismo; no guarda nada en tu base de datos.
// ==========================================
let presenceChannel = null, presenceReady = false;
const presenceKey = "u" + Math.random().toString(36).slice(2, 10);
function fmtCount(n) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")).toString().replace(".", ",") + " mil";
}
function updateOnlineUI() {
  if (!presenceChannel) return;
  let st = {};
  try { st = presenceChannel.presenceState() || {}; } catch (e) {}
  const users = Object.values(st);
  const total = Math.max(1, users.length);
  const badge = document.getElementById("online-badge"), n = document.getElementById("online-count");
  if (badge && n) { n.textContent = fmtCount(total); badge.title = total + " personas en línea ahora"; badge.hidden = false; }
  const v = document.getElementById("pv-viewers");
  if (v) {
    if (playerOpen() && currentChannel) {
      const k = Math.max(1, users.filter(m => m.some(x => x.ch === currentChannel.name)).length);
      v.textContent = fmtCount(k) + " viendo"; v.hidden = false;
    } else v.hidden = true;
  }
}
function trackPresence() {
  if (!presenceChannel || !presenceReady) return;
  presenceChannel.track({ ch: playerOpen() && currentChannel ? currentChannel.name : null })
    .then(updateOnlineUI).catch(() => {});
}
function startPresence() {
  if (!db || presenceChannel) return;
  try {
    presenceChannel = db.channel("donatelos-online", { config: { presence: { key: presenceKey } } });
    presenceChannel
      .on("presence", { event: "sync" }, updateOnlineUI)
      .subscribe(status => { if (status === "SUBSCRIBED") { presenceReady = true; trackPresence(); } });
  } catch (e) { console.warn("No se pudo iniciar el contador en línea", e); }
}
document.addEventListener("visibilitychange", () => {
  if (!presenceChannel || !presenceReady) return;
  if (document.hidden) presenceChannel.untrack().catch(() => {}); else trackPresence();
});

// ==========================================
// PASAR LOS CANALES DE ESTE NAVEGADOR A LA NUBE
// Abre el sitio con ?exportar=1 en la PC donde agregaste los canales.
// ==========================================
function exportCustomChannels() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem("donatelos_custom_channels") || "[]"); } catch (e) {}
  list = list.filter(c => c && c.name && c.url).map(c => ({ name: c.name, url: c.url, logo: c.logo || "" }));
  const json = JSON.stringify(list);
  copyText(json)
    .then(() => showToast(`Copiados ${list.length} canales. Pégalos en Supabase (custom_channels).`))
    .catch(() => window.prompt(`Copia este texto (Ctrl+C) — ${list.length} canales:`, json));
  console.log(json);
  return list;
}
window.exportCustomChannels = exportCustomChannels;
document.addEventListener("DOMContentLoaded", () => {
  try { if (new URLSearchParams(location.search).get("exportar") === "1") setTimeout(exportCustomChannels, 800); } catch (e) {}
});