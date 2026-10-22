const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerPartidosPorClic() {
  console.log("⚡ Extrayendo partidos mediante clics virtuales e inspección de canales...");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Obtener todos los elementos de partidos en el DOM
    const partidosInfo = await page.evaluate(() => {
      const resultados = [];
      const elementos = document.querySelectorAll('a');
      elementos.forEach((el, index) => {
        const texto = el.innerText ? el.innerText.trim() : '';
        if (texto.toLowerCase().includes('vs')) {
          resultados.push({ index, texto: texto.replace(/\n/g, ' ') });
        }
      });
      return resultados;
    });

    if (partidosInfo.length === 0) {
      console.log("⚠️ No se encontraron partidos en la web.");
      await browser.close();
      return;
    }

    // Filtrar duplicados guardando el índice original en la página
    const unicosMap = new Map();
    partidosInfo.forEach(p => {
      if (!unicosMap.has(p.texto)) {
        unicosMap.set(p.texto, p.index);
      }
    });

    console.log(`🏟️ Encontrados ${unicosMap.size} partidos únicos. Procesando sus canales específicos...`);
    const partidosParaGuardar = [];
    const subPage = await browser.newPage();
    await subPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (let [texto, domIndex] of unicosMap.entries()) {
      try {
        // Volver a cargar la agenda limpia
        await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // Clic en el partido específico
        await page.evaluate((idx) => {
          const els = document.querySelectorAll('a');
          if (els[idx]) els[idx].click();
        }, domIndex);

        await new Promise(r => setTimeout(r, 1500));

        // Obtener solo los enlaces/canales desplegados específicamente para este partido
        const channelLinks = await page.evaluate(() => {
          const links = [];
          // Seleccionamos los enlaces desplegados internamente tras el clic
          document.querySelectorAll('a').forEach(a => {
            const href = a.href || '';
            const text = a.innerText ? a.innerText.trim().replace(/\n/g, ' ') : '';
            // Ignoramos enlaces a la agenda, anclas vacías o banners
            if (href && !href.includes('agenda.php') && !href.endsWith('#') && text.length > 0) {
              links.push({ name: text, url: href });
            }
          });
          return links;
        });

        const partes = texto.split(/ vs /i);
        const homeTeam = partes[0] ? partes[0].replace(/.*:/, '').trim() : texto;
        const awayTeam = partes[1] ? partes[1].trim() : '';

        if (channelLinks.length > 0) {
          // Filtramos opciones para tomar la primera que sea un enlace de video válido
          const ch = channelLinks.find(c => c.url.includes('canal') || c.url.includes('php') || c.url.includes('html')) || channelLinks[0];
          let finalStream = ch.url;

          try {
            await subPage.goto(ch.url, { waitUntil: 'networkidle2', timeout: 10000 });
            await new Promise(r => setTimeout(r, 1500));
            
            // Inspección del iframe de video real descartando publicidad
            const iframeSrc = await subPage.evaluate(() => {
              const iframes = Array.from(document.querySelectorAll('iframe'));
              for (let f of iframes) {
                const src = f.src || '';
                if (
                  src && 
                  !src.includes('live-banner') && 
                  !src.includes('ads') && 
                  !src.includes('banner') && 
                  !src.includes('facebook') && 
                  !src.includes('google')
                ) {
                  return src;
                }
              }
              return null;
            });

            if (iframeSrc) finalStream = iframeSrc;
          } catch (e) {}

          console.log(`▶️ [${homeTeam} vs ${awayTeam}] -> ${finalStream}`);

          partidosParaGuardar.push({
            home_team: homeTeam.substring(0, 50),
            home_logo: "https://via.placeholder.com/24",
            away_team: awayTeam.substring(0, 50),
            away_logo: "https://via.placeholder.com/24",
            match_time: "En Vivo",
            channel_name: ch.name.substring(0, 40),
            stream_url: finalStream
          });
        }
      } catch (err) {
        console.log(`⚠️ Error procesando partido: ${texto}`);
      }
    }

    await subPage.close();

    if (partidosParaGuardar.length > 0) {
      await db.from('partidos_cartelera').delete().neq('id', 0);
      await db.from('partidos_cartelera').insert(partidosParaGuardar);
      console.log(`\n✅ Supabase actualizado con reproductor real por partido (${partidosParaGuardar.length} registros).`);
    }

  } catch (error) {
    console.error("❌ Error en el scraper:", error);
  } finally {
    await browser.close();
  }
}

extraerPartidosPorClic();