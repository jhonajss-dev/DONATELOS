const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerPartidosEnMismaSesion() {
  console.log("⚡ Extrayendo enlaces dinámicos reales por partido...");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // 1. Cargar la agenda UNA SOLA VEZ
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // 2. Mapear los partidos y sus textos
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

    // Filtrar partidos únicos
    const unicosMap = new Map();
    partidosInfo.forEach(p => {
      if (!unicosMap.has(p.texto)) unicosMap.set(p.texto, p.index);
    });

    console.log(`🏟️ Procesando ${unicosMap.size} partidos de forma secuencial...`);
    const partidosParaGuardar = [];
    const subPage = await browser.newPage();
    await subPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (let [texto, domIndex] of unicosMap.entries()) {
      try {
        // Clic en el partido dentro de la misma vista activa
        await page.evaluate((idx) => {
          const els = document.querySelectorAll('a');
          if (els[idx]) {
            els[idx].scrollIntoView();
            els[idx].click();
          }
        }, domIndex);

        // Esperar a que JavaScript despliegue la lista de canales del partido seleccionado
        await new Promise(r => setTimeout(r, 1200));

        // Obtener la URL o iframe generado específicamente tras el clic
        const targetUrl = await page.evaluate(() => {
          // Buscar el primer enlace o iframe generado dinámicamente en el contenedor de reproducción
          const playerFrame = document.querySelector('iframe');
          if (playerFrame && playerFrame.src && !playerFrame.src.includes('live-banner')) {
            return playerFrame.src;
          }
          
          // Buscar enlaces de opciones desplegados debajo del evento
          const links = Array.from(document.querySelectorAll('a'))
            .map(a => a.href || '')
            .filter(href => href && !href.includes('agenda.php') && !href.endsWith('#') && (href.includes('canal') || href.includes('php') || href.includes('iframe')));
            
          return links.length > 0 ? links[0] : null;
        });

        const partes = texto.split(/ vs /i);
        const homeTeam = partes[0] ? partes[0].replace(/.*:/, '').trim() : texto;
        const awayTeam = partes[1] ? partes[1].trim() : '';

        let finalStream = targetUrl || page.url();

        // Si la URL capturada es una página intermedia, inspeccionar su iframe interno
        if (targetUrl && (targetUrl.includes('canal') || targetUrl.includes('.php'))) {
          try {
            await subPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
            await new Promise(r => setTimeout(r, 1000));
            
            const iframeSrc = await subPage.evaluate(() => {
              const iframes = Array.from(document.querySelectorAll('iframe'));
              for (let f of iframes) {
                const src = f.src || '';
                if (src && !src.includes('live-banner') && !src.includes('ads') && !src.includes('banner')) {
                  return src;
                }
              }
              return null;
            });

            if (iframeSrc) finalStream = iframeSrc;
          } catch (e) {}
        }

        console.log(`▶️ [${homeTeam} vs ${awayTeam}] -> ${finalStream}`);

        partidosParaGuardar.push({
          home_team: homeTeam.substring(0, 50),
          home_logo: "https://via.placeholder.com/24",
          away_team: awayTeam.substring(0, 50),
          away_logo: "https://via.placeholder.com/24",
          match_time: "En Vivo",
          channel_name: "Opción Directa",
          stream_url: finalStream
        });

      } catch (err) {
        console.log(`⚠️ Error procesando partido: ${texto}`);
      }
    }

    await subPage.close();

    if (partidosParaGuardar.length > 0) {
      await db.from('partidos_cartelera').delete().neq('id', 0);
      await db.from('partidos_cartelera').insert(partidosParaGuardar);
      console.log(`\n✅ Supabase actualizado con reproductor dinámico único por partido (${partidosParaGuardar.length} registros).`);
    }

  } catch (error) {
    console.error("❌ Error en el scraper:", error);
  } finally {
    await browser.close();
  }
}

extraerPartidosEnMismaSesion();