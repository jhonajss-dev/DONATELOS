import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function renderizarAgendaDeportes() {
  const grid = document.getElementById('channels-grid');
  if (!grid) return;

  // Crear o reutilizar el contenedor interno de la cartelera
  let carteleraView = document.getElementById('donatelo-cartelera-view');
  if (!carteleraView) {
    carteleraView = document.createElement('div');
    carteleraView.id = 'donatelo-cartelera-view';
    carteleraView.style.cssText = 'padding: 0 var(--pad, 24px); width: 100%; grid-column: 1 / -1;';
  }

  carteleraView.innerHTML = `
    <div style="margin: 10px 0 30px 0; color: #fff; font-family: inherit;">
      <div id="donatelo-player-container" style="margin-bottom: 30px; display: none;">
        <h3 style="color: #fff; margin-bottom: 12px; font-size: 1.2rem; font-weight: 600;">Reproductor en Vivo</h3>
        <div style="position: relative; width: 100%; padding-bottom: 56.25%; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
          <iframe id="donatelo-player" src="" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" allowfullscreen referrerpolicy="no-referrer"></iframe>
        </div>
        <p id="current-match-title" style="margin-top: 10px; font-size: 14px; font-weight: 500; color: #a1a1aa;"></p>
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

    partidosGrid.innerHTML = '';
    partidos.forEach(p => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: linear-gradient(135deg, #1e1e24 0%, #121215 100%);
        border: 1px solid #27272a;
        border-radius: 14px;
        padding: 16px;
        cursor: pointer;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 190px;
        transition: all 0.25s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      
      card.onmouseover = () => { 
        card.style.borderColor = '#ff4757'; 
        card.style.transform = 'translateY(-4px)'; 
        card.style.boxShadow = '0 8px 20px rgba(255, 71, 87, 0.2)';
      };
      card.onmouseout = () => { 
        card.style.borderColor = '#27272a'; 
        card.style.transform = 'translateY(0)'; 
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      };

      card.innerHTML = `
        <div>
          <span style="background-color: #e53935; color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">EN VIVO</span>
        </div>
        <div style="display: flex; justify-content: center; align-items: center; margin: 10px 0;">
          <div style="background: #ffffff; width: 64px; height: 64px; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
            <span style="font-size: 10px; font-weight: bold; color: #111; text-align: center; padding: 2px;">${(p.channel_name || 'TV').substring(0, 10)}</span>
          </div>
        </div>
        <div>
          <div style="font-weight: 600; font-size: 13px; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.home_team} vs ${p.away_team}">
            ${p.home_team} vs ${p.away_team}
          </div>
          <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">${p.channel_name}</div>
        </div>
      `;

      card.onclick = () => {
        playerContainer.style.display = 'block';
        player.src = p.stream_url;
        titleElem.textContent = `${p.home_team} vs ${p.away_team} (${p.channel_name})`;
        playerContainer.scrollIntoView({ behavior: 'smooth' });
      };

      partidosGrid.appendChild(card);
    });
  }

  // Reemplazar la grilla principal
  grid.innerHTML = '';
  grid.appendChild(carteleraView);
}

// Detectar clics en cualquier botón que contenga "Deportes" o su atributo correspondiente
document.addEventListener('click', (e) => {
  const target = e.target.closest('button, a');
  if (target) {
    const text = target.innerText ? target.innerText.toLowerCase() : '';
    const dataView = target.getAttribute('data-view');
    
    if (text.includes('deportes') || dataView === 'sports') {
      setTimeout(renderizarAgendaDeportes, 200);
    }
  }
});

// Verificación inicial al cargar la página
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(renderizarAgendaDeportes, 500);
});