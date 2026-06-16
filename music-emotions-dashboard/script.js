/* ══════════════════════════════════════════════════════════════════
   Music Emotion Analytics Dashboard — script.js
   Sections:
     1. State & Constants
     2. CSV Parsing
     3. File Loading & Dataset Management
     4. Dashboard (metrics + genre map)
     5. Correlation Explorer
     6. Random Forest Insights (static)
     7. K-Means Visualization
     8. Recommendation Engine
     9. Navigation
══════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════
   1. STATE & CONSTANTS
══════════════════════════════════════════ */

let dataset       = [];
let allGenres     = [];   // sorted unique genre strings
let currentSeed   = null; // currently selected seed song object
let dataLoaded    = false;

const SAMPLE_SIZE = 230000;

// Target audio feature profiles per mood (all values 0–1; tempoNorm = tempo / 250)
const MOOD_PROFILES = {
  happy:       { valence: 0.82, energy: 0.70, danceability: 0.75, tempoNorm: 0.58, acousticness: 0.20, speechiness: 0.08 },
  relaxed:     { valence: 0.52, energy: 0.28, danceability: 0.44, tempoNorm: 0.38, acousticness: 0.60, speechiness: 0.06 },
  energetic:   { valence: 0.46, energy: 0.91, danceability: 0.64, tempoNorm: 0.82, acousticness: 0.08, speechiness: 0.12 },
  dark:        { valence: 0.18, energy: 0.72, danceability: 0.40, tempoNorm: 0.62, acousticness: 0.22, speechiness: 0.08 },
  dance:       { valence: 0.76, energy: 0.86, danceability: 0.90, tempoNorm: 0.72, acousticness: 0.10, speechiness: 0.10 },
  melancholic: { valence: 0.20, energy: 0.32, danceability: 0.36, tempoNorm: 0.40, acousticness: 0.55, speechiness: 0.06 },
  focus:       { valence: 0.40, energy: 0.45, danceability: 0.38, tempoNorm: 0.48, acousticness: 0.45, speechiness: 0.04 },
};

// Maps the three user-facing level choices to numeric 0-1 targets
const LEVEL_MAP = { low: 0.22, medium: 0.55, high: 0.85 };

// Weighted Euclidean distance weights — informed by Random Forest feature importance
const WEIGHTS = { valence: 3.0, danceability: 2.5, energy: 2.0, tempoNorm: 1.0, acousticness: 1.0, speechiness: 0.5 };
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

