import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function renderizarAgendaDeportes() {
  const grid = document.getElementById('channels-grid');
  if (!grid) return;

  if (document.getElementById('donatelo-cartelera-view')) return;

  const carteleraView = document.createElement('div');
  carteleraView.id = 'donatelo-cartelera-view';
  carteleraView.style.cssText = 'padding: 0 var(--pad, 24px); width: 100%; grid-column: 1 / -1;';

  carteleraView.innerHTML = `
    <div style="margin: 10px 0 30px 0; color: #fff; font-family: inherit;">
      <div id="donatelo-player-container" style="margin-bottom: 30px; display: none;">
        <h3 id="current-match-title" style="color: #fff; margin-bottom: 12px; font-size: 1.2rem; font-weight: 600;">Reproductor en Vivo</h3>
        <div style="position: relative; width: 100%; padding-bottom: 56.25%; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
          <iframe id="donatelo-player" src="" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" allowfullscreen referrerpolicy="no-referrer"></iframe>
        </div>
      </div>

      <h3 style="color: #fff; margin-bottom: 20px; font-size: 1.3rem; font-weight: 600;">Agenda de Partidos en Vivo</h3>
      <div id="partidos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;"></div>
    </div>
  `;

  // Obtener los partidos desde Supabase
  const { data: partidos, error } = await db.from('partidos_cartelera').select('*');
  const partidosGrid = carteleraView.querySelector('#partidos-grid');
  
  if (error || !partidos || partidos.length === 0) {
    partidosGrid.innerHTML = '<p style="color: #a1a1aa; padding: 10px;">No hay partidos disponibles en este momento.</p>';
  } else {
    const playerContainer = carteleraView.querySelector('#donatelo-player-container');
    const player = carteleraView.querySelector('#donatelo-player');
    const titleElem = carteleraView.querySelector('#current-match-title');

    // Agrupar canales por partido (home_team vs away_team)
    const partidosAgrupados = {};
    partidos.forEach(p => {
      const key = `${p.home_team} vs ${p.away_team}`;
      if (!partidosAgrupados[key]) {
        partidosAgrupados[key] = {
          home_team: p.home_team,
          away_team: p.away_team,
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
        background: linear-gradient(135deg, #1e1e24 0%, #121215 100%);
        border: 1px solid #27272a;
        border-radius: 14px;
        padding: 16px;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.25s ease;
      `;

      // Generar botones para cada canal disponible en este partido
      let canalesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">';
      match.channels.forEach((ch, idx) => {
        canalesHtml += `
          <button class="channel-btn" data-url="${ch.stream_url}" data-name="${match.home_team} vs ${match.away_team} (${ch.channel_name})" style="
            background: #27272a;
            color: #f4f4f5;
            border: 1px solid #3f3f46;
            padding: 5px 10px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
          ">${ch.channel_name}</button>
        `;
      });
      canalesHtml += '</div>';

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="background-color: #e53935; color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">EN VIVO</span>
            <span style="font-size: 11px; color: #a1a1aa;">${match.channels.length} ${match.channels.length === 1 ? 'canal' : 'canales'}</span>
          </div>
          <div style="font-weight: 600; font-size: 14px; color: #f4f4f5; margin-top: 6px;" title="${match.home_team} vs ${match.away_team}">
            ${match.home_team} vs ${match.away_team}
          </div>
        </div>
        <div>
          ${canalesHtml}
        </div>
      `;

      // Asociar eventos a los botones de canales de esta tarjeta
      card.querySelectorAll('.channel-btn').forEach(btn => {
        btn.onmouseover = () => { btn.style.background = '#ff4757'; btn.style.borderColor = '#ff4757'; };
        btn.onmouseout = () => { btn.style.background = '#27272a'; btn.style.borderColor = '#3f3f46'; };
        
        btn.onclick = () => {
          playerContainer.style.display = 'block';
          player.src = btn.getAttribute('data-url');
          titleElem.textContent = btn.getAttribute('data-name');
          playerContainer.scrollIntoView({ behavior: 'smooth' });
        };
      });

      partidosGrid.appendChild(card);
    });
  }

  grid.innerHTML = '';
  grid.appendChild(carteleraView);
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('button, a');
  if (target) {
    const text = target.innerText ? target.innerText.toLowerCase() : '';
    if (text.includes('deportes') || target.getAttribute('data-view') === 'sports') {
      setTimeout(renderizarAgendaDeportes, 300);
    }
  }
});

const observer = new MutationObserver(() => {
  const grid = document.getElementById('channels-grid');
  if (grid && !document.getElementById('donatelo-cartelera-view')) {
    const sportsTab = Array.from(document.querySelectorAll('button, a')).find(el => 
      el.innerText && el.innerText.toLowerCase().includes('deportes')
    );
    if (sportsTab && (sportsTab.classList.contains('active') || sportsTab.style.borderBottom || window.location.href.includes('deportes'))) {
      renderizarAgendaDeportes();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(renderizarAgendaDeportes, 600);