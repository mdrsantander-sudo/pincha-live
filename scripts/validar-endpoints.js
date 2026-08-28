#!/usr/bin/env node
/**
 * Paso 0 - valida códigos de liga contra la API real y guarda muestras.
 * Uso: node scripts/validar-endpoints.js
 *
 * Confirma para cada código: si el scoreboard responde, si la tabla responde,
 * y si Estudiantes (id 8) aparece. Guarda una muestra recortada en /muestras.
 */
const fs = require('fs');
const path = require('path');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const MUESTRAS = path.join(__dirname, '..', 'muestras');

const CANDIDATOS = [
  'arg.1', 'arg.copa', 'arg.copa_argentina', 'arg.supercopa',
  'conmebol.libertadores', 'conmebol.sudamericana', 'conmebol.recopa'
];

const traer = async url => {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'pincha-live/1.0' } });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) { return { error: e.message }; }
};

const hoy = new Date();
const d = n => { const x = new Date(hoy); x.setDate(hoy.getDate() + n); return x.toISOString().slice(0, 10).replace(/-/g, ''); };
const rango = `${d(-45)}-${d(75)}`;

(async () => {
  fs.mkdirSync(MUESTRAS, { recursive: true });
  console.log(`Rango de fechas: ${rango}\n`);

  for (const codigo of CANDIDATOS) {
    const sb = await traer(`${CONFIG.api.site}/${codigo}/scoreboard?dates=${rango}&limit=400`);
    const tb = await traer(`${CONFIG.api.standings}/${codigo}/standings`);

    const eventos = sb?.events || [];
    const nuestros = eventos.filter(e =>
      (e.competitions?.[0]?.competitors || []).some(c => String(c.team?.id) === '8'));
    const tablas = tb?.children?.length || (tb?.standings ? 1 : 0);

    console.log(`${codigo.padEnd(24)} scoreboard: ${sb?.error ? 'ERROR ' + sb.error : eventos.length + ' eventos'}` +
      ` | Estudiantes: ${nuestros.length}` +
      ` | tablas: ${tb?.error ? 'ERROR ' + tb.error : tablas}`);

    if (!sb?.error) fs.writeFileSync(path.join(MUESTRAS, `${codigo}-scoreboard.json`),
      JSON.stringify({ liga: sb.leagues?.[0]?.name, eventosDeEstudiantes: nuestros.slice(0, 2) }, null, 2));
    if (!tb?.error) fs.writeFileSync(path.join(MUESTRAS, `${codigo}-standings.json`),
      JSON.stringify({ nombre: tb.name, grupos: (tb.children || []).map(c => c.name) }, null, 2));
  }
  console.log('\nMuestras guardadas en /muestras. Pasá los códigos que respondieron a config.json y marcá verificado:true.');
})();