// Curated fallback songs shown when no CSV is loaded (7 moods × 6 tracks)
const MOCK_SONGS = {
  happy: [
    { track: 'Here Comes the Sun',   artist: 'The Beatles',             genre: 'Pop',       valence: 0.84, energy: 0.49, danceability: 0.60, tempo: 129, acousticness: 0.52, speechiness: 0.04 },
    { track: 'Happy',                artist: 'Pharrell Williams',        genre: 'Pop',       valence: 0.96, energy: 0.83, danceability: 0.83, tempo: 160, acousticness: 0.08, speechiness: 0.09 },
    { track: 'September',            artist: 'Earth, Wind & Fire',       genre: 'R&B',       valence: 0.89, energy: 0.78, danceability: 0.77, tempo: 125, acousticness: 0.05, speechiness: 0.06 },
    { track: "Can't Stop the Feeling",artist:'Justin Timberlake',        genre: 'Pop',       valence: 0.93, energy: 0.80, danceability: 0.77, tempo: 113, acousticness: 0.05, speechiness: 0.07 },
    { track: 'Walking on Sunshine',  artist: 'Katrina and the Waves',    genre: 'Pop Rock',  valence: 0.92, energy: 0.88, danceability: 0.68, tempo: 148, acousticness: 0.04, speechiness: 0.05 },
    { track: 'Shake It Off',         artist: 'Taylor Swift',             genre: 'Pop',       valence: 0.90, energy: 0.80, danceability: 0.65, tempo: 160, acousticness: 0.03, speechiness: 0.14 },
  ],
  relaxed: [
    { track: 'Landslide',            artist: 'Fleetwood Mac',            genre: 'Folk',      valence: 0.34, energy: 0.27, danceability: 0.34, tempo: 77,  acousticness: 0.86, speechiness: 0.03 },
    { track: 'Holocene',             artist: 'Bon Iver',                 genre: 'Indie',     valence: 0.25, energy: 0.28, danceability: 0.38, tempo: 82,  acousticness: 0.80, speechiness: 0.03 },
    { track: 'Fast Car',             artist: 'Tracy Chapman',            genre: 'Folk',      valence: 0.45, energy: 0.36, danceability: 0.53, tempo: 104, acousticness: 0.60, speechiness: 0.04 },
    { track: 'Clair de Lune',        artist: 'Claude Debussy',           genre: 'Classical', valence: 0.30, energy: 0.10, danceability: 0.20, tempo: 60,  acousticness: 0.97, speechiness: 0.04 },
    { track: 'Breathe (2 AM)',       artist: 'Anna Nalick',              genre: 'Pop',       valence: 0.41, energy: 0.32, danceability: 0.42, tempo: 88,  acousticness: 0.72, speechiness: 0.04 },
    { track: 'The Night We Met',     artist: 'Lord Huron',               genre: 'Indie',     valence: 0.22, energy: 0.33, danceability: 0.39, tempo: 88,  acousticness: 0.68, speechiness: 0.03 },
  ],
  energetic: [
    { track: 'Thunderstruck',        artist: 'AC/DC',                    genre: 'Rock',      valence: 0.43, energy: 0.97, danceability: 0.43, tempo: 133, acousticness: 0.01, speechiness: 0.06 },
    { track: 'Lose Yourself',        artist: 'Eminem',                   genre: 'Hip-Hop',   valence: 0.37, energy: 0.88, danceability: 0.53, tempo: 171, acousticness: 0.02, speechiness: 0.28 },
    { track: 'Levels',               artist: 'Avicii',                   genre: 'Electronic',valence: 0.60, energy: 0.90, danceability: 0.73, tempo: 126, acousticness: 0.02, speechiness: 0.04 },
    { track: 'Eye of the Tiger',     artist: 'Survivor',                 genre: 'Rock',      valence: 0.58, energy: 0.91, danceability: 0.50, tempo: 109, acousticness: 0.01, speechiness: 0.07 },
    { track: 'Bangarang',            artist: 'Skrillex',                 genre: 'Electronic',valence: 0.32, energy: 0.97, danceability: 0.60, tempo: 110, acousticness: 0.00, speechiness: 0.08 },
    { track: 'Till I Collapse',      artist: 'Eminem',                   genre: 'Hip-Hop',   valence: 0.34, energy: 0.90, danceability: 0.56, tempo: 171, acousticness: 0.01, speechiness: 0.27 },
  ],
  dark: [
    { track: 'Comfortably Numb',     artist: 'Pink Floyd',               genre: 'Rock',      valence: 0.18, energy: 0.38, danceability: 0.31, tempo: 63,  acousticness: 0.20, speechiness: 0.03 },
    { track: 'Creep',                artist: 'Radiohead',                genre: 'Alternative',valence:0.16, energy: 0.49, danceability: 0.29, tempo: 92,  acousticness: 0.15, speechiness: 0.04 },
    { track: 'Black',                artist: 'Pearl Jam',                genre: 'Rock',      valence: 0.12, energy: 0.55, danceability: 0.28, tempo: 80,  acousticness: 0.18, speechiness: 0.03 },
    { track: 'Hurt',                 artist: 'Nine Inch Nails',          genre: 'Industrial',valence: 0.10, energy: 0.37, danceability: 0.26, tempo: 93,  acousticness: 0.30, speechiness: 0.03 },
    { track: 'Paint It Black',       artist: 'The Rolling Stones',       genre: 'Rock',      valence: 0.20, energy: 0.76, danceability: 0.44, tempo: 163, acousticness: 0.04, speechiness: 0.05 },
    { track: 'The Sound of Silence', artist: 'Simon & Garfunkel',        genre: 'Folk',      valence: 0.22, energy: 0.25, danceability: 0.32, tempo: 104, acousticness: 0.78, speechiness: 0.04 },
  ],
  dance: [
    { track: 'One More Time',        artist: 'Daft Punk',                genre: 'Electronic',valence: 0.72, energy: 0.89, danceability: 0.84, tempo: 123, acousticness: 0.01, speechiness: 0.04 },
    { track: 'Uptown Funk',          artist: 'Mark Ronson ft. Bruno Mars',genre: 'Funk',     valence: 0.87, energy: 0.87, danceability: 0.91, tempo: 115, acousticness: 0.01, speechiness: 0.09 },
    { track: 'Get Lucky',            artist: 'Daft Punk',                genre: 'Electronic',valence: 0.82, energy: 0.75, danceability: 0.86, tempo: 116, acousticness: 0.03, speechiness: 0.04 },
    { track: 'Good as Hell',         artist: 'Lizzo',                    genre: 'Pop',       valence: 0.92, energy: 0.71, danceability: 0.78, tempo: 94,  acousticness: 0.15, speechiness: 0.09 },
    { track: 'As It Was',            artist: 'Harry Styles',             genre: 'Pop',       valence: 0.68, energy: 0.73, danceability: 0.80, tempo: 124, acousticness: 0.04, speechiness: 0.04 },
    { track: 'Blinding Lights',      artist: 'The Weeknd',               genre: 'Pop',       valence: 0.66, energy: 0.80, danceability: 0.51, tempo: 171, acousticness: 0.00, speechiness: 0.06 },
  ],
  melancholic: [
    { track: 'Someone Like You',     artist: 'Adele',                    genre: 'Pop',       valence: 0.16, energy: 0.30, danceability: 0.41, tempo: 68,  acousticness: 0.87, speechiness: 0.04 },
    { track: 'Skinny Love',          artist: 'Bon Iver',                 genre: 'Indie',     valence: 0.13, energy: 0.22, danceability: 0.33, tempo: 97,  acousticness: 0.86, speechiness: 0.03 },
    { track: 'The Night We Met',     artist: 'Lord Huron',               genre: 'Indie',     valence: 0.22, energy: 0.33, danceability: 0.39, tempo: 88,  acousticness: 0.68, speechiness: 0.03 },
    { track: 'Broken',               artist: 'lovelytheband',            genre: 'Alternative',valence:0.24, energy: 0.41, danceability: 0.56, tempo: 115, acousticness: 0.16, speechiness: 0.05 },
    { track: 'Motion Picture Soundtrack',artist:'Radiohead',             genre: 'Alternative',valence:0.09, energy: 0.16, danceability: 0.24, tempo: 68,  acousticness: 0.94, speechiness: 0.04 },
    { track: 'Liability',            artist: 'Lorde',                    genre: 'Indie',     valence: 0.11, energy: 0.20, danceability: 0.30, tempo: 78,  acousticness: 0.88, speechiness: 0.04 },
  ],
  focus: [
    { track: 'Experience',           artist: 'Ludovico Einaudi',         genre: 'Classical', valence: 0.35, energy: 0.22, danceability: 0.29, tempo: 100, acousticness: 0.95, speechiness: 0.04 },
    { track: 'Time',                 artist: 'Hans Zimmer',              genre: 'Soundtrack', valence: 0.28, energy: 0.25, danceability: 0.22, tempo: 56,  acousticness: 0.80, speechiness: 0.04 },
    { track: "Comptine d'un autre été", artist:'Yann Tiersen',           genre: 'Classical', valence: 0.44, energy: 0.18, danceability: 0.31, tempo: 76,  acousticness: 0.97, speechiness: 0.04 },
    { track: 'Weightless',           artist: 'Marconi Union',            genre: 'Ambient',   valence: 0.20, energy: 0.12, danceability: 0.18, tempo: 60,  acousticness: 0.90, speechiness: 0.04 },
    { track: 'Arrival of the Birds', artist: 'The Cinematic Orchestra',  genre: 'Soundtrack', valence: 0.30, energy: 0.20, danceability: 0.25, tempo: 60,  acousticness: 0.92, speechiness: 0.04 },
    { track: 'Nuvole Bianche',       artist: 'Ludovico Einaudi',         genre: 'Classical', valence: 0.36, energy: 0.16, danceability: 0.24, tempo: 63,  acousticness: 0.97, speechiness: 0.04 },
  ],
};

