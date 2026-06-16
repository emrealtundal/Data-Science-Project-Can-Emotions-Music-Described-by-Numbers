// ============================================================
// K-Means Clustering Visualizer
//
// K-Means groups N data points into K clusters by repeating
// two steps until nothing changes:
//   Step 1 — Assign:  each point → nearest centroid
//   Step 2 — Move:    each centroid → mean of its points
//
// Convergence: when no point changes cluster in Step 1.
// ============================================================

// Up to 6 distinct cluster colors (red, blue, green, amber, purple, cyan)
const CLUSTER_COLORS = ['#e74c3c', '#2563eb', '#16a34a', '#f59e0b', '#9b59b6', '#0891b2'];

// ---- Canvas ----
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

// ---- Algorithm state ----
let points        = [];     // [{x, y}]  — the data points
let centroids     = [];     // [{x, y}]  — current centroid positions
let prevCentroids = [];     // [{x, y}]  — positions before the last move (for arrows)
let assignments   = [];     // [int]     — cluster index per point (-1 = unassigned)
let k             = 3;      // number of clusters chosen by the user
let phase         = 'ready'; // 'ready' | 'assigned' | 'moved' | 'converged'
let iterationCount = 0;
let isRunning      = false;  // true while the animated "Run Full" is active

// ---- DOM elements ----
const kSlider         = document.getElementById('k-slider');
const kValueDisplay   = document.getElementById('k-value');
const btnRegenerate   = document.getElementById('btn-regenerate');
const btnStep         = document.getElementById('btn-step');
const btnRun          = document.getElementById('btn-run');
const phaseBadge      = document.getElementById('phase-badge');
const stepLabel       = document.getElementById('step-label');
const iterationDisplay = document.getElementById('iteration-count');
const statusDetail    = document.getElementById('status-detail');
const legendEl        = document.getElementById('legend');

// ============================================================
// Canvas Sizing
// Fit the canvas to its container width; height is 55% of the
// viewport so it stays large on any screen.
// ============================================================
function resizeCanvas() {
    const container = document.querySelector('.canvas-area');
    canvas.width  = container.clientWidth - 8;
    canvas.height = Math.max(360, Math.min(520, Math.floor(window.innerHeight * 0.55)));
    draw();
}

window.addEventListener('resize', resizeCanvas);

