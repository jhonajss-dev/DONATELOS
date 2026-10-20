const { createClient } = require('@supabase/supabase-js');

// 1. Configuración de Supabase
const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function procesarAgendaDiaria() {
  const fechaHoyIso = new Date().toISOString().split('T')[0];
  const fechaHoyEspn = fechaHoyIso.replace(/-/g, '');
  
  console.log(`⚽ Obteniendo partidos del día (${fechaHoyIso}) desde API Gratuita de ESPN...`);

  try {
    const urlEspn = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${fechaHoyEspn}`;
    const response = await fetch(urlEspn);

    if (!response.ok) {
      throw new Error(`Error en respuesta de ESPN: ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    if (events.length === 0) {
      console.log("ℹ️ No se encontraron partidos programados en la API para el día de hoy.");
      return;
    }

    let partidosDelDia = [];

    events.forEach(event => {
      const competition = event.competitions && event.competitions[0];
      if (!competition) return;

      const competitors = competition.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
      const away = competitors.find(c => c.homeAway === 'away') || competitors[1];

      if (!home || !away) return;

      const homeTeam = home.team.displayName || home.team.name;
      const awayTeam = away.team.displayName || away.team.name;
      const homeLogo = home.team.logo || "https://via.placeholder.com/24";
      const awayLogo = away.team.logo || "https://via.placeholder.com/24";

      let matchTime = "Por confirmar";
      if (event.date) {
        const dateObj = new Date(event.date);
        matchTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      // Se incluyen los campos de texto con valores vacíos por compatibilidad con la tabla
      partidosDelDia.push({
        home_team: homeTeam,
        home_logo: homeLogo,
        away_team: awayTeam,
        away_logo: awayLogo,
        match_time: matchTime,
        channel_name: "", 
        stream_url: ""
      });
    });

    console.log(`📊 Partidos extraídos para hoy: ${partidosDelDia.length}`);

    // Paso 1: Limpiar la cartelera anterior en Supabase
    const { error: deleteError } = await db
      .from('partidos_cartelera')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      console.error("❌ Error al vaciar cartelera anterior:", deleteError.message);
      return;
    }

    // Paso 2: Inserción masiva compatible con la tabla
    const { error: insertError } = await db
      .from('partidos_cartelera')
      .insert(partidosDelDia);

    if (insertError) {
      console.error("❌ Error al insertar en Supabase:", insertError.message);
    } else {
      console.log(`✅ ¡Agenda de hoy (${fechaHoyIso}) guardada exitosamente con ${partidosDelDia.length} partidos!`);
    }

  } catch (err) {
    console.error("❌ Error durante la extracción diaria:", err);
  }
}

procesarAgendaDiaria();