// Static genre profiles shown before CSV is loaded
const STATIC_GENRES = [
  { genre: 'Reggae',           valence: 0.80, energy: 0.65, danceability: 0.82 },
  { genre: 'Electronic',       valence: 0.38, energy: 0.85, danceability: 0.70 },
  { genre: 'Classical',        valence: 0.30, energy: 0.25, danceability: 0.28 },
  { genre: "Children's Music", valence: 0.88, energy: 0.55, danceability: 0.62 },
];


/* ══════════════════════════════════════════
   2. CSV PARSING
══════════════════════════════════════════ */

// Parse a single CSV row, handling quoted fields containing commas
function parseCSVRow(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Escaped quote inside a quoted field ("" → ")
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// Parse the full CSV text and return an array of song objects (only needed columns)
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Build a column-index map from the header row
  const header = parseCSVRow(lines[0]);
  const idx = {};
  header.forEach((col, i) => { idx[col.trim().replace(/^﻿/, '')] = i; }); // strip BOM

  const songs = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const f = parseCSVRow(line);

    const valence      = parseFloat(f[idx.valence]);
    const energy       = parseFloat(f[idx.energy]);
    const danceability = parseFloat(f[idx.danceability]);
    const tempo        = parseFloat(f[idx.tempo]);

    // Skip rows with missing core numeric data
    if (isNaN(valence) || isNaN(energy) || isNaN(danceability)) continue;

    songs.push({
      genre:            f[idx.genre]       || 'Unknown',
      artist:           f[idx.artist_name] || 'Unknown',
      track:            f[idx.track_name]  || 'Unknown',
      valence,
      energy,
      danceability,
      tempo:            isNaN(tempo) ? 120 : tempo,
      tempoNorm:        Math.min((isNaN(tempo) ? 120 : tempo) / 250, 1),
      acousticness:     parseFloat(f[idx.acousticness])     || 0,
      speechiness:      parseFloat(f[idx.speechiness])      || 0,
      instrumentalness: parseFloat(f[idx.instrumentalness]) || 0,
      liveness:         parseFloat(f[idx.liveness])         || 0,
      popularity:       parseInt(f[idx.popularity])         || 0,
    });
  }
  return songs;
}

// Partial Fisher-Yates shuffle to draw a random sample without full copy
function sampleDataset(arr, n) {
  if (arr.length <= n) return arr.slice();
  const result = [];
  // Work on an index array to avoid mutating the original
  const indices = Array.from({ length: arr.length }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    result.push(arr[indices[i]]);
  }
  return result;
}


/* ══════════════════════════════════════════
   3. FILE LOADING & DATASET MANAGEMENT
══════════════════════════════════════════ */

function initFileUpload() {
  const uploadZone = document.getElementById('upload-zone');
  const csvInput   = document.getElementById('csv-input');
  const uploadBtn  = document.getElementById('upload-btn');
  const reloadBtn  = document.getElementById('btn-reload-csv');
  const goUpload   = document.getElementById('reco-go-upload');

  // Click the hidden file input via the button or entire zone
  uploadBtn.addEventListener('click', () => csvInput.click());
  uploadZone.addEventListener('click', e => { if (e.target !== uploadBtn) csvInput.click(); });

  // Drag & drop
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  csvInput.addEventListener('change', () => { if (csvInput.files[0]) handleFile(csvInput.files[0]); });

  // "Load a different file" resets to upload state
  reloadBtn.addEventListener('click', resetToUpload);

  // Sidebar link to go-to-upload from recommendation page
  if (goUpload) {
    goUpload.addEventListener('click', e => {
      e.preventDefault();
      navigateTo('dashboard');
    });
  }
}

function handleFile(file) {
  showLoadStatus('Reading file…');

  const reader = new FileReader();
  reader.onload = e => {
    setLoadMsg('Parsing CSV rows…');
    // Yield to the UI thread so the spinner can render before the synchronous parse
    setTimeout(() => {
      const allSongs = parseCSV(e.target.result);
      setLoadMsg(`Sampling ${SAMPLE_SIZE.toLocaleString()} songs…`);
      setTimeout(() => {
        dataset = sampleDataset(allSongs, SAMPLE_SIZE);
        onDatasetReady(allSongs.length);
      }, 30);
    }, 50);
  };
  reader.onerror = () => setLoadMsg('Error reading file. Please try again.');
  reader.readAsText(file);
}

// Called once the dataset array is ready; updates the entire dashboard
function onDatasetReady(totalRows) {
  dataLoaded = true;

  // Extract sorted unique genres
  const genreSet = new Set(dataset.map(s => s.genre).filter(Boolean));
  allGenres = [...genreSet].sort();

  showLoadDone(
    `✓ Loaded ${dataset.length.toLocaleString()} songs (sampled from ${totalRows.toLocaleString()}) · ${allGenres.length} genres`
  );

  // Show sidebar badge
  const badge = document.getElementById('sidebar-dataset-badge');
  if (badge) {
    badge.style.display = 'flex';
    document.getElementById('sidebar-badge-text').textContent =
      `${dataset.length.toLocaleString()} songs`;
  }

  updateDashboardMetrics();
  renderGenreEmotionMap();

  // Re-render correlation chart with live data if the page is active
  if (document.getElementById('page-correlation').classList.contains('active')) {
    renderCorrChart();
  } else {
    corrNeedsRefresh = true; // will refresh on next visit
  }

  // Re-populate genre dropdown in recommendation wizard
  populateGenreDropdown();

  // Update recommendation notice
  const notice = document.getElementById('reco-notice');
  if (notice) notice.classList.add('hidden');
}

