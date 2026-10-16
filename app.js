const PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u";
const grid = document.getElementById("channels-grid");
const searchInput = document.getElementById("search");
const video = document.getElementById("video");
let channels = [];

async function loadChannels() {
  try {
    const response = await fetch(PLAYLIST_URL);
    const text = await response.text();
    channels = parseM3U(text);
    
    // Muestra los primeros 100 canales de la lista global sin filtrar
    renderChannels(channels.slice(0, 100));
  } catch (error) {
    grid.innerHTML = "<p>Error al cargar la lista de IPTV-Org.</p>";
  }
}

function parseM3U(m3uText) {
  const lines = m3uText.split("\n");
  const result = [];
  let currentChannel = {};

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      currentChannel.name = nameMatch ? nameMatch[1] : "Canal Desconocido";
      currentChannel.logo = logoMatch ? logoMatch[1] : "https://via.placeholder.com/80?text=TV";
    } else if (line.startsWith("http://") || line.startsWith("https://")) {
      currentChannel.url = line;
      if (currentChannel.name) {
        result.push(currentChannel);
      }
      currentChannel = {};
    }
  }
  return result;
}

function renderChannels(list) {
  grid.innerHTML = "";
  if (list.length === 0) {
    grid.innerHTML = "<p>No se encontraron canales.</p>";
    return;
  }
  list.forEach(channel => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${channel.logo}" onerror="this.src='https://via.placeholder.com/80?text=TV'">
      <p>${channel.name}</p>
    `;
    card.onclick = () => playStream(channel.url);
    grid.appendChild(card);
  });
}

function playStream(url) {
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
  }
}

// Búsqueda en la lista completa de todos los canales
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = channels.filter(c => c.name.toLowerCase().includes(query));
  renderChannels(filtered.slice(0, 100)); // Muestra hasta 100 resultados de la búsqueda
});

loadChannels();
