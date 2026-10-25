import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function renderizarAgendaDeportes() {
  const sportsContainer = document.getElementById('sports-container');
  const mainGrid = document.getElementById('channels-grid');
  
  if (mainGrid) mainGrid.style.display = 'none';
  if (sportsContainer) sportsContainer.style.display = 'block';

  if (!sportsContainer) return;

  const existingView = document.getElementById('donatelo-cartelera-view');
  if (existingView) {
    existingView.remove();
  }

  const carteleraView = document.createElement('div');
  carteleraView.id = 'donatelo-cartelera-view';
  carteleraView.style.cssText = 'padding: 0 var(--pad, 24px); width: 100%;';

  carteleraView.innerHTML = `
    <div style="margin: 10px 0 30px 0; color: var(--text); font-family: inherit;">
      
      <!-- Aviso importante sobre TV y navegador -->
      <div style="background: rgba(217, 45, 18, 0.12); border: 1px solid var(--live); color: var(--text); padding: 14px 18px; border-radius: 12px; margin-bottom: 24px; font-size: 13px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
        <span style="font-size: 20px;">⚠️</span>
        <div>
          <strong style="color: var(--accent); display: block; margin-bottom: 2px;">Aviso importante</strong>
          En TV aún no se pueden reproducir. Solo se puede reproducir en la versión web, en teléfono descargando el navegador BRAVE pueden intentar.
        </div>
      </div>

      <!-- Contenedor del Reproductor con zoom automático (125%) -->
      <div id="donatelo-player-container" style="margin-bottom: 30px; display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-volver-cartelera" class="btn" style="padding: 6px 14px; font-size: 13px; cursor: pointer;">← Volver</button>
            <h2 id="current-match-title" style="margin: 0; font-size: 1.2rem; font-weight: 800;">Reproductor en Vivo</h2>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="chip">EN VIVO</span>
            <button onclick="navigator.clipboard.writeText(window.location.href); alert('¡Enlace copiado al portapapeles!');" class="btn" style="padding: 6px 14px; font-size: 13px;">Compartir</button>
          </div>
        </div>

        <div style="position: relative; width: 100%; max-width: 900px; margin: 0 auto; padding-bottom: 38%; background: #000; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          <iframe id="donatelo-player" src="" scrolling="no" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; transform: scale(1.25); transform-origin: center; overflow: hidden;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>
        </div>
      </div>
<h3 id="agenda-titulo" style="color: var(--text); margin-bottom: 15px; font-size: 1.3rem; font-weight: 800;">Agenda de Partidos</h3>
      
      <!-- Buscador de partidos -->
      <div style="margin-bottom: 25px; width: 100%; max-width: 100%;">
        <div style="position: relative; display: flex; align-items: center; background: var(--surface-2, #18181b); border: 1px solid var(--border, #27272a); border-radius: 12px; padding: 10px 16px;">
          <span style="font-size: 14px; margin-right: 10px; opacity: 0.6;">🔍</span>
          <input 
            type="text" 
            id="sportsSearchInput" 
            placeholder="Buscar equipo, liga o canal (ej. Barcelona, Premier, ESPN)..." 
            oninput="filtrarPartidosDeporte()"
            style="width: 100%; background: transparent; border: none; outline: none; color: var(--text, #ffffff); font-size: 14px; font-family: inherit;"
          >
          <button id="clearSearchBtn" onclick="limpiarBuscadorDeportes()" style="background: transparent; border: none; color: var(--muted, #a1a1aa); font-size: 14px; cursor: pointer; display: none; padding: 0 4px;">✕</button>
        </div>
      </div>

      <div id="partidos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;"></div>
  `;

  const { data: partidos, error } = await db.from('partidos_cartelera').select('*').range(0, 999);
  const partidosGrid = carteleraView.querySelector('#partidos-grid');
  
  if (error || !partidos || partidos.length === 0) {
    partidosGrid.innerHTML = '<p style="color: var(--muted); padding: 10px;">No hay partidos disponibles en este momento.</p>';
  } else {
    const playerContainer = carteleraView.querySelector('#donatelo-player-container');
    const player = carteleraView.querySelector('#donatelo-player');
    const titleElem = carteleraView.querySelector('#current-match-title');
    const btnVolver = carteleraView.querySelector('#btn-volver-cartelera');
    const agendaTitulo = carteleraView.querySelector('#agenda-titulo');

    if (btnVolver) {
      btnVolver.onclick = () => {
        player.src = ''; 
        playerContainer.style.display = 'none'; 
        
        if (window._iframeTimer) {
          clearInterval(window._iframeTimer);
          window._iframeTimer = null;
        }
        
        const url = new URL(window.location);
        url.searchParams.delete('partido');
        window.history.pushState({}, '', url);

        if (agendaTitulo) {
          agendaTitulo.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }

    const partidosAgrupados = {};
    partidos.forEach(p => {
      const key = `${p.home_team} vs ${p.away_team}`;
      if (!partidosAgrupados[key]) {
        partidosAgrupados[key] = {
          home_team: p.home_team,
          away_team: p.away_team,
          home_logo: p.home_logo,
          away_logo: p.away_logo,
          channels: []
        };
      }
      partidosAgrupados[key].channels.push({
        channel_name: p.channel_name,
        stream_url: p.stream_url
      });
    });

    partidosGrid.innerHTML = '';
    
    Object.values(partidosAgrupados).forEach(match => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 18px;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      `;

      let canalesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; max-height: 180px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: var(--border) transparent;">';
      match.channels.forEach((ch) => {
        canalesHtml += `
          <button class="channel-btn" data-url="${ch.stream_url}" data-name="${match.home_team} vs ${match.away_team} (${ch.channel_name})" style="
            background: var(--surface-2);
            color: var(--text);
            border: 1px solid var(--border);
            padding: 8px 14px;
            font-size: 12px;
            font-weight: 700;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            letter-spacing: 0.01em;
          ">${ch.channel_name}</button>
        `;
      });
      canalesHtml += '</div>';
card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span class="chip" style="font-size: 10px; padding: 2px 8px;">EN VIVO</span>
            <span style="font-size: 12px; color: var(--muted); font-weight: 600;">${match.channels.length} ${match.channels.length === 1 ? 'canal' : 'canales'}</span>
          </div>
          <div style="font-weight: 800; font-size: 15px; color: var(--text); margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; letter-spacing: -0.01em;">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${match.home_logo ? `<img src="${match.home_logo}" style="width: 22px; height: 22px; object-fit: contain;">` : ''}
              <span>${match.home_team}</span>
            </div>
            <span style="color: var(--muted); font-size: 13px;">vs</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${match.away_logo ? `<img src="${match.away_logo}" style="width: 22px; height: 22px; object-fit: contain;">` : ''}
              <span>${match.away_team}</span>
            </div>
          </div>
        </div>
        <div>
          ${canalesHtml}
        </div>
      `;
      card.querySelectorAll('.channel-btn').forEach(btn => {
        btn.onmouseover = () => { 
          btn.style.background = 'var(--accent)'; 
          btn.style.borderColor = 'var(--accent)'; 
          btn.style.color = 'var(--bg)';
          btn.style.transform = 'translateY(-2px)';
          btn.style.boxShadow = '0 4px 12px rgba(255, 107, 77, 0.3)';
        };
        btn.onmouseout = () => { 
          btn.style.background = 'var(--surface-2)'; 
          btn.style.borderColor = 'var(--border)'; 
          btn.style.color = 'var(--text)';
          btn.style.transform = 'translateY(0)';
          btn.style.boxShadow = 'none';
        };
        
        btn.onclick = () => {
          playerContainer.style.display = 'block';
          const matchUrl = btn.getAttribute('data-url');
          const matchName = btn.getAttribute('data-name');
          player.src = matchUrl;
          titleElem.textContent = matchName;
          
          const url = new URL(window.location);
          url.searchParams.set('partido', slugify(matchName));
          window.history.pushState({ matchName }, '', url);

          if (window._iframeTimer) {
            clearInterval(window._iframeTimer);
            window._iframeTimer = null;
          }

          window._iframeTimer = setInterval(() => {
            if (playerContainer.style.display !== 'none' && player.src) {
              let puntos = parseInt(localStorage.getItem('donatelo_points') || '0', 10);
              let hoyPuntos = parseInt(localStorage.getItem('donatelo_today_points') || '0', 10);
              
              if (hoyPuntos < 180) {
                puntos += 1;
                hoyPuntos += 1;
                localStorage.setItem('donatelo_points', puntos);
                localStorage.setItem('donatelo_today_points', hoyPuntos);
                
                document.querySelectorAll('.puntos-val, #user-points, [data-points]').forEach(el => {
                  el.textContent = puntos;
                });

                window.dispatchEvent(new CustomEvent('donatelo:point-added', { detail: { puntos, hoyPuntos } }));
              }
            }
          }, 60000);

          playerContainer.scrollIntoView({ behavior: 'smooth' });
        };
      });

      partidosGrid.appendChild(card);
    });
  }

  sportsContainer.innerHTML = '';
  sportsContainer.appendChild(carteleraView);
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('button, a');
  if (target) {
    const text = target.innerText ? target.innerText.toLowerCase() : '';
    const view = target.getAttribute('data-view');
    const sportsContainer = document.getElementById('sports-container');
    const mainGrid = document.getElementById('channels-grid');

    if (text.includes('deportes') || view === 'sports') {
      e.stopImmediatePropagation();
      if (mainGrid) mainGrid.style.display = 'none';
      if (sportsContainer) sportsContainer.style.display = 'block';
      renderizarAgendaDeportes();
    } else if (view && view !== 'sports') {
      if (sportsContainer) sportsContainer.style.display = 'none';
      if (mainGrid) mainGrid.style.display = 'block';
      
      if (window._iframeTimer) {
        clearInterval(window._iframeTimer);
        window._iframeTimer = null;
      }
    }
  }
}, true);

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const params = new URLSearchParams(location.search);
    const partidoSlug = params.get('partido');
    if (!partidoSlug) return;
    
    const sportsContainer = document.getElementById('sports-container');
    const mainGrid = document.getElementById('channels-grid');
    if (mainGrid) mainGrid.style.display = 'none';
    if (sportsContainer) sportsContainer.style.display = 'block';
    
    renderizarAgendaDeportes();
    
    const checkInterval = setInterval(() => {
      const buttons = document.querySelectorAll('.channel-btn');
      for (const btn of buttons) {
        const name = btn.getAttribute('data-name');
        if (name && slugify(name) === partidoSlug) {
          btn.click();
          clearInterval(checkInterval);
          break;
        }
      }
    }, 500);
  }, 1200);
});
window.filtrarPartidosDeporte = function() {
  const input = document.getElementById('sportsSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (!input) return;
  
  const query = input.value.toLowerCase().trim();
  if (clearBtn) {
    clearBtn.style.display = query.length > 0 ? 'block' : 'none';
  }

  const tarjetas = document.querySelectorAll('#partidos-grid > div');
  tarjetas.forEach(card => {
    const textoTarjeta = card.innerText.toLowerCase();
    card.style.display = textoTarjeta.includes(query) ? '' : 'none';
  });
};

window.limpiarBuscadorDeportes = function() {
  const input = document.getElementById('sportsSearchInput');
  if (input) {
    input.value = '';
    window.filtrarPartidosDeporte();
    input.focus();
  }
};