// ── UI helpers for upload states ──

function showLoadStatus(msg) {
  document.getElementById('upload-zone').style.display  = 'none';
  document.getElementById('load-status').style.display  = 'flex';
  document.getElementById('load-done').style.display    = 'none';
  setLoadMsg(msg);
}
function setLoadMsg(msg) { document.getElementById('load-msg').textContent = msg; }

function showLoadDone(text) {
  document.getElementById('upload-zone').style.display  = 'none';
  document.getElementById('load-status').style.display  = 'none';
  document.getElementById('load-done').style.display    = 'flex';
  document.getElementById('load-done-text').textContent = text;
}

function resetToUpload() {
  document.getElementById('upload-zone').style.display  = '';
  document.getElementById('load-status').style.display  = 'none';
  document.getElementById('load-done').style.display    = 'none';
  document.getElementById('csv-input').value = '';
  dataLoaded = false;
  dataset = [];
  allGenres = [];
  currentSeed = null;
  document.getElementById('sidebar-dataset-badge').style.display = 'none';
  updateDashboardMetrics(); // restore static values
  renderGenreEmotionMap();
  populateGenreDropdown();
  corrNeedsRefresh = true;
  const notice = document.getElementById('reco-notice');
  if (notice) notice.classList.remove('hidden');
}


/* ══════════════════════════════════════════
   4. DASHBOARD — METRICS & GENRE MAP
══════════════════════════════════════════ */

function updateDashboardMetrics() {
  if (!dataLoaded) {
    // Restore static placeholder values
    document.getElementById('m-songs').textContent     = '232,725';
    document.getElementById('m-songs-sub').textContent = 'SpotifyFeatures.csv';
    document.getElementById('m-genres').textContent    = '27';
    document.getElementById('m-genres-sub').textContent= 'Across all clusters';
    document.getElementById('dynamic-stats').style.display = 'none';
    return;
  }

  const n = dataset.length;
  const avgValence      = avg(dataset, 'valence');
  const avgEnergy       = avg(dataset, 'energy');
  const avgDanceability = avg(dataset, 'danceability');

  document.getElementById('m-songs').textContent     = n.toLocaleString();
  document.getElementById('m-songs-sub').textContent = 'Sampled from full dataset';
  document.getElementById('m-genres').textContent    = allGenres.length;
  document.getElementById('m-genres-sub').textContent= 'Unique genres detected';

  document.getElementById('m-avg-valence').textContent = avgValence.toFixed(3);
  document.getElementById('m-avg-energy').textContent  = avgEnergy.toFixed(3);
  document.getElementById('m-avg-dance').textContent   = avgDanceability.toFixed(3);
  document.getElementById('dynamic-stats').style.display = 'grid';
}

// Simple mean of a numeric field across an array of objects
function avg(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((s, d) => s + d[key], 0) / arr.length;
}

// Render the Genre Emotion Map — computed from loaded dataset or static fallback
function renderGenreEmotionMap() {
  const container  = document.getElementById('genre-grid');
  const sourceTag  = document.getElementById('genre-map-source');

  if (!dataLoaded) {
    sourceTag.textContent = 'Static preview';
    sourceTag.classList.remove('live');
    container.classList.remove('many-genres');
    container.innerHTML = STATIC_GENRES.map(g => genreCardHTML(g)).join('');
    return;
  }

  // Compute per-genre averages from sample
  const byGenre = {};
  dataset.forEach(s => {
    if (!byGenre[s.genre]) byGenre[s.genre] = { valence: 0, energy: 0, danceability: 0, n: 0 };
    byGenre[s.genre].valence      += s.valence;
    byGenre[s.genre].energy       += s.energy;
    byGenre[s.genre].danceability += s.danceability;
    byGenre[s.genre].n++;
  });

  const genres = Object.entries(byGenre)
    .map(([genre, d]) => ({
      genre,
      valence:      d.valence / d.n,
      energy:       d.energy  / d.n,
      danceability: d.danceability / d.n,
    }))
    .sort((a, b) => a.genre.localeCompare(b.genre));

  sourceTag.textContent = `Live — ${genres.length} genres`;
  sourceTag.classList.add('live');
  container.classList.toggle('many-genres', genres.length > 8);
  container.innerHTML = genres.map(g => genreCardHTML(g)).join('');
}

// Returns the HTML for a single genre card (shared by static & live renders)
function genreCardHTML(g) {
  const valPct   = (g.valence * 100).toFixed(0);
  const engPct   = (g.energy  * 100).toFixed(0);
  const danPct   = (g.danceability * 100).toFixed(0);
  const valColor = g.valence > 0.55 ? 'var(--green)' : g.valence > 0.35 ? 'var(--yellow)' : 'var(--red)';
  return `
    <div class="genre-card">
      <div class="genre-name" title="${g.genre}">${g.genre}</div>
      <div class="genre-bars">
        <div class="genre-bar-row"><span>Valence</span><div class="bar-track"><div class="bar-fill" style="width:${valPct}%;background:${valColor}"></div></div><span>${valPct}%</span></div>
        <div class="genre-bar-row"><span>Energy</span><div class="bar-track"><div class="bar-fill" style="width:${engPct}%;background:var(--yellow)"></div></div><span>${engPct}%</span></div>
        <div class="genre-bar-row"><span>Dance</span><div class="bar-track"><div class="bar-fill" style="width:${danPct}%;background:var(--blue)"></div></div><span>${danPct}%</span></div>
      </div>
    </div>`;
}


