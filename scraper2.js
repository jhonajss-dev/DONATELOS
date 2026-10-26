const { createClient } = require('@supabase/supabase-js');
const cheerio = require('cheerio');

// Credenciales de Supabase
const supabase = createClient('https://vkmpazwqyfxhdrwvqirv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk');

const mapaEquipos = {
  'ats': 'Atlas', 'pue': 'Puebla', 'ame': 'América', 'pac': 'Pachuca',
  'qro': 'Querétaro', 'caz': 'Cruz Azul', 'tij': 'Tijuana', 'san': 'Santos Laguna',
  'lafc': 'LAFC', 'la': 'LA Galaxy', 'sev': 'Sevilla', 'osa': 'Osasuna',
  'psg': 'PSG', 'lyon': 'Lyon', 'alt': 'Altrincham', 'kid': 'Kidderminster',
  'mem': 'Memphis Grizzlies', 'sac': 'Sacramento Kings', 'lal': 'LA Lakers', 'utah': 'Utah Jazz',
  'ind': 'Indiana Pacers', 'bkn': 'Brooklyn Nets', 'orl': 'Orlando Magic', 'ny': 'NY Knicks',
  'tor': 'Toronto Raptors', 'min': 'Minnesota Timberwolves', 'lac': 'LA Clippers', 'okc': 'Oklahoma City Thunder',
  'det': 'Detroit Pistons', 'phi': 'Philadelphia 76ers', 'wsh': 'Washington Wizards', 'cha': 'Charlotte Hornets',
  'cle': 'Cleveland Cavaliers', 'chi': 'Chicago Bulls', 'bos': 'Boston Celtics', 'dal': 'Dallas Mavericks',
  'mia': 'Miami Heat', 'mil': 'Milwaukee Bucks', 'phx': 'Phoenix Suns', 'atl': 'Atlanta Hawks',
  'hou': 'Houston Rockets', 'gs': 'Golden State Warriors',
  'col': 'Colorado Avalanche', 'nsh': 'Nashville Predators', 'nyi': 'NY Islanders',
  'mtl': 'Montreal Canadiens', 'wpg': 'Winnipeg Jets', 'van': 'Vancouver Canucks',
  'den': 'Denver Broncos', 'ari': 'Arizona Cardinals', 'gb': 'Green Bay Packers',
  'dal-nfl': 'Dallas Cowboys', 'phi-nfl': 'Philadelphia Eagles'
};

function resolverNombreEvento(embedUrl) {
  if (!embedUrl || embedUrl === 'No encontrado') return 'Evento en vivo';
  if (embedUrl.includes('nfl-redzone')) return 'NFL RedZone';

  const pathLimpio = embedUrl.replace(/\/away$|\/home$/, '').replace(/\\+$/, '');
  const partes = pathLimpio.split('/');
  let slug = partes[partes.length - 1].replace(/-\d+$/, '');

  if (embedUrl.includes('/nfl/')) {
    if (slug === 'dal-phi') return 'Dallas Cowboys vs. Philadelphia Eagles';
    if (slug === 'gb-det') return 'Green Bay Packers vs. Detroit Lions';
  }

  if (slug.includes('-')) {
    const sub = slug.split('-');
    if (sub.length === 2 && mapaEquipos[sub[0]] && mapaEquipos[sub[1]]) {
      return `${mapaEquipos[sub[0]]} vs. ${mapaEquipos[sub[1]]}`;
    }
  }

  return slug.replace(/-at-/g, ' vs. ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function ejecutarScraper() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Conectando a LaCancha...`);
    const response = await fetch('https://lacancha.tv/es', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const eventosMap = new Map();

    // Extraer la fecha/hora directamente de la tarjeta usando expresiones regulares sobre el HTML del bloque
    $('a[href^="/es/ver/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (href) {
        const cardHtml = $el.html() || '';
        const matchFecha = cardHtml.match(/(?:Dom|Lun|Mar|Mi[eé]|Jue|Vie|S[aá])[a-z]*,\s*\d{1,2}:\d{2}/i);
        
        let badgeText = matchFecha ? matchFecha[0] : 'En vivo';
        eventosMap.set(href, badgeText);
      }
    });

    const nuevosPartidos = [];

    for (const [path, horaTarjeta] of eventosMap.entries()) {
      const eventUrl = `https://lacancha.tv${path}`;
      try {
        const eventRes = await fetch(eventUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!eventRes.ok) continue;

        const eventHtml = await eventRes.text();
        const $event = cheerio.load(eventHtml);

        let embedUrl = '';
        const regex = /https?:\/\/[^\s"'<>]+\/embed\/[^\s"'<>]*|taifood-blog\.asia[^\s"'<>]*/g;
        const matches = eventHtml.match(regex) || [];

        for (const match of matches) {
          if (match.includes('taifood-blog.asia') || match.includes('/embed/')) {
            embedUrl = match.startsWith('http') ? match : `https://${match}`;
            break;
          }
        }

        if (!embedUrl) {
          $event('script').each((_, script) => {
            const scriptContent = $event(script).html() || '';
            if (scriptContent.includes('taifood') || scriptContent.includes('embed')) {
              const innerMatch = scriptContent.match(/https?:\/\/[^\s"'<]+\/embed\/[^\s"'<]+/);
              if (innerMatch) embedUrl = innerMatch[0];
            }
          });
        }

        if (embedUrl) embedUrl = embedUrl.replace(/\\+$/, '').replace(/["']/g, '');

        const urlLower = embedUrl.toLowerCase();
        if (
          urlLower.includes('247-') ||
          urlLower.includes('network') ||
          urlLower.includes('racing') ||
          urlLower.includes('golf') ||
          urlLower.includes('south-park') ||
          urlLower.includes('simpsons') ||
          urlLower.includes('rally-tv')
        ) {
          continue;
        }

        let deporte = 'Fútbol';
        if (urlLower.includes('/nba/')) deporte = 'NBA / Basket';
        else if (urlLower.includes('/nfl') || urlLower.includes('redzone') || urlLower.includes('chiefs') || urlLower.includes('rams')) deporte = 'Fútbol Am.';
        else if (urlLower.includes('/nhl/')) deporte = 'NHL';

        const eventoNombre = resolverNombreEvento(embedUrl);
        const partesEquipos = eventoNombre.split(' vs. ');
        const homeTeam = partesEquipos[0] || eventoNombre;
        const awayTeam = partesEquipos[1] || 'Visitante';

        nuevosPartidos.push({
          home_team: homeTeam,
          away_team: awayTeam,
          deporte: deporte,
          channel_name: 'Opción 1',
          stream_url: embedUrl,
          hora: horaTarjeta
        });

      } catch (err) {
        console.error(`Error procesando ${eventUrl}:`, err.message);
      }
    }

    if (nuevosPartidos.length > 0) {
      await supabase.from('partidos_scraper2').delete().neq('id', 0);
      const { error } = await supabase.from('partidos_scraper2').insert(nuevosPartidos);
      if (error) {
        console.error('Error al guardar en Supabase:', error.message);
      } else {
        console.log(`[ÉXITO] Tabla 'partidos_scraper2' actualizada con ${nuevosPartidos.length} registros incluyendo las fechas reales.`);
      }
    }

  } catch (error) {
    console.error('Error general en el scraper:', error.message);
  }
}

ejecutarScraper();
setInterval(ejecutarScraper, 30 * 60 * 1000);