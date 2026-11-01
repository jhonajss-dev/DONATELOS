function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function fetchPaginatedTable(tableName) {
  let allRows = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await db.from(tableName).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) break;
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }
  return allRows;
}

window.renderizarAgendaDeportes = async function() {
  const sportsContainer = document.getElementById('sports-container');
  const mainGrid = document.getElementById('channels-grid');
  
  if (mainGrid) mainGrid.style.display = 'none';
  if (sportsContainer) sportsContainer.style.display = 'block';
  if (!sportsContainer) return;

  const existingView = document.getElementById('donatelo-cartelera-view');
  if (existingView) existingView.remove();

  const carteleraView = document.createElement('div');
  carteleraView.id = 'donatelo-cartelera-view';
  carteleraView.style.cssText = 'padding: 0 var(--pad, 24px); width: 100%;';

  carteleraView.innerHTML = `
    <div style="margin: 10px 0 30px 0; color: var(--text); font-family: inherit;">
      <div style="background: rgba(217, 45, 18, 0.12); border: 1px solid var(--live); color: var(--text); padding: 14px 18px; border-radius: 12px; margin-bottom: 24px; font-size: 13px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
        <span style="font-size: 20px;">⚠️</span>
        <div>
          <strong style="color: var(--accent); display: block; margin-bottom: 2px;">Aviso importante</strong>
          <span style="color: var(--text);">¿Pantalla negra? Toca el video, cierra el anuncio y pulsa ▶️ de nuevo. Si no funciona, prueba otra opción. Descarguen el navegador BRAVE y VPN 1.1.1.1.</span>
        </div>
      </div>

      <div id="donatelo-player-container" style="margin-bottom: 30px; display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-volver-cartelera" class="btn" style="padding: 6px 14px; font-size: 13px; cursor: pointer;">← Volver</button>
            <h2 id="current-match-title" style="margin: 0; font-size: 1.2rem; font-weight: 800; color: var(--text);">Reproductor en Vivo</h2>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="chip">EN VIVO</span>
            <button onclick="navigator.clipboard.writeText(window.location.href); alert('¡Enlace copiado al portapapeles!');" class="btn" style="padding: 6px 14px; font-size: 13px;">Compartir</button>
          </div>
        </div>

        <div style="position: relative; width: 100%; max-width: 780px; margin: 0 auto; aspect-ratio: 16/9; background: #000; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          <iframe id="donatelo-player" src="" scrolling="no" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; overflow: hidden;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px;">
        <h3 id="agenda-titulo" style="color: var(--text); margin: 0; font-size: 1.3rem; font-weight: 800;">Agenda de Partidos y Cuotas en Vivo</h3>
        <div id="deportes-filtros-bar" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 5px;"></div>
      </div>

      <div style="margin-bottom: 25px; width: 100%;">
        <div style="position: relative; display: flex; align-items: center; background: var(--surface-2, #18181b); border: 1px solid var(--border, #27272a); border-radius: 12px; padding: 10px 16px;">
          <span style="font-size: 14px; margin-right: 10px; opacity: 0.6;">🔍</span>
          <input type="text" id="sportsSearchInput" placeholder="Buscar equipo, liga o canal (ej. Barcelona, NBA, NFL, ESPN)..." oninput="filtrarPartidosDeporte()" style="width: 100%; background: transparent; border: none; outline: none; color: var(--text); font-size: 14px; font-family: inherit;">
          <button id="clearSearchBtn" onclick="limpiarBuscadorDeportes()" style="background: transparent; border: none; color: var(--muted); font-size: 14px; cursor: pointer; display: none; padding: 0 4px;">✕</button>
        </div>
      </div>

      <div id="partidos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;"></div>
    </div>
  `;

  sportsContainer.innerHTML = '';
  sportsContainer.appendChild(carteleraView);

  const [dataCartelera, dataScraper2] = await Promise.all([
    fetchPaginatedTable('partidos_cartelera'),
    fetchPaginatedTable('partidos_scraper2')
  ]);

  const partidosCartelera = dataCartelera.map(p => ({ ...p, deporte: p.deporte || 'Fútbol', home_team: p.home_team || 'Local', away_team: p.away_team || 'Visita', thumbnail: p.thumbnail || '' }));
  const partidosScraper2 = dataScraper2.map(p => ({ ...p, home_team: p.home_team || 'Local', away_team: p.away_team || 'Visita', home_logo: p.home_logo || '', away_logo: p.away_logo || '', thumbnail: p.thumbnail || '', deporte: p.deporte || 'Fútbol', match_time: p.hora || p.tiempo_restante || 'En vivo' }));
  const partidos = [...partidosCartelera, ...partidosScraper2];

  const partidosGrid = carteleraView.querySelector('#partidos-grid');
  const filtrosBar = carteleraView.querySelector('#deportes-filtros-bar');
  
  if (!partidos || partidos.length === 0) {
    partidosGrid.innerHTML = '<p style="color: var(--muted); padding: 10px;">No hay partidos disponibles en este momento.</p>';
  } else {
    const playerContainer = carteleraView.querySelector('#donatelo-player-container');
    const player = carteleraView.querySelector('#donatelo-player');
    const titleElem = carteleraView.querySelector('#current-match-title');
    const btnVolver = carteleraView.querySelector('#btn-volver-cartelera');

    if (btnVolver) {
      btnVolver.onclick = () => {
        player.src = ''; 
        playerContainer.style.display = 'none'; 
        const url = new URL(window.location);
        url.searchParams.delete('partido');
        window.history.pushState({}, '', url);
      };
    }

    const partidosAgrupados = {};
    const conteoDeportes = { 'Todo': 0, 'Fútbol': 0, 'NBA / Basket': 0, 'Fútbol Am.': 0, 'NHL': 0 };

    partidos.forEach(p => {
      const key = `${p.home_team} vs ${p.away_team}`;
      const deporteVal = p.deporte || p.sport || 'Fútbol';

      if (!partidosAgrupados[key]) {
        partidosAgrupados[key] = {
          id: p.id || slugify(key),
          home_team: p.home_team,
          away_team: p.away_team,
          home_logo: p.home_logo || '',
          away_logo: p.away_logo || '',
          thumbnail: p.thumbnail || '',
          match_time: p.match_time || p.hora || p.tiempo_restante || 'En vivo',
          tiempo_restante: p.tiempo_restante || 'En vivo',
          deporte: deporteVal,
          channels: []
        };
        conteoDeportes['Todo']++;
        conteoDeportes[deporteVal] = (conteoDeportes[deporteVal] || 0) + 1;
      } else {
        if (!partidosAgrupados[key].home_logo && p.home_logo) partidosAgrupados[key].home_logo = p.home_logo;
        if (!partidosAgrupados[key].away_logo && p.away_logo) partidosAgrupados[key].away_logo = p.away_logo;
        if (!partidosAgrupados[key].thumbnail && p.thumbnail) partidosAgrupados[key].thumbnail = p.thumbnail;
      }

      if (p.stream_url) {
        partidosAgrupados[key].channels.push({
          channel_name: p.channel_name || 'Opción en vivo',
          stream_url: p.stream_url
        });
      }
    });

    let deporteActivo = 'Todo';
    function renderizarBotonesFiltro() {
      filtrosBar.innerHTML = '';
      Object.keys(conteoDeportes).forEach(cat => {
        const cantidad = conteoDeportes[cat] || 0;
        if (cat !== 'Todo' && cantidad === 0) return;
        const btn = document.createElement('button');
        const isActive = deporteActivo === cat;
        btn.style.cssText = `display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid ${isActive ? 'var(--live, #d92d12)' : 'var(--border, #27272a)'}; background: ${isActive ? 'var(--live, #d92d12)' : 'var(--surface-2, #18181b)'}; color: var(--text);`;
        btn.innerHTML = `<span>${cat}</span><span style="background: ${isActive ? 'rgba(0,0,0,0.25)' : 'var(--surface, #09090b)'}; padding: 1px 6px; border-radius: 10px; font-size: 11px;">${cantidad}</span>`;
        btn.onclick = () => { deporteActivo = cat; renderizarBotonesFiltro(); window.filtrarPartidosDeporte(); };
        filtrosBar.appendChild(btn);
      });
    }
    renderizarBotonesFiltro();

    partidosGrid.innerHTML = '';
    Object.values(partidosAgrupados).forEach(match => {
      // 1. Estructura externa <a class="hub-card"> idéntica a tu captura 1
      const card = document.createElement('a');
      card.className = 'hub-card';
      card.setAttribute('href', `/es/ver/${match.id}`);
      card.setAttribute('data-deporte', match.deporte);

      // Estilos del contenedor principal a
      card.style.cssText = `
        display: flex;
        flex-direction: column;
        background: var(--surface, #121216);
        border: 1px solid var(--border, #27272a);
        border-radius: 14px;
        overflow: hidden;
        text-decoration: none;
        color: var(--text);
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      `;

      // Fondo de imagen con gradiente lineal exacto a tu captura 1
      const mediaBgStyle = match.thumbnail 
        ? `background-image: url('${match.thumbnail}'), linear-gradient(135deg, rgb(0, 51, 160), rgb(0, 122, 51));`
        : `background-image: linear-gradient(135deg, rgb(0, 51, 160), rgb(0, 122, 51));`;

      // 2. Generación dinámica de la lista de botones de servidor dentro de hub-card-body (Captura 2)
      let canalesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; max-height: 120px; overflow-y: auto; padding-right: 4px;">';
      match.channels.forEach((ch) => {
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

      // 3. Inyección del DOM interno exacto a Captura 1
      card.innerHTML = `
        <div class="hub-card-media" style="${mediaBgStyle} background-size: cover; background-position: center; position: relative; padding: 14px; aspect-ratio: 16/9; display: flex; flex-direction: column; justify-content: space-between;">
          <span class="hub-card-grad" style="position: absolute; inset: 0; background: linear-gradient(160deg, rgba(0, 51, 160, 0.4), rgba(11, 13, 17, 0.95)); z-index: 1;"></span>
          <div class="hub-card-top" style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span class="hub-time" style="font-size: 12px; font-weight: 700; color: #fff;">${match.match_time}</span>
            <span class="hub-cd" style="font-size: 11px; color: #d4d4d8; display: flex; gap: 4px;">
              <span>en</span>
              <span>${match.tiempo_restante}</span>
            </span>
          </div>
          <div style="position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 8px; text-align: center;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;">
              ${match.home_logo ? `<img src="${match.home_logo}" style="width: 24px; height: 24px; object-fit: contain;">` : ''}
              <span style="font-size: 13px; font-weight: 700; color: #fff;">${match.home_team}</span>
            </div>
            <span style="color: #a1a1aa; font-size: 12px;">vs</span>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;">
              ${match.away_logo ? `<img src="${match.away_logo}" style="width: 24px; height: 24px; object-fit: contain;">` : ''}
              <span style="font-size: 13px; font-weight: 700; color: #fff;">${match.away_team}</span>
            </div>
          </div>
        </div>

        <div class="hub-card-body" style="padding: 14px; background: var(--surface, #121216); display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 800; color: var(--accent, #ff6b4d); text-transform: uppercase;">${match.deporte}</span>
            <span style="font-size: 11px; color: var(--muted);">${match.channels.length} servidores</span>
          </div>
          <div style="font-weight: 600; font-size: 14px; color: #f4f4f5; margin-top: 6px;">${match.home_team} vs ${match.away_team}</div>
          ${canalesHtml}
        </div>
      `;

      // Evento para abrir el reproductor en vivo sin redirigir de página
      card.onclick = (e) => {
        const btnClicked = e.target.closest('.channel-btn');
        if (btnClicked) {
          e.preventDefault();
          playerContainer.style.display = 'block';
          player.src = btnClicked.getAttribute('data-url');
          titleElem.textContent = btnClicked.getAttribute('data-name');
          playerContainer.scrollIntoView({ behavior: 'smooth' });
        }
      };

      partidosGrid.appendChild(card);
    });
  }
};

window.filtrarPartidosDeporte = function() {
  const input = document.getElementById('sportsSearchInput');
  const query = input ? input.value.toLowerCase().trim() : '';
  document.querySelectorAll('#partidos-grid > a').forEach(card => {
    card.style.display = (query === '' || card.innerText.toLowerCase().includes(query)) ? '' : 'none';
  });
};

window.limpiarBuscadorDeportes = function() {
  const input = document.getElementById('sportsSearchInput');
  if (input) { input.value = ''; window.filtrarPartidosDeporte(); input.focus(); }
};