/* ══════════════════════════════════════════
   5. CORRELATION EXPLORER
══════════════════════════════════════════ */

let corrNeedsRefresh = false;

// Static fallback correlation values (from the full-dataset analysis)
const STATIC_CORRELATIONS = [
  { label: 'Danceability vs Valence', key: ['danceability', 'valence'], value: 0.55 },
  { label: 'Energy vs Valence',       key: ['energy',       'valence'], value: 0.44 },
  { label: 'Loudness vs Valence',     key: ['loudness',     'valence'], value: 0.18 },
  { label: 'Tempo vs Valence',        key: ['tempo',        'valence'], value: 0.13 },
  { label: 'Acousticness vs Valence', key: ['acousticness', 'valence'], value: -0.33 },
];

// Pearson correlation coefficient between two numeric fields in an array of objects
function pearsonCorr(arr, keyA, keyB) {
  const n = arr.length;
  if (n < 2) return 0;
  let sumA = 0, sumB = 0;
  arr.forEach(d => { sumA += d[keyA]; sumB += d[keyB]; });
  const mA = sumA / n, mB = sumB / n;
  let num = 0, dA = 0, dB = 0;
  arr.forEach(d => {
    const da = d[keyA] - mA, db = d[keyB] - mB;
    num += da * db; dA += da * da; dB += db * db;
  });
  return dA * dB === 0 ? 0 : num / Math.sqrt(dA * dB);
}

// Render (or re-render) the correlation bar chart
function renderCorrChart() {
  const container = document.getElementById('corr-chart');
  const sourceTag = document.getElementById('corr-source-tag');
  container.innerHTML = '';

  let corrs;
  if (dataLoaded && dataset.length > 0) {
    corrs = [
      { label: 'Danceability vs Valence', value: pearsonCorr(dataset, 'danceability', 'valence') },
      { label: 'Energy vs Valence',       value: pearsonCorr(dataset, 'energy',       'valence') },
      { label: 'Tempo vs Valence',        value: pearsonCorr(dataset, 'tempo',        'valence') },
      { label: 'Acousticness vs Valence', value: pearsonCorr(dataset, 'acousticness', 'valence') },
      { label: 'Speechiness vs Valence',  value: pearsonCorr(dataset, 'speechiness',  'valence') },
    ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    sourceTag.textContent = `Live from ${dataset.length.toLocaleString()} songs`;
    sourceTag.classList.add('live');
  } else {
    corrs = STATIC_CORRELATIONS;
    sourceTag.textContent = 'Static values (load CSV for live)';
    sourceTag.classList.remove('live');
  }

  corrs.forEach(c => {
    const isPos   = c.value >= 0;
    const halfPct = (Math.abs(c.value) / 2) * 100; // each side is 50% of track width
    const row = document.createElement('div');
    row.className = 'corr-row';
    row.innerHTML = `
      <div class="corr-label">
        <span>${c.label}</span>
        <span>${c.value >= 0 ? '+' : ''}${c.value.toFixed(3)}</span>
      </div>
      <div class="corr-track">
        <div class="corr-zero"></div>
        <div class="corr-fill ${isPos ? 'pos' : 'neg'}" style="width:0" data-w="${halfPct}%"></div>
      </div>`;
    container.appendChild(row);
  });

  // Animate bars after a brief delay (allows the DOM to paint first)
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.corr-fill').forEach(el => { el.style.width = el.dataset.w; });
    }, 80);
  });

  corrNeedsRefresh = false;
}

// Entry-point called by navigation
function initCorrelationChart() {
  renderCorrChart();
}


/* ══════════════════════════════════════════
   6. RANDOM FOREST INSIGHTS (static)
══════════════════════════════════════════ */

const FEATURE_IMPORTANCE = [
  { label: 'Danceability',     value: 0.343 },
  { label: 'Energy',           value: 0.172 },
  { label: 'Speechiness',      value: 0.092 },
  { label: 'Tempo',            value: 0.088 },
  { label: 'Loudness',         value: 0.085 },
  { label: 'Acousticness',     value: 0.082 },
  { label: 'Liveness',         value: 0.078 },
  { label: 'Instrumentalness', value: 0.060 },
];

let forestInited = false;
function initForestChart() {
  if (forestInited) return;
  forestInited = true;

  const container = document.getElementById('fi-chart');
  container.innerHTML = '';

  FEATURE_IMPORTANCE.forEach((f, i) => {
    const pct   = (f.value / FEATURE_IMPORTANCE[0].value) * 100;
    const color = i === 0 ? 'var(--green)' : i < 3 ? 'var(--yellow)' : 'var(--blue)';
    const row = document.createElement('div');
    row.className = 'corr-row';
    row.innerHTML = `
      <div class="corr-label">
        <span>${f.label}</span>
        <span>${f.value.toFixed(3)}</span>
      </div>
      <div class="corr-track" style="overflow:hidden">
        <div class="corr-fill pos" style="width:0;background:${color};left:0" data-w="${pct}%"></div>
      </div>`;
    container.appendChild(row);
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.corr-fill').forEach(el => { el.style.width = el.dataset.w; });
    }, 80);
  });
}


/* ══════════════════════════════════════════
   7. K-MEANS VISUALIZATION (unchanged)
══════════════════════════════════════════ */

const CLUSTER_COLORS = ['#1db954','#f5a623','#4a90d9','#e040fb','#e04040','#00bcd4'];

let kmState = { points: [], centroids: [], assignments: [], k: 3, iteration: 0, converged: false };
let kmeansInited = false;

