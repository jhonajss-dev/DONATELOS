const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6InFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerTodosLosCanalesLimpios() {
  console.log("⚡ Iniciando extracción limpia de múltiples canales...");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    // Obtener lista de partidos únicos
    const totalPartidos = await page.evaluate(() => {
      const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
        const txt = el.innerText || '';
        return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
      });
      
      const lista = [];
      elementos.forEach((el, index) => {
        const txt = el.innerText.replace(/\n/g, ' ').trim();
        const limpio = txt.replace(/^[^:]*:\s*/, '').replace(/\s+EN VIVO.*/i, '').trim();
        if (limpio.length > 3) {
          lista.push({ index, texto: limpio });
        }
      });
      return lista;
    });

    const unicosMap = new Map();
    totalPartidos.forEach(p => {
      if (!unicosMap.has(p.texto)) {
        unicosMap.set(p.texto, p.index);
      }
    });

    console.log(`🏟️ Encontrados ${unicosMap.size} partidos únicos. Procesando...`);
    const partidosParaGuardar = [];

    for (let [textoPartido, domIndex] of unicosMap.entries()) {
      try {
        await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1000));

        // Hacer clic en el partido para desplegar servidores
        const clickExitoso = await page.evaluate((idx) => {
          const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
            const txt = el.innerText || '';
            return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
          });

          if (elementos[idx]) {
            elementos[idx].scrollIntoView();
            elementos[idx].click();
            return true;
          }
          return false;
        }, domIndex);

        if (!clickExitoso) continue;
        await new Promise(r => setTimeout(r, 1500));

        // Obtener la cantidad exacta de botones de servidor de este partido
        const totalBotonesServidor = await page.evaluate((idx) => {
          const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
            const txt = el.innerText || '';
            return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
          });

          const targetMatch = elementos[idx];
          if (!targetMatch) return 0;

          // Buscar elementos interactivos siguientes que contengan "Server" u "OPC"
          let current = targetMatch.nextElementSibling;
          let botones = [];

          while (current) {
            const t = current.innerText || '';
            if (t.toLowerCase().includes('vs') && !t.includes('Server:')) break;
            
            const matches = current.querySelectorAll('a, button, div.server-btn, span');
            if (matches.length > 0) {
              matches.forEach(m => {
                const mt = m.innerText || '';
                if ((mt.includes('Server') || mt.includes('OPC') || mt.includes('Disney') || mt.includes('ESPN')) && !botones.includes(m)) {
                  botones.push(m);
                }
              });
            }
            current = current.nextElementSibling;
          }
          return botones.length;
        }, domIndex);

        const limite = totalBotonesServidor > 0 ? totalBotonesServidor : 1;

        for (let j = 0; j < limite; j++) {
          try {
            // Reabrir acordeón
            await page.evaluate((idx) => {
              const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
                const txt = el.innerText || '';
                return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
              });
              if (elementos[idx]) elementos[idx].click();
            }, domIndex);

            await new Promise(r => setTimeout(r, 500));

            // Clic en el botón de servidor específico `j` y extraer nombre limpio
            const nombreCanal = await page.evaluate(([idx, optIdx]) => {
              const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
                const txt = el.innerText || '';
                return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
              });

              const targetMatch = elementos[idx];
              if (!targetMatch) return null;

              let current = targetMatch.nextElementSibling;
              let botones = [];

              while (current) {
                const t = current.innerText || '';
                if (t.toLowerCase().includes('vs') && !t.includes('Server:')) break;
                
                const matches = current.querySelectorAll('a, button, div.server-btn, span');
                matches.forEach(m => {
                  const mt = m.innerText || '';
                  if ((mt.includes('Server') || mt.includes('OPC') || mt.includes('Disney') || mt.includes('ESPN')) && !botones.includes(m)) {
                    botones.push(m);
                  }
                });
                current = current.nextElementSibling;
              }

              if (botones[optIdx]) {
                botones[optIdx].click();
                let raw = botones[optIdx].innerText || `Canal ${optIdx + 1}`;
                // Limpiar texto para dejar solo el nombre del canal/servidor
                return raw.replace(/Server:.*/gi, '').replace(/Calidad.*/gi, '').trim() || `Servidor ${optIdx + 1}`;
              }
              return null;
            }, [domIndex, j]);

            if (!nombreCanal) continue;
            await new Promise(r => setTimeout(r, 2000));

            // Extraer iframe activo
            const streamUrl = await page.evaluate(() => {
              const iframes = Array.from(document.querySelectorAll('iframe'));
              for (let f of iframes) {
                const src = f.src || '';
                if (src && !src.includes('live-banner') && !src.includes('ads') && !src.includes('banner') && !src.includes('facebook') && !src.includes('google')) {
                  return src;
                }
              }
              return null;
            });

            if (!streamUrl || streamUrl.includes('agenda.php')) continue;

            const partes = textoPartido.split(/ vs /i);
            const homeTeam = partes[0] ? partes[0].trim() : textoPartido;
            const awayTeam = partes[1] ? partes[1].trim() : '';

            console.log(`  ▶️ [${homeTeam} vs ${awayTeam}] (${nombreCanal}) -> ${streamUrl}`);

            partidosParaGuardar.push({
              home_team: homeTeam.substring(0, 50),
              home_logo: "https://via.placeholder.com/24",
              away_team: awayTeam.substring(0, 50),
              away_logo: "https://via.placeholder.com/24",
              match_time: "En Vivo",
              channel_name: nombreCanal.substring(0, 40),
              stream_url: streamUrl
            });

          } catch (subErr) {
            // Continuar
          }
        }

      } catch (err) {
        console.log(`⚠️ Error en partido: ${textoPartido}`);
      }
    }

    if (partidosParaGuardar.length > 0) {
      console.log("\n🧹 Limpiando tabla anterior en Supabase...");
      await db.from('partidos_cartelera').delete().not('home_team', 'is', null);

      console.log("📥 Insertando canales limpios...");
      const { error: insertError } = await db.from('partidos_cartelera').insert(partidosParaGuardar);
      
      if (insertError) {
        console.error("❌ Error Supabase:", insertError.message);
      } else {
        console.log(`\n✅ ¡Base de datos actualizada con ${partidosParaGuardar.length} canales limpios!`);
      }
    } else {
      console.log("⚠️ No se recolectaron canales.");
    }

  } catch (error) {
    console.error("❌ Error general:", error);
  } finally {
    await browser.close();
  }
}

extraerTodosLosCanalesLimpios();