// ============================================================
// Gaussian Random (Box-Muller transform)
// Produces a normally distributed value around `mean` with
// the given standard deviation. Used to create natural-looking
// point clusters instead of uniform random scatter.
// ============================================================
function gaussRand(mean, std) {
    const u = Math.max(1e-10, Math.random()); // avoid log(0)
    const v = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ============================================================
// Generate Points
// Creates 80 points scattered around 3–5 random natural centers
// so the data looks realistic and forms visible clusters.
// ============================================================
function generatePoints() {
    const N       = 80;
    const padding = 50;
    const w = canvas.width  - padding * 2;
    const h = canvas.height - padding * 2;

    // Random "ground-truth" cluster centers (hidden from the algorithm)
    const numNatural = 3 + Math.floor(Math.random() * 3); // 3-5
    const centers = Array.from({ length: numNatural }, () => ({
        x: padding + Math.random() * w,
        y: padding + Math.random() * h
    }));

    // Distribute points around each center with Gaussian spread
    points = Array.from({ length: N }, (_, i) => {
        const c = centers[i % numNatural];
        return {
            x: Math.max(padding / 2, Math.min(canvas.width  - padding / 2, gaussRand(c.x, 38))),
            y: Math.max(padding / 2, Math.min(canvas.height - padding / 2, gaussRand(c.y, 38)))
        };
    });

    resetAlgorithm();
}

// ============================================================
// Reset Algorithm
// Keeps the same points; re-initializes centroids and all state.
// Called on first load, when K changes, and on Regenerate.
// ============================================================
function resetAlgorithm() {
    assignments    = new Array(points.length).fill(-1); // -1 = unassigned
    iterationCount = 0;
    phase          = 'ready';
    isRunning      = false;

    initializeCentroids();
    updateLegend();
    setUI('ready', 'Press "Run Step" to begin', 'Centroids placed at random starting positions.');
    updateButtonStates();
    draw();
}

// ============================================================
// Initialize Centroids
// Picks K distinct data points as the starting centroid positions.
// (K-Means++ would choose these more carefully, but random
//  initialization is simpler and fine for visualization.)
// ============================================================
function initializeCentroids() {
    const chosen = new Set();
    centroids     = [];
    prevCentroids = [];

    while (centroids.length < k) {
        const idx = Math.floor(Math.random() * points.length);
        if (!chosen.has(idx)) {
            chosen.add(idx);
            centroids.push({ x: points[idx].x, y: points[idx].y });
        }
    }
    prevCentroids = centroids.map(c => ({ ...c }));
}

// ============================================================
// Step 1 — Assign Points
// Each point is assigned to whichever centroid is closest
// (measured with squared Euclidean distance — sqrt not needed
//  for comparison, so this is slightly faster).
// Returns true if any assignment changed (i.e. not converged).
// ============================================================
function assignPoints() {
    let changed = false;

    for (let i = 0; i < points.length; i++) {
        let best = 0, bestDist = Infinity;

        for (let j = 0; j < k; j++) {
            const dx = points[i].x - centroids[j].x;
            const dy = points[i].y - centroids[j].y;
            const d  = dx * dx + dy * dy; // squared distance

            if (d < bestDist) { bestDist = d; best = j; }
        }

        if (assignments[i] !== best) {
            assignments[i] = best;
            changed = true;
        }
    }

    return changed;
}

// ============================================================
// Step 2 — Move Centroids
// Each centroid moves to the arithmetic mean (x̄, ȳ) of all
// points currently assigned to it.
// If a cluster is empty (rare), the centroid stays put.
// ============================================================
function moveCentroids() {
    prevCentroids = centroids.map(c => ({ ...c })); // save for drawing arrows

    for (let j = 0; j < k; j++) {
        const cluster = points.filter((_, i) => assignments[i] === j);

        if (cluster.length > 0) {
            centroids[j] = {
                x: cluster.reduce((s, p) => s + p.x, 0) / cluster.length,
                y: cluster.reduce((s, p) => s + p.y, 0) / cluster.length
            };
        }
    }
}

// ============================================================
// Run Step  (one half-iteration — educational mode)
// The button alternates between "Step 1: Assign" and
// "Step 2: Move" so the user can observe each phase.
// ============================================================
function runStep() {
    if (isRunning || phase === 'converged') return;

    if (phase === 'ready' || phase === 'moved') {
        // ---- Step 1: Assign each point to its nearest centroid ----
        const changed = assignPoints();
        phase = 'assigned';

        if (!changed && iterationCount > 0) {
            // No assignments changed → stable → converged
            phase = 'converged';
            setUI('converged', '✅ Converged!',
                `Algorithm converged after ${iterationCount} iteration(s). Assignments are stable.`);
        } else {
            setUI('assign', 'Step 1: Assign points to nearest centroid',
                'Each point is now colored by the centroid closest to it.');
        }

    } else if (phase === 'assigned') {
        // ---- Step 2: Move each centroid to the mean of its cluster ----
        moveCentroids();
        iterationCount++;
        phase = 'moved';

        setUI('move', 'Step 2: Move centroids to cluster average',
            `Centroids moved to the mean position of their assigned points. (Iteration ${iterationCount})`);
    }

    updateButtonStates();
    draw();
}

// ============================================================
// Run Full K-Means  (animated to convergence)
// Cycles through Step 1 → Step 2 with a short pause between
// each so the user can watch the algorithm converge.
// ============================================================
async function runFull() {
    if (isRunning || phase === 'converged') return;

    isRunning = true;
    updateButtonStates();

    const MAX_ITER = 50; // safety cap to prevent infinite loops

    while (phase !== 'converged' && iterationCount < MAX_ITER) {

        // Step 1: Assign
        if (phase === 'ready' || phase === 'moved') {
            const changed = assignPoints();
            phase = 'assigned';

            if (!changed && iterationCount > 0) {
                phase = 'converged';
                break;
            }

            setUI('assign', 'Step 1: Assign points to nearest centroid', '');
            updateButtonStates();
            draw();
            await pause(350);
        }

        // Step 2: Move
        if (phase === 'assigned') {
            moveCentroids();
            iterationCount++;
            phase = 'moved';

            setUI('move', 'Step 2: Move centroids to cluster average', '');
            updateButtonStates();
            draw();
            await pause(350);
        }
    }

    // Final state
    if (phase !== 'converged') phase = 'converged';
    setUI('converged', '✅ Converged!', `Done! Converged in ${iterationCount} iteration(s).`);
    isRunning = false;
    updateButtonStates();
    draw();
}

// Simple promise-based delay used between animation frames
function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Drawing
// ============================================================
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    // Dashed movement arrows: shown right after centroids move
    // so the user can see how far each centroid travelled.
    if (phase === 'moved') {
        for (let j = 0; j < k; j++) {
            const from = prevCentroids[j];
            const to   = centroids[j];
            if (Math.hypot(to.x - from.x, to.y - from.y) > 2) {
                ctx.save();
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = CLUSTER_COLORS[j] + '77'; // semi-transparent
                ctx.lineWidth   = 1.8;
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // Draw all data points
    for (let i = 0; i < points.length; i++) {
        const color = assignments[i] === -1
            ? '#cbd5e1'                        // gray  = not yet assigned
            : CLUSTER_COLORS[assignments[i]];  // color = cluster membership
        drawPoint(points[i].x, points[i].y, color);
    }

    // Draw centroids on top of the points
    for (let j = 0; j < centroids.length; j++) {
        drawCentroid(centroids[j].x, centroids[j].y, CLUSTER_COLORS[j], j + 1);
    }
}

// Subtle background grid
function drawGrid() {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth   = 1;
    const step = 60;

    for (let x = 0; x <= canvas.width;  x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

// A data point: filled circle with white outline
function drawPoint(x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
}

// A centroid: colored X inside a white halo circle, with cluster label above
function drawCentroid(x, y, color, label) {
    const arm = 11; // half-length of the X arms

    // White halo provides contrast against nearby points
    ctx.beginPath();
    ctx.arc(x, y, arm + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();

    // Colored ring border
    ctx.beginPath();
    ctx.arc(x, y, arm + 5, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // X shape
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x - arm, y - arm); ctx.lineTo(x + arm, y + arm);
    ctx.moveTo(x + arm, y - arm); ctx.lineTo(x - arm, y + arm);
    ctx.stroke();
    ctx.restore();

    // "C1", "C2" … label above the centroid
    ctx.fillStyle    = color;
    ctx.font         = 'bold 12px Segoe UI, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`C${label}`, x, y - arm - 7);
}

// ============================================================
// UI Helpers
// ============================================================

// Update the phase badge, step label, iteration counter, and detail text
function setUI(phaseKey, label, detail) {
    const labels = { ready: 'Ready', assign: 'Step 1', move: 'Step 2', converged: 'Done ✓' };
    phaseBadge.textContent = labels[phaseKey] || phaseKey;
    phaseBadge.className   = 'phase-badge';
    if (phaseKey === 'assign')    phaseBadge.classList.add('phase-assign');
    if (phaseKey === 'move')      phaseBadge.classList.add('phase-move');
    if (phaseKey === 'converged') phaseBadge.classList.add('phase-converged');

    stepLabel.textContent         = label;
    iterationDisplay.textContent  = `Iteration: ${iterationCount}`;
    if (detail) statusDetail.textContent = detail;
}

// Disable/enable buttons and update the step button's label
function updateButtonStates() {
    const done = phase === 'converged';

    btnRegenerate.disabled = isRunning;
    kSlider.disabled       = isRunning;
    btnRun.disabled        = done || isRunning;
    btnStep.disabled       = done || isRunning;

    // Make the step button predictive: show what clicking it will do
    if (done) {
        btnStep.textContent = '✅ Converged';
    } else if (phase === 'ready' || phase === 'moved') {
        btnStep.textContent = '▶ Step 1: Assign';
    } else if (phase === 'assigned') {
        btnStep.textContent = '▶ Step 2: Move';
    }
}

// Rebuild the cluster color legend when K changes
function updateLegend() {
    legendEl.innerHTML = '';
    for (let j = 0; j < k; j++) {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML =
            `<span class="legend-color" style="background:${CLUSTER_COLORS[j]}"></span>Cluster ${j + 1}`;
        legendEl.appendChild(item);
    }
}

// ============================================================
// Event Listeners
// ============================================================

kSlider.addEventListener('input', () => {
    k = parseInt(kSlider.value);
    kValueDisplay.textContent = k;
    resetAlgorithm(); // re-run with new K, keeping the same points
});

btnRegenerate.addEventListener('click', generatePoints);
btnStep.addEventListener('click', runStep);
btnRun.addEventListener('click', runFull);

// ============================================================
// Startup
// ============================================================
resizeCanvas();   // size canvas to fit its container
generatePoints(); // create initial points and draw