function initKmeans() {
  if (kmeansInited) return;
  kmeansInited = true;

  const slider = document.getElementById('k-slider');
  const kVal   = document.getElementById('k-value');
  slider.addEventListener('input', () => { kVal.textContent = slider.value; kmState.k = parseInt(slider.value); resetKmeans(); });
  document.getElementById('btn-regen').addEventListener('click', resetKmeans);
  document.getElementById('btn-step').addEventListener('click',  stepKmeans);
  document.getElementById('btn-run').addEventListener('click',   runFullKmeans);

  generatePoints();
  drawKmeans();
}

function generatePoints() {
  kmState.points = [];
  for (let i = 0; i < 120; i++) kmState.points.push({ x: Math.random(), y: Math.random() });
  kmState.centroids  = [];
  kmState.assignments = new Array(120).fill(0);
  kmState.iteration  = 0;
  kmState.converged  = false;
}

function resetKmeans() {
  generatePoints();
  placeCentroids();
  drawKmeans();
  setKStatus('Centroids placed. Click "Run Step" or "Run Full K-Means".');
}

function placeCentroids() {
  // K-Means++ initialisation for better starting positions
  kmState.centroids = [];
  const pts = kmState.points;
  let idx = Math.floor(Math.random() * pts.length);
  kmState.centroids.push({ x: pts[idx].x, y: pts[idx].y });

  for (let c = 1; c < kmState.k; c++) {
    const dists = pts.map(p => {
      let minD = Infinity;
      kmState.centroids.forEach(ce => { const d = kmDist(p, ce); if (d < minD) minD = d; });
      return minD * minD;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total, chosen = 0;
    for (let i = 0; i < dists.length; i++) { rand -= dists[i]; if (rand <= 0) { chosen = i; break; } }
    kmState.centroids.push({ x: pts[chosen].x, y: pts[chosen].y });
  }
  kmState.iteration = 0;
  kmState.converged = false;
}

function kmDist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

function assignPoints() {
  let changed = false;
  kmState.points.forEach((p, i) => {
    let minD = Infinity, best = 0;
    kmState.centroids.forEach((c, ci) => { const d = kmDist(p, c); if (d < minD) { minD = d; best = ci; } });
    if (kmState.assignments[i] !== best) changed = true;
    kmState.assignments[i] = best;
  });
  return changed;
}

function updateCentroids() {
  const sums = Array.from({ length: kmState.k }, () => ({ x: 0, y: 0, n: 0 }));
  kmState.points.forEach((p, i) => { const ci = kmState.assignments[i]; sums[ci].x += p.x; sums[ci].y += p.y; sums[ci].n++; });
  kmState.centroids = sums.map((s, i) => s.n > 0 ? { x: s.x / s.n, y: s.y / s.n } : kmState.centroids[i]);
}

function stepKmeans() {
  if (!kmState.centroids.length) { placeCentroids(); assignPoints(); drawKmeans(); setKStatus('Iteration 0: Centroids placed.'); return; }
  if (kmState.converged) { setKStatus('Converged. Click "Regenerate" to restart.'); return; }
  const changed = assignPoints();
  updateCentroids();
  kmState.iteration++;
  drawKmeans();
  if (!changed) { kmState.converged = true; setKStatus(`✓ Converged after ${kmState.iteration} iteration(s).`); }
  else          { setKStatus(`Iteration ${kmState.iteration}: Points reassigned & centroids updated.`); }
}

async function runFullKmeans() {
  if (!kmState.centroids.length) placeCentroids();
  kmState.converged = false; kmState.iteration = 0;
  for (let i = 0; i < 50; i++) {
    const changed = assignPoints();
    updateCentroids();
    kmState.iteration++;
    drawKmeans();
    setKStatus(`Running… iteration ${kmState.iteration}`);
    await sleep(80);
    if (!changed) { kmState.converged = true; setKStatus(`✓ Converged in ${kmState.iteration} iteration(s)! ${kmState.k} clusters.`); return; }
  }
  setKStatus('Stopped after 50 iterations.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function setKStatus(msg) { document.getElementById('kmeans-status').textContent = msg; }

function drawKmeans() {
  const canvas = document.getElementById('kmeans-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 30;
  const w = W - pad * 2, h = H - pad * 2;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#444';
  ctx.font = '11px sans-serif';
  ctx.fillText('← Danceability →', W / 2 - 55, H - 6);
  ctx.save(); ctx.translate(10, H / 2 + 40); ctx.rotate(-Math.PI / 2);
  ctx.fillText('← Energy →', 0, 0); ctx.restore();

  const toX = x => pad + x * w;
  const toY = y => pad + (1 - y) * h;

  kmState.points.forEach((p, i) => {
    const ci = kmState.assignments[i] ?? 0;
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.y), 4, 0, Math.PI * 2);
    ctx.fillStyle = (kmState.centroids.length > 0 ? CLUSTER_COLORS[ci % CLUSTER_COLORS.length] : '#555') + 'cc';
    ctx.fill();
  });

  kmState.centroids.forEach((c, ci) => {
    drawStar(ctx, toX(c.x), toY(c.y), 5, 12, 5, CLUSTER_COLORS[ci % CLUSTER_COLORS.length]);
    ctx.beginPath();
    ctx.arc(toX(c.x), toY(c.y), 14, 0, Math.PI * 2);
    ctx.strokeStyle = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];
    ctx.lineWidth = 1; ctx.stroke();
  });
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR); rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR); rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
}


/* ══════════════════════════════════════════
   8. RECOMMENDATION ENGINE
══════════════════════════════════════════ */

let recoInited = false;
let currentMood   = 'happy';
let currentEnergy = 'medium';
let currentDance  = 'medium';
let autocompleteDebounce = null;

function initRecommendation() {
  if (recoInited) return;
  recoInited = true;

  // Mood buttons
  document.querySelectorAll('#mood-select .mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mood-select .mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMood = btn.dataset.mood;
      updateTargetPreview();
    });
  });

  // Energy level buttons
  document.querySelectorAll('#energy-select .level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#energy-select .level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEnergy = btn.dataset.level;
      updateTargetPreview();
    });
  });

  // Danceability level buttons
  document.querySelectorAll('#dance-select .level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dance-select .level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDance = btn.dataset.level;
      updateTargetPreview();
    });
  });

  // Seed song input (autocomplete)
  const seedInput = document.getElementById('seed-input');
  seedInput.addEventListener('input', () => {
    clearTimeout(autocompleteDebounce);
    autocompleteDebounce = setTimeout(() => handleSeedInput(seedInput.value), 280);
  });
  seedInput.addEventListener('focus', () => {
    if (seedInput.value.length >= 2) handleSeedInput(seedInput.value);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.seed-search-wrap')) closeAutocomplete();
  });

  // Remove seed chip
  document.getElementById('seed-chip-remove').addEventListener('click', clearSeed);

  // Find button
  document.getElementById('btn-find').addEventListener('click', runRecommendation);

  // Populate genre dropdown if data already loaded
  if (dataLoaded) populateGenreDropdown();

  updateTargetPreview();
}

// Populate the genre <select> from loaded dataset genres
function populateGenreDropdown() {
  const sel = document.getElementById('genre-select');
  if (!sel) return;
  // Keep "Any genre" option, replace the rest
  sel.innerHTML = '<option value="">Any genre</option>';
  allGenres.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    sel.appendChild(opt);
  });
}

// Builds the target audio feature vector from current wizard selections
function buildTarget() {
  const base = MOOD_PROFILES[currentMood];
  const target = {
    valence:      base.valence,
    energy:       LEVEL_MAP[currentEnergy],
    danceability: LEVEL_MAP[currentDance],
    tempoNorm:    base.tempoNorm,
    acousticness: base.acousticness,
    speechiness:  base.speechiness,
  };

  // If a seed song is selected, blend its features 50/50 with the mood target
  if (currentSeed) {
    const blend = 0.5;
    target.valence      = lerp(target.valence,      currentSeed.valence,      blend);
    target.energy       = lerp(target.energy,       currentSeed.energy,       blend);
    target.danceability = lerp(target.danceability, currentSeed.danceability, blend);
    target.tempoNorm    = lerp(target.tempoNorm,    currentSeed.tempoNorm,    blend);
    target.acousticness = lerp(target.acousticness, currentSeed.acousticness, blend);
    target.speechiness  = lerp(target.speechiness,  currentSeed.speechiness,  blend);
  }

  return target;
}

function lerp(a, b, t) { return a * (1 - t) + b * t; }

// Live-update the target profile preview bars
function updateTargetPreview() {
  const target  = buildTarget();
  const keys    = ['valence', 'energy', 'danceability', 'tempoNorm', 'acousticness', 'speechiness'];
  const labels  = ['Valence', 'Energy', 'Dance', 'Tempo', 'Acoustic', 'Speech'];
  const colors  = ['var(--green)', 'var(--yellow)', 'var(--blue)', 'var(--purple)', '#aaa', '#f06'];
  const preview = document.getElementById('target-profile-preview');
  if (!preview) return;
  preview.innerHTML = keys.map((k, i) => `
    <div class="fp-item">
      <div class="fp-label">${labels[i]}</div>
      <div class="fp-bar-wrap"><div class="fp-bar" style="width:${(target[k]*100).toFixed(0)}%;background:${colors[i]}"></div></div>
      <div class="fp-val">${target[k].toFixed(2)}</div>
    </div>`).join('');
}

// Weighted Euclidean distance-based similarity score (returns 0–1; higher = better)
function scoreCandidate(song, target) {
  let dist = 0;
  dist += WEIGHTS.valence      * (song.valence      - target.valence)      ** 2;
  dist += WEIGHTS.energy       * (song.energy       - target.energy)       ** 2;
  dist += WEIGHTS.danceability * (song.danceability - target.danceability) ** 2;
  dist += WEIGHTS.tempoNorm    * (song.tempoNorm    - target.tempoNorm)    ** 2;
  dist += WEIGHTS.acousticness * (song.acousticness - target.acousticness) ** 2;
  dist += WEIGHTS.speechiness  * (song.speechiness  - target.speechiness)  ** 2;
  // Convert distance (max possible = TOTAL_WEIGHT when all diffs = 1) to similarity
  return 1 - Math.sqrt(dist / TOTAL_WEIGHT);
}

// Generate a natural-language reason string for a recommendation
function buildReasonText(song, target) {
  const matches = [];
  if (Math.abs(song.valence      - target.valence)      < 0.15) matches.push('valence');
  if (Math.abs(song.danceability - target.danceability) < 0.15) matches.push('danceability');
  if (Math.abs(song.energy       - target.energy)       < 0.15) matches.push('energy');
  if (Math.abs(song.acousticness - target.acousticness) < 0.15) matches.push('acousticness');
  if (matches.length === 0) return 'Recommended based on overall audio feature similarity.';
  return `Closely matches your target ${matches.join(' and ')}.`;
}

// Main recommendation function — returns top-N songs from dataset or mock fallback
function getRecommendations(n = 10) {
  const target = buildTarget();
  const genre  = document.getElementById('genre-select') ? document.getElementById('genre-select').value : '';

  let pool;
  if (dataLoaded && dataset.length > 0) {
    pool = dataset.filter(s => {
      if (currentSeed && s.track === currentSeed.track && s.artist === currentSeed.artist) return false;
      if (genre && s.genre !== genre) return false;
      return true;
    });
  } else {
    // Merge all mock song lists and filter by mood proximity
    pool = Object.values(MOCK_SONGS).flat().map(s => ({
      ...s,
      tempoNorm: Math.min(s.tempo / 250, 1),
    }));
  }

  if (pool.length === 0) return [];

  // Score and sort
  const scored = pool.map(s => ({ ...s, score: scoreCandidate(s, target) }));
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by (track, artist) in case of repeated entries
  const seen = new Set();
  const unique = [];
  for (const s of scored) {
    const key = `${s.track}|||${s.artist}`;
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
    if (unique.length >= n) break;
  }
  return unique.map(s => ({ ...s, reason: buildReasonText(s, target) }));
}

// Render the top-10 recommendation cards
function renderRecoResults(songs) {
  const grid  = document.getElementById('reco-grid');
  const area  = document.getElementById('reco-results-area');
  const sub   = document.getElementById('reco-result-subtitle');
  const genre = document.getElementById('genre-select') ? document.getElementById('genre-select').value : '';

  sub.textContent = [
    `Mood: ${currentMood}`,
    `Energy: ${currentEnergy}`,
    `Dance: ${currentDance}`,
    genre ? `Genre: ${genre}` : null,
    currentSeed ? `Seed: "${currentSeed.track}"` : null,
    dataLoaded ? `(from ${dataset.length.toLocaleString()} songs)` : '(demo data)',
  ].filter(Boolean).join(' · ');

  grid.innerHTML = songs.map((s, i) => `
    <div class="reco-card">
      <div class="reco-rank">#${i + 1}</div>
      <div class="reco-track" title="${escHtml(s.track)}">${escHtml(s.track)}</div>
      <div class="reco-artist">${escHtml(s.artist)}</div>
      <div class="reco-genre">${escHtml(s.genre)}</div>

      <div class="reco-score">
        <div class="score-label">Match</div>
        <div class="score-bar-wrap"><div class="score-bar-fill" style="width:${(s.score * 100).toFixed(0)}%"></div></div>
        <div class="score-val">${(s.score * 100).toFixed(0)}%</div>
      </div>

      <div class="reco-stats">
        ${statRow('Valence',   s.valence,      valenceColor(s.valence), s.valence.toFixed(2))}
        ${statRow('Energy',    s.energy,       'var(--yellow)',          s.energy.toFixed(2))}
        ${statRow('Dance',     s.danceability, 'var(--blue)',            s.danceability.toFixed(2))}
        ${statRow('Tempo',     null,           null,                     `${Math.round(s.tempo)} BPM`)}
      </div>

      <div class="reco-reason">${s.reason}</div>
    </div>`).join('');

  area.style.display = '';
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Called when "Find Recommendations" is clicked
function runRecommendation() {
  const songs = getRecommendations(10);
  if (songs.length === 0) {
    document.getElementById('reco-results-area').style.display = 'none';
    alert('No songs matched your filters. Try a different genre or remove the genre filter.');
    return;
  }
  renderRecoResults(songs);
}

// ── Autocomplete helpers ──

function handleSeedInput(query) {
  const q = query.trim().toLowerCase();
  if (!dataLoaded || q.length < 2) { closeAutocomplete(); return; }

  const matches = [];
  for (const s of dataset) {
    if (s.track.toLowerCase().includes(q)) {
      matches.push(s);
      if (matches.length >= 8) break;
    }
  }

  if (matches.length === 0) { closeAutocomplete(); return; }
  showAutocomplete(matches);
}

function showAutocomplete(matches) {
  const list = document.getElementById('autocomplete-list');
  list.innerHTML = matches.map((s, i) => `
    <div class="autocomplete-item" data-idx="${i}">
      <strong>${escHtml(s.track)}</strong>
      <small>${escHtml(s.artist)} · ${escHtml(s.genre)}</small>
    </div>`).join('');

  list.querySelectorAll('.autocomplete-item').forEach((el, i) => {
    el.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent input blur before click fires
      selectSeed(matches[i]);
    });
  });

  // Store matches on list element so keyboard navigation can access them
  list._matches = matches;
  list.style.display = '';
}

function closeAutocomplete() {
  const list = document.getElementById('autocomplete-list');
  list.style.display = 'none';
  list.innerHTML = '';
}

function selectSeed(song) {
  currentSeed = song;
  document.getElementById('seed-input').value = '';
  closeAutocomplete();
  document.getElementById('seed-chip-label').textContent = `${song.track} — ${song.artist}`;
  document.getElementById('seed-chip').style.display = '';
  updateTargetPreview();
}

function clearSeed() {
  currentSeed = null;
  document.getElementById('seed-chip').style.display = 'none';
  updateTargetPreview();
}

// ── Stat row helpers ──

function statRow(label, val, color, displayText) {
  if (val === null) {
    // Text-only row (e.g. Tempo in BPM)
    return `<div class="reco-stat-row">
      <div class="reco-stat-label">${label}</div>
      <div class="reco-stat-bar"></div>
      <div class="reco-stat-val">${displayText}</div>
    </div>`;
  }
  return `<div class="reco-stat-row">
    <div class="reco-stat-label">${label}</div>
    <div class="reco-stat-bar"><div class="reco-stat-fill" style="width:${(val*100).toFixed(0)}%;background:${color}"></div></div>
    <div class="reco-stat-val">${displayText}</div>
  </div>`;
}

function valenceColor(v) {
  return v >= 0.65 ? 'var(--green)' : v >= 0.35 ? 'var(--yellow)' : 'var(--red)';
}

// Prevent XSS in user-data strings rendered into innerHTML
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ══════════════════════════════════════════
   9. NAVIGATION
══════════════════════════════════════════ */

function navigateTo(pageId) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === pageId);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + pageId);
  });
  onPageEnter(pageId);
}

function onPageEnter(pageId) {
  if (pageId === 'correlation') {
    if (corrNeedsRefresh || !document.getElementById('corr-chart').children.length) renderCorrChart();
    else initCorrelationChart();
  }
  if (pageId === 'forest')         initForestChart();
  if (pageId === 'kmeans')         initKmeans();
  if (pageId === 'recommendation') initRecommendation();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});


/* ══════════════════════════════════════════
   INIT ON LOAD
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  initFileUpload();
  renderGenreEmotionMap(); // static fallback on initial load
});
