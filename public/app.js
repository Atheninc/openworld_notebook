// DOM elements
const mapSelect = document.getElementById('map-select');
const layerSelect = document.getElementById('layer-select');
const typeFilter = document.getElementById('type-filter');

const newMapName = document.getElementById('new-map-name');
const newMapImage = document.getElementById('new-map-image');
const createMapBtn = document.getElementById('create-map-btn');

const newLayerName = document.getElementById('new-layer-name');
const createLayerBtn = document.getElementById('create-layer-btn');

const mapWrapper = document.getElementById('map-wrapper');
const mapInner = document.getElementById('map-inner');
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas.getContext('2d');
const markersLayer = document.getElementById('markers-layer');
const mapContainer = document.querySelector('.map-container');

const annotForm = document.getElementById('annotation-form');
const annotIdInput = document.getElementById('annot-id');
const annotTitle = document.getElementById('annot-title');
const annotType = document.getElementById('annot-type');
const annotDesc = document.getElementById('annot-description');
const annotUnlocked = document.getElementById('annot-unlocked');
const annotTags = document.getElementById('annot-tags');
const annotRefs = document.getElementById('annot-refs');
const deleteAnnotBtn = document.getElementById('delete-annot-btn');

const annotationsList = document.getElementById('annotations-list');

// Upload map
const dropZone = document.getElementById('drop-zone');
const mapFileInput = document.getElementById('map-file-input');

// Shapes
const shapeNameInput = document.getElementById('shape-name');
const shapeStyleSelect = document.getElementById('shape-style');
const startShapeBtn = document.getElementById('start-shape-btn');
const finishShapeBtn = document.getElementById('finish-shape-btn');
const shapesList = document.getElementById('shapes-list');

// Paths
const pathNameInput = document.getElementById('path-name');
const startPathBtn = document.getElementById('start-path-btn');
const finishPathBtn = document.getElementById('finish-path-btn');
const pathsList = document.getElementById('paths-list');

// Import/Export
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');

// State
let currentMap = null;
let currentAnnotations = [];
let selectedAnnotationId = null;
let lastClickPosition = null; // {x,y} (0..1)
let draggingAnnotation = null;

let drawingShape = false;
let currentShapePoints = []; // [{x,y}]
let currentShapes = [];
let selectedShapeId = null; // shape sélectionnée
let draggingShapePoint = null; // { shapeId, pointIndex }

let drawingPath = false;
let currentPathPoints = []; // [{x,y}]
let currentPaths = [];
let selectedPathId = null; // path sélectionné
let draggingPathPoint = null; // { pathId, pointIndex }

// Canvas image
let mapImageObj = null;
let mapImageLoaded = false;

// Zoom / pan (appliqué sur mapInner via transform)
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffsetStart = { x: 0, y: 0 };

// --- Helpers API ---
async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
        headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        console.error('Erreur API', res.status, await res.text());
        throw new Error('Erreur API');
    }
    return res.json();
}

// --- Transform / zoom ---
function updateTransform() {
    mapInner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
}

// --- Canvas sizing ---
function resizeCanvas() {
    const rect = mapWrapper.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;
    mapCanvas.width = width;
    mapCanvas.height = height;
    drawMapCanvas();
}

window.addEventListener('resize', resizeCanvas);

// --- Image de la map ---
function setMapImage(src) {
    console.log('setMapImage src =', src);
    mapImageLoaded = false;
    mapImageObj = new Image();

    // très important sur certains navigateurs si tu héberges ailleurs
    mapImageObj.crossOrigin = 'anonymous';

    mapImageObj.onload = () => {
        console.log('Image de map chargée :', mapImageObj.width, 'x', mapImageObj.height);
        mapImageLoaded = true;
        // on resize le canvas APRÈS avoir l'image,
        // comme ça la première fois on a bien une zone de dessin correcte
        resizeCanvas();
    };

    mapImageObj.onerror = (err) => {
        console.error('Erreur de chargement de la map :', err);
    };

    // s'il manque le slash de début, on le rajoute
    if (src && !src.startsWith('/')) {
        src = '/' + src;
    }

    mapImageObj.src = src;
}

// --- Dessin canvas (map + shapes) ---
function drawMapCanvas() {
    const cw = mapCanvas.width;
    const ch = mapCanvas.height;
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);
    mapCtx.clearRect(0, 0, cw, ch);

    if (!mapImageLoaded) {
        // petit fond pour voir qu'il se passe quelque chose
        mapCtx.fillStyle = '#222';
        mapCtx.fillRect(0, 0, cw, ch);
        return;
    }

    // Dessiner la map en conservant le ratio
    const imgW = mapImageObj.width;
    const imgH = mapImageObj.height;
    const imgRatio = imgW / imgH;
    const canvasRatio = cw / ch;

    let drawW, drawH, drawX, drawY;

    if (canvasRatio > imgRatio) {
        // canvas plus "large" -> adapter la hauteur
        drawH = ch;
        drawW = ch * imgRatio;
        drawX = (cw - drawW) / 2;
        drawY = 0;
    } else {
        // canvas plus "haut" -> adapter la largeur
        drawW = cw;
        drawH = cw / imgRatio;
        drawX = 0;
        drawY = (ch - drawH) / 2;
    }

    mapCtx.drawImage(mapImageObj, drawX, drawY, drawW, drawH);

    // Shapes existants
    mapCtx.lineWidth = 2;
    currentShapes.forEach(s => {
        const pts = s.shape;
        if (!pts || pts.length < 2) return;

        mapCtx.beginPath();
        pts.forEach((p, i) => {
            const x = p.x * cw;
            const y = p.y * ch;
            if (i === 0) mapCtx.moveTo(x, y);
            else mapCtx.lineTo(x, y);
        });
        mapCtx.closePath();

        const style = (s.meta && s.meta.style) || 'filled';
        
        if (s.id === selectedShapeId) {
            mapCtx.fillStyle = 'rgba(255, 255, 255, 0.10)';
            mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        } else {
            mapCtx.fillStyle = 'rgba(66, 165, 245, 0.18)';
            mapCtx.strokeStyle = 'rgba(144, 202, 249, 1)';
        }

        // Appliquer le style
        if (style === 'dashed') {
            mapCtx.setLineDash([8, 4]);
        } else if (style === 'hatched') {
            mapCtx.setLineDash([2, 4]);
        } else {
            mapCtx.setLineDash([]);
        }

        if (style !== 'dashed' && style !== 'hatched') {
            mapCtx.fill();
        }
        mapCtx.stroke();
        mapCtx.setLineDash([]);
    });

    // Dessiner les "coins" de la shape sélectionnée
    if (selectedShapeId) {
        const shape = currentShapes.find(s => s.id === selectedShapeId);
        if (shape && shape.shape && shape.shape.length) {
            const handleRadius = 6;
            mapCtx.fillStyle = '#ffeb3b';
            mapCtx.strokeStyle = '#000';

            shape.shape.forEach(p => {
                const x = p.x * cw;
                const y = p.y * ch;
                mapCtx.beginPath();
                mapCtx.arc(x, y, handleRadius, 0, Math.PI * 2);
                mapCtx.fill();
                mapCtx.stroke();
            });
        }
    }

    // Dessin en cours (shape en cours de création)
    if (drawingShape && currentShapePoints.length >= 2) {
        mapCtx.beginPath();
        currentShapePoints.forEach((p, i) => {
            const x = p.x * cw;
            const y = p.y * ch;
            if (i === 0) mapCtx.moveTo(x, y);
            else mapCtx.lineTo(x, y);
        });
        mapCtx.strokeStyle = 'rgba(144, 202, 249, 0.8)';
        mapCtx.setLineDash([4, 2]);
        mapCtx.stroke();
        mapCtx.setLineDash([]);
    }

    // Paths existants
    mapCtx.lineWidth = 3;
    currentPaths.forEach(p => {
        const pts = p.path;
        if (!pts || pts.length < 2) return;

        mapCtx.beginPath();
        pts.forEach((pt, i) => {
            const x = pt.x * cw;
            const y = pt.y * ch;
            if (i === 0) mapCtx.moveTo(x, y);
            else mapCtx.lineTo(x, y);
        });

        if (p.id === selectedPathId) {
            mapCtx.strokeStyle = 'rgba(255, 193, 7, 0.9)';
        } else {
            mapCtx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
        }

        mapCtx.stroke();
    });

    // Dessin en cours (path en cours de création)
    if (drawingPath && currentPathPoints.length >= 1) {
        mapCtx.beginPath();
        currentPathPoints.forEach((p, i) => {
            const x = p.x * cw;
            const y = p.y * ch;
            if (i === 0) mapCtx.moveTo(x, y);
            else mapCtx.lineTo(x, y);
        });
        mapCtx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
        mapCtx.setLineDash([6, 3]);
        mapCtx.stroke();
        mapCtx.setLineDash([]);

        // Dessiner les points du chemin
        currentPathPoints.forEach(p => {
            const x = p.x * cw;
            const y = p.y * ch;
            mapCtx.fillStyle = 'rgba(76, 175, 80, 1)';
            mapCtx.beginPath();
            mapCtx.arc(x, y, 4, 0, Math.PI * 2);
            mapCtx.fill();
        });
    }

    // Dessiner les "coins" du path sélectionné
    if (selectedPathId) {
        const path = currentPaths.find(p => p.id === selectedPathId);
        if (path && path.path && path.path.length) {
            const handleRadius = 6;
            mapCtx.fillStyle = '#ffeb3b';
            mapCtx.strokeStyle = '#000';

            path.path.forEach(p => {
                const x = p.x * cw;
                const y = p.y * ch;
                mapCtx.beginPath();
                mapCtx.arc(x, y, handleRadius, 0, Math.PI * 2);
                mapCtx.fill();
                mapCtx.stroke();
            });
        }
    }
}

// --- Coordonnées relatives (0..1) ---
function getRelativeCoordsFromEvent(e) {
    const rect = mapCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
}

// --- Helper : handle de shape sous la souris ---
function getHandleAtCoords(relCoords) {
    if (!selectedShapeId) return null;
    const shape = currentShapes.find(s => s.id === selectedShapeId);
    if (!shape || !shape.shape) return null;

    const cw = mapCanvas.width;
    const ch = mapCanvas.height;
    const pxX = relCoords.x * cw;
    const pxY = relCoords.y * ch;
    const handleRadius = 8;

    for (let i = 0; i < shape.shape.length; i++) {
        const p = shape.shape[i];
        const hx = p.x * cw;
        const hy = p.y * ch;
        const dx = pxX - hx;
        const dy = pxY - hy;
        if (dx * dx + dy * dy <= handleRadius * handleRadius) {
            return { shape, pointIndex: i };
        }
    }
    return null;
}

// --- LOAD MAPS ---
async function loadMaps() {
    const maps = await fetchJSON('/api/maps');
    console.log('Maps depuis API :', maps);
    mapSelect.innerHTML = '';
    for (const m of maps) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        mapSelect.appendChild(opt);
    }

    if (maps.length > 0) {
        // on sélectionne la DERNIÈRE map (souvent la plus récente)
        const last = maps[maps.length - 1];
        mapSelect.value = last.id;
        await onMapChange();
    } else {
        currentMap = null;
        currentAnnotations = [];
        currentShapes = [];
        drawMapCanvas();
        markersLayer.innerHTML = '';
    }
}

// --- CHANGE MAP ---
async function onMapChange() {
    const mapId = mapSelect.value;
    if (!mapId) return;

    currentMap = await fetchJSON(`/api/maps/${mapId}`);
    console.log('Map sélectionnée :', currentMap);

    // Reset zoom / pan
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    updateTransform();

    setMapImage(currentMap.image_path);

    const layers = await fetchJSON(`/api/maps/${mapId}/layers`);
    layerSelect.innerHTML = '<option value="">(Tous)</option>';
    for (const l of layers) {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        layerSelect.appendChild(opt);
    }

    await loadAnnotations();
    await loadShapes();
}

// --- LOAD ANNOTATIONS ---
async function loadAnnotations() {
    if (!currentMap) return;
    const mapId = currentMap.id;
    const params = new URLSearchParams();
    if (layerSelect.value) params.set('layer_id', layerSelect.value);
    if (typeFilter.value) params.set('type', typeFilter.value);

    const annots = await fetchJSON(`/api/maps/${mapId}/annotations?` + params.toString());
    currentAnnotations = annots;
    renderAnnotations();
    renderAnnotationsList();
}

// --- RENDER MARKERS ---
function renderAnnotations() {
    markersLayer.innerHTML = '';
    if (!currentMap) return;

    currentAnnotations.forEach(a => {
        // Filtrer les annotations non débloquées
        if (a.unlocked === false) return;
        
        const marker = document.createElement('div');
        marker.className = `marker ${a.type}`;
        marker.style.left = (a.x * 100) + '%';
        marker.style.top = (a.y * 100) + '%';
        marker.title = a.title;
        marker.dataset.id = a.id;

        if (a.id === selectedAnnotationId) {
            marker.classList.add('selected');
        }

        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnotation(a.id);
        });

        // Drag & drop du marker
        marker.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            draggingAnnotation = { id: a.id, markerEl: marker };
            marker.classList.add('dragging');
            document.addEventListener('mousemove', onMarkerDrag);
            document.addEventListener('mouseup', onMarkerDragEnd);
        });

        markersLayer.appendChild(marker);
    });
}

function renderAnnotationsList() {
    annotationsList.innerHTML = '';
    currentAnnotations.forEach(a => {
        // Filtrer les annotations non débloquées (optionnel - on peut les afficher mais grisées)
        const li = document.createElement('li');
        li.textContent = `[${a.type}] ${a.title}${a.unlocked === false ? ' 🔒' : ''}`;
        li.dataset.id = a.id;
        if (a.id === selectedAnnotationId) {
            li.style.background = '#333';
        }
        if (a.unlocked === false) {
            li.style.opacity = '0.5';
            li.style.color = '#888';
        }
        li.addEventListener('click', () => selectAnnotation(a.id));
        annotationsList.appendChild(li);
    });
}

// --- SELECT ANNOT ---
function selectAnnotation(id) {
    selectedAnnotationId = id;
    const annot = currentAnnotations.find(a => a.id === id);
    if (!annot) return;

    annotIdInput.value = annot.id;
    annotTitle.value = annot.title;
    annotType.value = annot.type;
    annotDesc.value = annot.description || '';
    annotUnlocked.checked = annot.unlocked !== false;

    const meta = annot.meta || {};
    annotTags.value = meta.tags ? meta.tags.join(', ') : '';
    annotRefs.value = meta.references ? meta.references.join('\n') : '';

    renderAnnotations();
    renderAnnotationsList();
}

// --- CLICK SUR LA CARTE (wrapper) ---
mapWrapper.addEventListener('click', (e) => {
    if (!currentMap) return;
    if (isPanning) return;

    const coords = getRelativeCoordsFromEvent(e);
    if (!coords) return;

    // Mode dessin de shape
    if (drawingShape) {
        currentShapePoints.push(coords);
        drawMapCanvas();
        return;
    }

    // Mode dessin de path
    if (drawingPath) {
        currentPathPoints.push(coords);
        drawMapCanvas();
        return;
    }

    // Création d'une annotation (préparation)
    lastClickPosition = coords;

    selectedAnnotationId = null;
    annotIdInput.value = '';
    annotTitle.value = '';
    annotDesc.value = '';
    annotUnlocked.checked = true;
    annotTags.value = '';
    annotRefs.value = '';

    renderAnnotations();
});

// --- DRAG MARKER ---
function onMarkerDrag(e) {
    if (!draggingAnnotation || !currentMap) return;
    const coords = getRelativeCoordsFromEvent(e);
    if (!coords) return;
    const { x, y } = coords;

    draggingAnnotation.markerEl.style.left = (x * 100) + '%';
    draggingAnnotation.markerEl.style.top = (y * 100) + '%';
}

async function onMarkerDragEnd(e) {
    if (!draggingAnnotation || !currentMap) return;

    const coords = getRelativeCoordsFromEvent(e);
    draggingAnnotation.markerEl.classList.remove('dragging');

    document.removeEventListener('mousemove', onMarkerDrag);
    document.removeEventListener('mouseup', onMarkerDragEnd);

    if (!coords) {
        draggingAnnotation = null;
        return;
    }

    const { x, y } = coords;
    const id = draggingAnnotation.id;
    draggingAnnotation = null;

    const existing = currentAnnotations.find(a => a.id === id);
    if (!existing) return;

    const body = {
        title: existing.title,
        type: existing.type,
        description: existing.description,
        meta: existing.meta || null,
        layer_id: existing.layer_id,
        x,
        y
    };

    await fetchJSON(`/api/annotations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });

    await loadAnnotations();
}

// --- SUBMIT FORM ANNOT (create / update) ---
annotForm.addEventListener('submit', async(e) => {
    e.preventDefault();
    if (!currentMap) return;

    const id = annotIdInput.value || null;
    const type = annotType.value || 'place';
    const title = annotTitle.value || 'Sans titre';
    const description = annotDesc.value || '';

    const tags = annotTags.value ?
        annotTags.value.split(',').map(t => t.trim()).filter(Boolean) : [];

    const references = annotRefs.value ?
        annotRefs.value.split('\n').map(l => l.trim()).filter(Boolean) : [];

    const meta = {};
    if (tags.length) meta.tags = tags;
    if (references.length) meta.references = references;
    
    const unlocked = annotUnlocked.checked;

    if (!id) {
        if (!lastClickPosition) {
            alert('Clique d’abord sur la carte pour définir la position.');
            return;
        }
        const body = {
            map_id: currentMap.id,
            layer_id: layerSelect.value || null,
            type,
            title,
            description,
            x: lastClickPosition.x,
            y: lastClickPosition.y,
            meta,
            unlocked
        };
        const created = await fetchJSON('/api/annotations', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        selectedAnnotationId = created.id;
    } else {
        const existing = currentAnnotations.find(a => a.id == id);
        const body = {
            title,
            type,
            description,
            meta,
            layer_id: layerSelect.value || (existing && existing.layer_id),
            x: existing ? existing.x : 0.5,
            y: existing ? existing.y : 0.5,
            unlocked
        };
        const updated = await fetchJSON(`/api/annotations/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        selectedAnnotationId = updated.id;
    }

    await loadAnnotations();
});

// --- DELETE ANNOT ---
deleteAnnotBtn.addEventListener('click', async() => {
    const id = annotIdInput.value;
    if (!id) return;
    if (!confirm('Supprimer cette annotation ?')) return;
    await fetchJSON(`/api/annotations/${id}`, { method: 'DELETE' });
    annotIdInput.value = '';
    selectedAnnotationId = null;
    await loadAnnotations();
});

// --- CRÉATION MAP (manuel) ---
createMapBtn.addEventListener('click', async() => {
    const name = newMapName.value.trim();
    const image_path = newMapImage.value.trim();
    if (!name || !image_path) {
        alert('Nom et chemin image sont obligatoires.');
        return;
    }
    await fetchJSON('/api/maps', {
        method: 'POST',
        body: JSON.stringify({ name, image_path })
    });
    newMapName.value = '';
    newMapImage.value = '';
    await loadMaps();
});

// --- CRÉATION LAYER ---
createLayerBtn.addEventListener('click', async() => {
    if (!currentMap) return;
    const name = newLayerName.value.trim();
    if (!name) {
        alert('Nom du layer obligatoire.');
        return;
    }
    await fetchJSON(`/api/maps/${currentMap.id}/layers`, {
        method: 'POST',
        body: JSON.stringify({ name })
    });
    newLayerName.value = '';
    await onMapChange();
});

// --- UPLOAD MAP (drag & drop / file input) ---
function handleMapFile(file) {
    const formData = new FormData();
    formData.append('mapImage', file);

    fetch('/api/upload-map', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(async data => {
            console.log('Résultat upload map :', data);
            if (!data.image_path) {
                alert('Erreur upload');
                return;
            }
            const name = file.name.replace(/\.[^.]+$/, '');
            await fetchJSON('/api/maps', {
                method: 'POST',
                body: JSON.stringify({ name, image_path: data.image_path })
            });
            await loadMaps();
        })
        .catch(err => {
            console.error(err);
            alert('Erreur upload map (voir console).');
        });
}

dropZone.addEventListener('click', () => {
    mapFileInput.click();
});

mapFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleMapFile(file);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleMapFile(file);
});

// --- SHAPES ---
async function loadShapes() {
    if (!currentMap) return;
    const params = new URLSearchParams();
    if (layerSelect.value) params.set('layer_id', layerSelect.value);

    const shapes = await fetchJSON(`/api/maps/${currentMap.id}/shapes?` + params.toString());

    // Normalisation : on force une propriété "shape" (liste de points)
    currentShapes = shapes.map(s => ({
        ...s,
        shape: s.shape || s.points || []
    }));

    // Si la shape sélectionnée n'existe plus, on reset
    if (!currentShapes.some(s => s.id === selectedShapeId)) {
        selectedShapeId = null;
    }

    drawMapCanvas();
    renderShapesList();
}

function renderShapesList() {
    shapesList.innerHTML = '';
    currentShapes.forEach(s => {
        const li = document.createElement('li');
        const name = s.name || '(Zone sans nom)';

        const span = document.createElement('span');
        span.textContent = name;
        li.appendChild(span);

        if (s.id === selectedShapeId) {
            li.style.background = '#333';
        }

        // Sélection de la shape en cliquant sur la ligne
        span.addEventListener('click', () => {
            selectedShapeId = s.id;
            drawMapCanvas();
            renderShapesList();
        });

        const btn = document.createElement('button');
        btn.textContent = 'Suppr';
        btn.addEventListener('click', async() => {
            if (!confirm('Supprimer cette zone ?')) return;
            await fetchJSON(`/api/shapes/${s.id}`, { method: 'DELETE' });
            await loadShapes();
        });
        li.appendChild(btn);
        shapesList.appendChild(li);
    });
}

// Boutons dessin de shape
startShapeBtn.addEventListener('click', () => {
    if (!currentMap) return;
    drawingShape = true;
    currentShapePoints = [];
    finishShapeBtn.disabled = false;
    startShapeBtn.disabled = true;
    selectedShapeId = null; // on sort du mode édition
    drawMapCanvas();
});

finishShapeBtn.addEventListener('click', async() => {
    if (!currentMap) return;
    if (!drawingShape) return;
    if (currentShapePoints.length < 3) {
        alert('Il faut au moins 3 points pour une zone.');
        return;
    }

    const name = shapeNameInput.value.trim() || '';
    const style = shapeStyleSelect.value || 'filled';
    const body = {
        map_id: currentMap.id,
        layer_id: layerSelect.value || null,
        name,
        points: currentShapePoints,
        meta: { style }
    };

    await fetchJSON('/api/shapes', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    drawingShape = false;
    currentShapePoints = [];
    shapeNameInput.value = '';
    finishShapeBtn.disabled = true;
    startShapeBtn.disabled = false;

    await loadShapes();
});

// --- ÉDITION DES SHAPES ET PATHS : drag des coins ---
mapCanvas.addEventListener('mousedown', (e) => {
    if (!currentMap) return;
    if (drawingShape || drawingPath) return; // si on dessine, pas d'édition

    const coords = getRelativeCoordsFromEvent(e);
    if (!coords) return;

    // Vérifier si on clique sur un handle de path
    if (selectedPathId) {
        const path = currentPaths.find(p => p.id === selectedPathId);
        if (path && path.path) {
            const cw = mapCanvas.width;
            const ch = mapCanvas.height;
            const pxX = coords.x * cw;
            const pxY = coords.y * ch;
            const handleRadius = 8;

            for (let i = 0; i < path.path.length; i++) {
                const p = path.path[i];
                const hx = p.x * cw;
                const hy = p.y * ch;
                const dx = pxX - hx;
                const dy = pxY - hy;
                if (dx * dx + dy * dy <= handleRadius * handleRadius) {
                    draggingPathPoint = { pathId: path.id, pointIndex: i };
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
        }
    }

    // Vérifier si on clique sur un handle de shape
    const handle = getHandleAtCoords(coords);
    if (handle) {
        draggingShapePoint = {
            shapeId: handle.shape.id,
            pointIndex: handle.pointIndex
        };
        e.preventDefault();
        e.stopPropagation();
    }
});

// --- ZOOM (molette) ---
mapContainer.addEventListener('wheel', (e) => {
    if (!currentMap) return;
    
    // Vérifier si le scroll vient de la sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        const sidebarRect = sidebar.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Si la souris est dans la sidebar, ne pas zoomer la carte
        if (mouseX >= sidebarRect.left && mouseX <= sidebarRect.right &&
            mouseY >= sidebarRect.top && mouseY <= sidebarRect.bottom) {
            return; // Laisser le scroll normal dans la sidebar
        }
    }
    
    // Vérifier si le scroll vient des contrôles (section .controls)
    const controls = document.querySelector('.controls');
    if (controls) {
        const controlsRect = controls.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Si la souris est dans les contrôles, ne pas zoomer la carte
        if (mouseX >= controlsRect.left && mouseX <= controlsRect.right &&
            mouseY >= controlsRect.top && mouseY <= controlsRect.bottom) {
            return; // Laisser le scroll normal dans les contrôles
        }
    }
    
    // Sinon, appliquer le zoom sur la carte
    e.preventDefault();

    // Position de la souris par rapport au conteneur parent (non transformé)
    const containerRect = mapContainer.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    // Position de la souris dans l'espace non transformé de mapInner
    const innerX = (mouseX - offsetX) / zoom;
    const innerY = (mouseY - offsetY) / zoom;

    // Calculer le nouveau zoom
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * delta, 0.5), 4);

    // Ajuster le offset pour que le point sous la souris reste fixe
    offsetX = mouseX - innerX * newZoom;
    offsetY = mouseY - innerY * newZoom;

    zoom = newZoom;
    updateTransform();
});

// --- PAN (clic milieu) ---
mapInner.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
        isPanning = true;
        panStart.x = e.clientX;
        panStart.y = e.clientY;
        panOffsetStart.x = offsetX;
        panOffsetStart.y = offsetY;
        e.preventDefault();
    }
});

window.addEventListener('mousemove', (e) => {
    // Drag d'un point de shape
    if (draggingShapePoint) {
        const coords = getRelativeCoordsFromEvent(e);
        if (!coords) return;

        const shape = currentShapes.find(s => s.id === draggingShapePoint.shapeId);
        if (!shape || !shape.shape) return;

        shape.shape[draggingShapePoint.pointIndex] = {
            x: coords.x,
            y: coords.y
        };

        drawMapCanvas();
        return;
    }

    // Pan
    if (!isPanning) return;
    offsetX = panOffsetStart.x + (e.clientX - panStart.x);
    offsetY = panOffsetStart.y + (e.clientY - panStart.y);
    updateTransform();
});

window.addEventListener('mouseup', async(e) => {
    // Fin drag point de path -> sauvegarde
    if (draggingPathPoint) {
        const path = currentPaths.find(p => p.id === draggingPathPoint.pathId);
        const pathId = draggingPathPoint.pathId;
        draggingPathPoint = null;

        if (path) {
            try {
                await fetchJSON(`/api/paths/${pathId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        map_id: currentMap.id,
                        layer_id: path.layer_id || (layerSelect.value || null),
                        name: path.name || '',
                        points: path.path
                    })
                });
                await loadPaths();
            } catch (err) {
                console.error('Erreur sauvegarde path', err);
            }
        }
    }

    // Fin drag point de shape -> sauvegarde
    if (draggingShapePoint) {
        const shape = currentShapes.find(s => s.id === draggingShapePoint.shapeId);
        const shapeId = draggingShapePoint.shapeId;
        draggingShapePoint = null;

        if (shape) {
            try {
                await fetchJSON(`/api/shapes/${shapeId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        map_id: currentMap.id,
                        layer_id: shape.layer_id || (layerSelect.value || null),
                        name: shape.name || '',
                        points: shape.shape,
                        meta: shape.meta || null
                    })
                });
                await loadShapes();
            } catch (err) {
                console.error('Erreur sauvegarde shape', err);
            }
        }
    }

    // Fin pan (clic milieu)
    if (e.button === 1) {
        isPanning = false;
    }
});

// --- CHANGEMENTS MAP / LAYER / TYPE ---
mapSelect.addEventListener('change', onMapChange);

layerSelect.addEventListener('change', async() => {
    await loadAnnotations();
    await loadShapes();
    await loadPaths();
    
    // Recharger les onglets actifs si nécessaire
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        if (tabName === 'characters') {
            loadCharacters();
        } else if (tabName === 'places') {
            loadPlaces();
        } else if (tabName === 'events') {
            loadEvents();
        } else if (tabName === 'media') {
            loadAllMedia();
        }
    }
});

typeFilter.addEventListener('change', loadAnnotations);

// --- PATHS ---
async function loadPaths() {
    if (!currentMap) return;
    const params = new URLSearchParams();
    if (layerSelect.value) params.set('layer_id', layerSelect.value);

    const paths = await fetchJSON(`/api/maps/${currentMap.id}/paths?` + params.toString());

    currentPaths = paths.map(p => ({
        ...p,
        path: p.path || p.points || []
    }));

    if (!currentPaths.some(p => p.id === selectedPathId)) {
        selectedPathId = null;
    }

    drawMapCanvas();
    renderPathsList();
}

function renderPathsList() {
    pathsList.innerHTML = '';
    currentPaths.forEach(p => {
        const li = document.createElement('li');
        const name = p.name || '(Chemin sans nom)';

        const span = document.createElement('span');
        span.textContent = name;
        li.appendChild(span);

        if (p.id === selectedPathId) {
            li.style.background = '#333';
        }

        span.addEventListener('click', () => {
            selectedPathId = p.id;
            drawMapCanvas();
            renderPathsList();
        });

        const btn = document.createElement('button');
        btn.textContent = 'Suppr';
        btn.addEventListener('click', async() => {
            if (!confirm('Supprimer ce chemin ?')) return;
            await fetchJSON(`/api/paths/${p.id}`, { method: 'DELETE' });
            await loadPaths();
        });
        li.appendChild(btn);
        pathsList.appendChild(li);
    });
}

startPathBtn.addEventListener('click', () => {
    if (!currentMap) return;
    drawingPath = true;
    currentPathPoints = [];
    finishPathBtn.disabled = false;
    startPathBtn.disabled = true;
    selectedPathId = null;
    drawMapCanvas();
});

finishPathBtn.addEventListener('click', async() => {
    if (!currentMap) return;
    if (!drawingPath) return;
    if (currentPathPoints.length < 2) {
        alert('Il faut au moins 2 points pour un chemin.');
        return;
    }

    const name = pathNameInput.value.trim() || '';
    const body = {
        map_id: currentMap.id,
        layer_id: layerSelect.value || null,
        name,
        points: currentPathPoints
    };

    await fetchJSON('/api/paths', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    drawingPath = false;
    currentPathPoints = [];
    pathNameInput.value = '';
    finishPathBtn.disabled = true;
    startPathBtn.disabled = false;

    await loadPaths();
});

// Gestion du drag des points de path
mapCanvas.addEventListener('mousedown', (e) => {
    if (!currentMap) return;
    if (drawingShape || drawingPath) return;

    const coords = getRelativeCoordsFromEvent(e);
    if (!coords) return;

    // Vérifier si on clique sur un handle de path
    if (selectedPathId) {
        const path = currentPaths.find(p => p.id === selectedPathId);
        if (path && path.path) {
            const cw = mapCanvas.width;
            const ch = mapCanvas.height;
            const pxX = coords.x * cw;
            const pxY = coords.y * ch;
            const handleRadius = 8;

            for (let i = 0; i < path.path.length; i++) {
                const p = path.path[i];
                const hx = p.x * cw;
                const hy = p.y * ch;
                const dx = pxX - hx;
                const dy = pxY - hy;
                if (dx * dx + dy * dy <= handleRadius * handleRadius) {
                    draggingPathPoint = { pathId: path.id, pointIndex: i };
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
        }
    }

    // Vérifier si on clique sur un handle de shape (code existant)
    const handle = getHandleAtCoords(coords);
    if (handle) {
        draggingShapePoint = {
            shapeId: handle.shape.id,
            pointIndex: handle.pointIndex
        };
        e.preventDefault();
        e.stopPropagation();
    }
});

// --- IMPORT/EXPORT ---
exportBtn.addEventListener('click', async() => {
    try {
        const data = await fetchJSON('/api/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worldnotes-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Export réussi !');
    } catch (err) {
        console.error('Erreur export:', err);
        alert('Erreur lors de l\'export');
    }
});

importBtn.addEventListener('click', () => {
    importFileInput.click();
});

importFileInput.addEventListener('change', async(e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!confirm(`Importer ${data.maps?.length || 0} cartes, ${data.annotations?.length || 0} annotations, ${data.shapes?.length || 0} zones, ${data.paths?.length || 0} chemins ?`)) {
            return;
        }

        const result = await fetchJSON('/api/import', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        alert(`Import réussi !\n${result.imported.maps} cartes, ${result.imported.layers} layers, ${result.imported.annotations} annotations, ${result.imported.shapes} zones, ${result.imported.paths} chemins, ${result.imported.media} médias, ${result.imported.missions} missions`);
        
        // Recharger les données
        await loadMaps();
    } catch (err) {
        console.error('Erreur import:', err);
        alert('Erreur lors de l\'import : ' + err.message);
    }

    importFileInput.value = '';
});

// --- TABS ---
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // Désactiver tous les onglets
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Cacher tous les détails
        document.querySelectorAll('[id$="-detail"]').forEach(el => {
            if (el.id !== 'mission-detail') el.style.display = 'none';
        });
        missionDetail.style.display = 'none';
        missionForm.style.display = 'none';
        
        // Activer l'onglet sélectionné
        btn.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
        
        // Charger les données selon l'onglet
        if (tabName === 'characters') {
            if (currentMap) loadCharacters();
        } else if (tabName === 'places') {
            if (currentMap) loadPlaces();
        } else if (tabName === 'events') {
            if (currentMap) loadEvents();
        } else if (tabName === 'media') {
            if (currentMap) loadAllMedia();
        } else if (tabName === 'missions') {
            loadMissions();
            loadProgression();
        }
    });
});

// --- CHARACTERS, PLACES, EVENTS ---
async function loadCharacters() {
    if (!currentMap) return;
    const characters = currentAnnotations.filter(a => a.type === 'character');
    renderTypeList('characters-list', characters, 'character');
}

async function loadPlaces() {
    if (!currentMap) return;
    const places = currentAnnotations.filter(a => a.type === 'place');
    renderTypeList('places-list', places, 'place');
}

async function loadEvents() {
    if (!currentMap) return;
    const events = currentAnnotations.filter(a => a.type === 'event');
    renderTypeList('events-list', events, 'event');
}

function renderTypeList(listId, items, type) {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.title;
        li.dataset.id = item.id;
        li.addEventListener('click', () => showTypeDetail(item, type));
        list.appendChild(li);
    });
}

async function showTypeDetail(item, type) {
    const detailDiv = document.getElementById(`${type}-detail`);
    const titleEl = document.getElementById(`${type}-detail-title`);
    const descEl = document.getElementById(`${type}-detail-description`);
    const mediaEl = document.getElementById(`${type}-media`);
    
    titleEl.textContent = item.title;
    descEl.textContent = item.description || 'Aucune description';
    
    // Charger les médias
    await loadMediaForAnnotation(item.id, type);
    
    detailDiv.style.display = 'block';
}

// Fonction pour gérer l'upload d'un fichier média
async function handleMediaFile(file, annotationId, type) {
    const formData = new FormData();
    formData.append('mediaFile', file);

    try {
        const res = await fetch('/api/upload-media', {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            throw new Error('Erreur upload');
        }
        
        const data = await res.json();
        if (!data.url || !data.kind) {
            alert('Erreur upload');
            return;
        }
        
        // Ajouter le média à l'annotation
        await fetchJSON(`/api/annotations/${annotationId}/media`, {
            method: 'POST',
            body: JSON.stringify({
                kind: data.kind,
                url: data.url,
                description: file.name
            })
        });
        
        // Recharger les médias
        await loadMediaForAnnotation(annotationId, type);
    } catch (err) {
        console.error('Erreur upload média', err);
        alert('Erreur lors de l\'upload du fichier');
    }
}

async function loadMediaForAnnotation(annotationId, type) {
    const mediaEl = document.getElementById(`${type}-media`);
    try {
        const media = await fetchJSON(`/api/annotations/${annotationId}/media`);
        mediaEl.innerHTML = '';
        
        // Formulaire d'ajout de média
        const formDiv = document.createElement('div');
        formDiv.className = 'media-form';
        formDiv.style.marginBottom = '16px';
        formDiv.style.padding = '12px';
        formDiv.style.background = '#2a2a2a';
        formDiv.style.borderRadius = '4px';
        
        // Titre
        const title = document.createElement('h4');
        title.style.marginTop = '0';
        title.textContent = 'Ajouter un média';
        formDiv.appendChild(title);
        
        // Zone de drop
        const dropZone = document.createElement('div');
        dropZone.id = `media-drop-zone-${annotationId}`;
        dropZone.style.cssText = 'border: 2px dashed #555; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 12px; cursor: pointer; transition: all 0.2s;';
        dropZone.innerHTML = `
            <p style="margin: 0; color: #aaa;">📁 Glisse un fichier ici<br />ou clique pour sélectionner</p>
        `;
        formDiv.appendChild(dropZone);
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = `media-file-input-${annotationId}`;
        fileInput.style.display = 'none';
        fileInput.accept = 'image/*,video/*,.pdf,.doc,.docx,.txt,.md';
        formDiv.appendChild(fileInput);
        
        // Section URL manuelle
        const urlSection = document.createElement('div');
        urlSection.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid #444;';
        urlSection.innerHTML = `
            <p style="margin: 0 0 8px 0; color: #aaa; font-size: 12px;">Ou saisir une URL manuellement :</p>
            <label style="display: block; margin-bottom: 8px;">
                Type :
                <select id="new-media-kind-${annotationId}" style="width: 100%; padding: 4px; margin-top: 4px;">
                    <option value="image">Image</option>
                    <option value="video">Vidéo</option>
                    <option value="link">Lien</option>
                    <option value="document">Document</option>
                </select>
            </label>
            <label style="display: block; margin-bottom: 8px;">
                URL :
                <input type="text" id="new-media-url-${annotationId}" placeholder="https://..." style="width: 100%; padding: 4px; margin-top: 4px;" />
            </label>
            <label style="display: block; margin-bottom: 8px;">
                Description (optionnel) :
                <input type="text" id="new-media-desc-${annotationId}" placeholder="Description du média" style="width: 100%; padding: 4px; margin-top: 4px;" />
            </label>
            <button type="button" id="add-media-btn-${annotationId}" style="padding: 6px 12px;">➕ Ajouter</button>
        `;
        formDiv.appendChild(urlSection);
        mediaEl.appendChild(formDiv);
        
        // Gestion du drag & drop
        const dropZoneEl = document.getElementById(`media-drop-zone-${annotationId}`);
        const fileInputEl = document.getElementById(`media-file-input-${annotationId}`);
        
        dropZoneEl.addEventListener('click', () => {
            fileInputEl.click();
        });
        
        dropZoneEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZoneEl.style.borderColor = '#4a9eff';
            dropZoneEl.style.background = '#333';
        });
        
        dropZoneEl.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZoneEl.style.borderColor = '#555';
            dropZoneEl.style.background = 'transparent';
        });
        
        dropZoneEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZoneEl.style.borderColor = '#555';
            dropZoneEl.style.background = 'transparent';
            
            const file = e.dataTransfer.files[0];
            if (file) {
                await handleMediaFile(file, annotationId, type);
            }
        });
        
        fileInputEl.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await handleMediaFile(file, annotationId, type);
            }
        });
        
        // Bouton d'ajout de média
        const addBtn = document.getElementById(`add-media-btn-${annotationId}`);
        addBtn.addEventListener('click', async () => {
            const kind = document.getElementById(`new-media-kind-${annotationId}`).value;
            const url = document.getElementById(`new-media-url-${annotationId}`).value.trim();
            const description = document.getElementById(`new-media-desc-${annotationId}`).value.trim();
            
            if (!url) {
                alert('L\'URL est obligatoire');
                return;
            }
            
            try {
                await fetchJSON(`/api/annotations/${annotationId}/media`, {
                    method: 'POST',
                    body: JSON.stringify({ kind, url, description })
                });
                
                // Réinitialiser le formulaire
                document.getElementById(`new-media-url-${annotationId}`).value = '';
                document.getElementById(`new-media-desc-${annotationId}`).value = '';
                
                // Recharger les médias
                await loadMediaForAnnotation(annotationId, type);
            } catch (err) {
                console.error('Erreur ajout média', err);
                alert('Erreur lors de l\'ajout du média');
            }
        });
        
        // Liste des médias existants
        if (media.length === 0) {
            const p = document.createElement('p');
            p.className = 'hint';
            p.textContent = 'Aucun média';
            mediaEl.appendChild(p);
        } else {
            media.forEach(m => {
                const div = document.createElement('div');
                div.className = 'media-item';
                div.style.position = 'relative';
                div.style.marginBottom = '12px';
                div.style.padding = '8px';
                div.style.background = '#1a1a1a';
                div.style.borderRadius = '4px';
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '✕';
                deleteBtn.style.position = 'absolute';
                deleteBtn.style.top = '4px';
                deleteBtn.style.right = '4px';
                deleteBtn.style.background = '#d32f2f';
                deleteBtn.style.border = 'none';
                deleteBtn.style.color = 'white';
                deleteBtn.style.borderRadius = '3px';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.padding = '2px 6px';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Supprimer ce média ?')) {
                        try {
                            await fetchJSON(`/api/media/${m.id}`, { method: 'DELETE' });
                            await loadMediaForAnnotation(annotationId, type);
                        } catch (err) {
                            console.error('Erreur suppression média', err);
                            alert('Erreur lors de la suppression');
                        }
                    }
                });
                
                if (m.kind === 'image') {
                    div.innerHTML = `
                        <img src="${m.url}" alt="${m.description || ''}" style="max-width: 100%; border-radius: 4px; margin-bottom: 8px;" />
                        <a href="${m.url}" target="_blank" style="display: block; margin-bottom: 4px;">${m.url}</a>
                        ${m.description ? `<p style="margin: 0; color: #aaa; font-size: 12px;">${m.description}</p>` : ''}
                    `;
                } else {
                    div.innerHTML = `
                        <a href="${m.url}" target="_blank" style="display: block; margin-bottom: 4px;">${m.url}</a>
                        ${m.description ? `<p style="margin: 0; color: #aaa; font-size: 12px;">${m.description}</p>` : ''}
                    `;
                }
                div.appendChild(deleteBtn);
                mediaEl.appendChild(div);
            });
        }
    } catch (err) {
        mediaEl.innerHTML = '<p class="hint">Erreur de chargement des médias</p>';
    }
}

// --- ALL MEDIA ---
async function loadAllMedia() {
    if (!currentMap) return;
    const mediaList = document.getElementById('all-media-list');
    mediaList.innerHTML = '<p class="hint">Chargement...</p>';
    
    try {
        const allMedia = [];
        for (const annot of currentAnnotations) {
            try {
                const media = await fetchJSON(`/api/annotations/${annot.id}/media`);
                media.forEach(m => {
                    allMedia.push({ ...m, annotation: annot });
                });
            } catch (err) {
                console.error(`Erreur chargement médias pour annotation ${annot.id}`, err);
            }
        }
        
        mediaList.innerHTML = '';
        if (allMedia.length === 0) {
            mediaList.innerHTML = '<p class="hint">Aucun média</p>';
        } else {
            allMedia.forEach(m => {
                const div = document.createElement('div');
                div.className = 'media-item';
                div.style.position = 'relative';
                div.style.marginBottom = '12px';
                div.style.padding = '8px';
                div.style.background = '#1a1a1a';
                div.style.borderRadius = '4px';
                
                const annotTitle = m.annotation ? m.annotation.title : 'Inconnu';
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '✕';
                deleteBtn.style.position = 'absolute';
                deleteBtn.style.top = '4px';
                deleteBtn.style.right = '4px';
                deleteBtn.style.background = '#d32f2f';
                deleteBtn.style.border = 'none';
                deleteBtn.style.color = 'white';
                deleteBtn.style.borderRadius = '3px';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.padding = '2px 6px';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Supprimer ce média ?')) {
                        try {
                            await fetchJSON(`/api/media/${m.id}`, { method: 'DELETE' });
                            await loadAllMedia();
                        } catch (err) {
                            console.error('Erreur suppression média', err);
                            alert('Erreur lors de la suppression');
                        }
                    }
                });
                
                if (m.kind === 'image') {
                    div.innerHTML = `
                        <img src="${m.url}" alt="${m.description || ''}" style="max-width: 100%; border-radius: 4px; margin-bottom: 8px;" />
                        <p style="margin: 0 0 4px 0;"><strong>${annotTitle}</strong></p>
                        <a href="${m.url}" target="_blank" style="display: block; margin-bottom: 4px;">${m.url}</a>
                        ${m.description ? `<p style="margin: 0; color: #aaa; font-size: 12px;">${m.description}</p>` : ''}
                    `;
                } else {
                    div.innerHTML = `
                        <p style="margin: 0 0 4px 0;"><strong>${annotTitle}</strong></p>
                        <a href="${m.url}" target="_blank" style="display: block; margin-bottom: 4px;">${m.url}</a>
                        ${m.description ? `<p style="margin: 0; color: #aaa; font-size: 12px;">${m.description}</p>` : ''}
                    `;
                }
                div.appendChild(deleteBtn);
                mediaList.appendChild(div);
            });
        }
    } catch (err) {
        mediaList.innerHTML = '<p class="hint">Erreur de chargement</p>';
    }
}

// --- MISSIONS ---
const newMissionBtn = document.getElementById('new-mission-btn');
const missionForm = document.getElementById('mission-form');
const missionIdInput = document.getElementById('mission-id');
const missionTitleInput = document.getElementById('mission-title');
const missionDescInput = document.getElementById('mission-description');
const missionStatusInput = document.getElementById('mission-status');
const missionPriorityInput = document.getElementById('mission-priority');
const saveMissionBtn = document.getElementById('save-mission-btn');
const cancelMissionBtn = document.getElementById('cancel-mission-btn');
const missionsList = document.getElementById('missions-list');
const missionDetail = document.getElementById('mission-detail');
const addAnnotationToMissionBtn = document.getElementById('add-annotation-to-mission-btn');
const addPathToMissionBtn = document.getElementById('add-path-to-mission-btn');
const addRequiredMissionBtn = document.getElementById('add-required-mission-btn');
const showGraphBtn = document.getElementById('show-graph-btn');
const missionGraphContainer = document.getElementById('mission-graph-container');
const missionGraphCanvas = document.getElementById('mission-graph-canvas');
const progressionPanel = document.getElementById('progression-content');

let currentMissions = [];
let selectedMissionId = null;

newMissionBtn.addEventListener('click', () => {
    missionIdInput.value = '';
    missionTitleInput.value = '';
    missionDescInput.value = '';
    missionStatusInput.value = 'todo';
    missionPriorityInput.value = '0';
    missionForm.style.display = 'block';
    missionDetail.style.display = 'none';
});

cancelMissionBtn.addEventListener('click', () => {
    missionForm.style.display = 'none';
});

saveMissionBtn.addEventListener('click', async() => {
    const id = missionIdInput.value || null;
    const title = missionTitleInput.value.trim();
    if (!title) {
        alert('Le titre est obligatoire');
        return;
    }

    const body = {
        map_id: currentMap ? currentMap.id : null,
        title,
        description: missionDescInput.value.trim(),
        status: missionStatusInput.value,
        priority: parseInt(missionPriorityInput.value) || 0
    };

    try {
        if (id) {
            await fetchJSON(`/api/missions/${id}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
        } else {
            await fetchJSON('/api/missions', {
                method: 'POST',
                body: JSON.stringify(body)
            });
        }
        missionForm.style.display = 'none';
        await loadMissions();
    } catch (err) {
        console.error('Erreur sauvegarde mission', err);
        alert('Erreur lors de la sauvegarde');
    }
});

async function loadMissions() {
    const params = new URLSearchParams();
    if (currentMap) params.set('map_id', currentMap.id);
    
    const missions = await fetchJSON(`/api/missions?${params.toString()}`);
    currentMissions = missions;
    await renderMissionsList();
    await loadProgression();
}

async function renderMissionsList() {
    missionsList.innerHTML = '';
    
    if (currentMissions.length === 0) {
        missionsList.innerHTML = '<li class="hint">Aucune mission</li>';
        return;
    }

    // Charger les dépendances pour chaque mission
    for (const m of currentMissions) {
        try {
            const missionDetail = await fetchJSON(`/api/missions/${m.id}`);
            m.requiredMissions = missionDetail.requiredMissions || [];
        } catch (err) {
            m.requiredMissions = [];
        }
    }

    currentMissions.forEach(m => {
        const li = document.createElement('li');
        const isUnlocked = m.requiredMissions.length === 0 || 
            m.requiredMissions.every(req => {
                const reqMission = currentMissions.find(mission => mission.id === req.id);
                return reqMission && reqMission.status === 'completed';
            });
        
        li.innerHTML = `
            <div>
                <strong>${m.title}</strong>
                <span class="mission-status ${m.status}">${getStatusLabel(m.status)}</span>
                ${!isUnlocked ? '<span style="color: #ff9800; font-size: 11px;">🔒 Bloquée</span>' : ''}
            </div>
            <div style="font-size: 11px; color: #aaa; margin-top: 4px;">
                ${m.description || 'Aucune description'}
            </div>
        `;
        li.style.opacity = isUnlocked ? '1' : '0.6';
        li.addEventListener('click', () => showMissionDetail(m.id));
        missionsList.appendChild(li);
    });
}

function getStatusLabel(status) {
    const labels = {
        todo: 'À faire',
        in_progress: 'En cours',
        completed: 'Terminée',
        cancelled: 'Annulée'
    };
    return labels[status] || status;
}

async function showMissionDetail(missionId) {
    selectedMissionId = missionId;
    missionForm.style.display = 'none';
    
    try {
        const mission = await fetchJSON(`/api/missions/${missionId}`);
        
        document.getElementById('mission-detail-title').textContent = mission.title;
        document.getElementById('mission-detail-description').textContent = mission.description || 'Aucune description';
        document.getElementById('mission-detail-status').textContent = getStatusLabel(mission.status);
        document.getElementById('mission-detail-priority').textContent = mission.priority || 0;
        
        // Afficher les prérequis
        const requiredList = document.getElementById('mission-required-list');
        requiredList.innerHTML = '';
        if (mission.requiredMissions && mission.requiredMissions.length > 0) {
            mission.requiredMissions.forEach(req => {
                const li = document.createElement('li');
                const reqMission = currentMissions.find(m => m.id === req.id);
                const status = reqMission ? getStatusLabel(reqMission.status) : 'Inconnue';
                li.innerHTML = `
                    <span>${req.title} (${status})</span>
                    <button class="remove-required-btn" data-required-id="${req.id}">✕</button>
                `;
                li.querySelector('.remove-required-btn').addEventListener('click', async(e) => {
                    e.stopPropagation();
                    if (confirm('Supprimer ce prérequis ?')) {
                        await fetchJSON(`/api/missions/${missionId}/dependencies/${req.id}`, { method: 'DELETE' });
                        await showMissionDetail(missionId);
                        await loadMissions();
                    }
                });
                requiredList.appendChild(li);
            });
        } else {
            requiredList.innerHTML = '<li class="hint">Aucun prérequis</li>';
        }
        
        // Afficher les missions qui dépendent de celle-ci
        const dependentList = document.getElementById('mission-dependent-list');
        dependentList.innerHTML = '';
        if (mission.dependentMissions && mission.dependentMissions.length > 0) {
            mission.dependentMissions.forEach(dep => {
                const li = document.createElement('li');
                li.textContent = `${dep.title} (${getStatusLabel(dep.status)})`;
                dependentList.appendChild(li);
            });
        } else {
            dependentList.innerHTML = '<li class="hint">Aucune mission ne dépend de celle-ci</li>';
        }
        
        // Ajouter un bouton d'édition
        let editBtn = document.getElementById('edit-mission-btn');
        if (!editBtn) {
            editBtn = document.createElement('button');
            editBtn.id = 'edit-mission-btn';
            editBtn.textContent = '✏️ Modifier';
            editBtn.style.marginTop = '8px';
            editBtn.addEventListener('click', () => editMission(mission));
            const titleEl = document.getElementById('mission-detail-title');
            titleEl.parentElement.insertBefore(editBtn, titleEl.nextSibling);
        }
        editBtn.onclick = () => editMission(mission);
        
        // Ajouter un bouton de suppression
        let deleteBtn = document.getElementById('delete-mission-btn');
        if (!deleteBtn) {
            deleteBtn = document.createElement('button');
            deleteBtn.id = 'delete-mission-btn';
            deleteBtn.textContent = '🗑 Supprimer';
            deleteBtn.style.marginTop = '4px';
            deleteBtn.style.background = '#d32f2f';
            deleteBtn.addEventListener('click', async() => {
                if (confirm('Supprimer cette mission ?')) {
                    await fetchJSON(`/api/missions/${missionId}`, { method: 'DELETE' });
                    missionDetail.style.display = 'none';
                    await loadMissions();
                }
            });
            editBtn.parentElement.appendChild(deleteBtn);
        }
        
        // Afficher les annotations liées
        const annotationsList = document.getElementById('mission-annotations-list');
        annotationsList.innerHTML = '';
        if (mission.annotations && mission.annotations.length > 0) {
            mission.annotations.forEach(annot => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>[${annot.type}] ${annot.title}</span>
                    <button class="remove-annotation-btn" data-annotation-id="${annot.id}">✕</button>
                `;
                li.querySelector('.remove-annotation-btn').addEventListener('click', async(e) => {
                    e.stopPropagation();
                    if (confirm('Délier cette annotation de la mission ?')) {
                        await fetchJSON(`/api/missions/${missionId}/annotations/${annot.id}`, { method: 'DELETE' });
                        await showMissionDetail(missionId);
                    }
                });
                annotationsList.appendChild(li);
            });
        } else {
            annotationsList.innerHTML = '<li class="hint">Aucune annotation liée</li>';
        }
        
        // Afficher les chemins liés
        const missionPathsList = document.getElementById('mission-paths-list');
        missionPathsList.innerHTML = '';
        if (mission.paths && mission.paths.length > 0) {
            mission.paths.forEach(path => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>🛤️ ${path.name || '(Chemin sans nom)'}</span>
                    <button class="remove-path-btn" data-path-id="${path.id}">✕</button>
                `;
                li.querySelector('.remove-path-btn').addEventListener('click', async(e) => {
                    e.stopPropagation();
                    if (confirm('Délier ce chemin de la mission ?')) {
                        await fetchJSON(`/api/missions/${missionId}/paths/${path.id}`, { method: 'DELETE' });
                        await showMissionDetail(missionId);
                    }
                });
                missionPathsList.appendChild(li);
            });
        } else {
            missionPathsList.innerHTML = '<li class="hint">Aucun chemin lié</li>';
        }
        
        missionDetail.style.display = 'block';
    } catch (err) {
        console.error('Erreur chargement mission', err);
        alert('Erreur lors du chargement de la mission');
    }
}

function editMission(mission) {
    missionIdInput.value = mission.id;
    missionTitleInput.value = mission.title;
    missionDescInput.value = mission.description || '';
    missionStatusInput.value = mission.status;
    missionPriorityInput.value = mission.priority || 0;
    missionForm.style.display = 'block';
    missionDetail.style.display = 'none';
}

addAnnotationToMissionBtn.addEventListener('click', async() => {
    if (!selectedMissionId) return;
    if (currentAnnotations.length === 0) {
        alert('Aucune annotation disponible');
        return;
    }
    
    // Créer un sélecteur visuel
    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '6px';
    select.style.marginTop = '8px';
    select.innerHTML = '<option value="">-- Sélectionner une annotation --</option>';
    currentAnnotations.forEach(a => {
        const option = document.createElement('option');
        option.value = a.id;
        option.textContent = `[${a.type}] ${a.title}`;
        select.appendChild(option);
    });
    
    const container = document.createElement('div');
    container.style.padding = '10px';
    container.style.background = '#222';
    container.style.borderRadius = '4px';
    container.style.marginTop = '8px';
    container.appendChild(select);
    
    const btnContainer = document.createElement('div');
    btnContainer.style.marginTop = '8px';
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Lier';
    confirmBtn.addEventListener('click', async() => {
        const annotId = select.value;
        if (!annotId) {
            alert('Veuillez sélectionner une annotation');
            return;
        }
        try {
            await fetchJSON(`/api/missions/${selectedMissionId}/annotations`, {
                method: 'POST',
                body: JSON.stringify({ annotation_id: parseInt(annotId) })
            });
            container.remove();
            await showMissionDetail(selectedMissionId);
        } catch (err) {
            console.error('Erreur liaison annotation', err);
            alert('Erreur lors de la liaison de l\'annotation');
        }
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => container.remove());
    
    btnContainer.appendChild(confirmBtn);
    btnContainer.appendChild(cancelBtn);
    container.appendChild(btnContainer);
    
    addAnnotationToMissionBtn.parentElement.appendChild(container);
});

// Lier un chemin à une mission
addPathToMissionBtn.addEventListener('click', async() => {
    if (!selectedMissionId) return;
    if (!currentMap) {
        alert('Veuillez sélectionner une carte d\'abord');
        return;
    }
    
    // Charger les chemins disponibles
    const params = new URLSearchParams();
    if (layerSelect.value) params.set('layer_id', layerSelect.value);
    const paths = await fetchJSON(`/api/maps/${currentMap.id}/paths?${params.toString()}`);
    
    if (paths.length === 0) {
        alert('Aucun chemin disponible');
        return;
    }
    
    // Créer un sélecteur visuel
    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '6px';
    select.style.marginTop = '8px';
    select.innerHTML = '<option value="">-- Sélectionner un chemin --</option>';
    paths.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.name || '(Chemin sans nom)'}`;
        select.appendChild(option);
    });
    
    const container = document.createElement('div');
    container.style.padding = '10px';
    container.style.background = '#222';
    container.style.borderRadius = '4px';
    container.style.marginTop = '8px';
    container.appendChild(select);
    
    const btnContainer = document.createElement('div');
    btnContainer.style.marginTop = '8px';
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Lier';
    confirmBtn.addEventListener('click', async() => {
        const pathId = select.value;
        if (!pathId) {
            alert('Veuillez sélectionner un chemin');
            return;
        }
        try {
            await fetchJSON(`/api/missions/${selectedMissionId}/paths`, {
                method: 'POST',
                body: JSON.stringify({ path_id: parseInt(pathId) })
            });
            container.remove();
            await showMissionDetail(selectedMissionId);
        } catch (err) {
            console.error('Erreur liaison chemin', err);
            alert('Erreur lors de la liaison du chemin');
        }
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => container.remove());
    
    btnContainer.appendChild(confirmBtn);
    btnContainer.appendChild(cancelBtn);
    container.appendChild(btnContainer);
    addPathToMissionBtn.parentElement.appendChild(container);
});

// Ajouter un prérequis à une mission
addRequiredMissionBtn.addEventListener('click', async() => {
    if (!selectedMissionId) return;
    
    const availableMissions = currentMissions.filter(m => 
        m.id !== parseInt(selectedMissionId) && 
        !currentMissions.find(req => req.id === selectedMissionId && req.requiredMissions && req.requiredMissions.some(r => r.id === m.id))
    );
    
    if (availableMissions.length === 0) {
        alert('Aucune mission disponible comme prérequis');
        return;
    }
    
    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '6px';
    select.style.marginTop = '8px';
    select.innerHTML = '<option value="">-- Sélectionner une mission --</option>';
    availableMissions.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = `${m.title} (${getStatusLabel(m.status)})`;
        select.appendChild(option);
    });
    
    const container = document.createElement('div');
    container.style.padding = '10px';
    container.style.background = '#222';
    container.style.borderRadius = '4px';
    container.style.marginTop = '8px';
    container.appendChild(select);
    
    const btnContainer = document.createElement('div');
    btnContainer.style.marginTop = '8px';
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Ajouter';
    confirmBtn.addEventListener('click', async() => {
        const requiredId = select.value;
        if (!requiredId) {
            alert('Veuillez sélectionner une mission');
            return;
        }
        try {
            await fetchJSON(`/api/missions/${selectedMissionId}/dependencies`, {
                method: 'POST',
                body: JSON.stringify({ required_mission_id: parseInt(requiredId) })
            });
            container.remove();
            await showMissionDetail(selectedMissionId);
            await loadMissions();
        } catch (err) {
            console.error('Erreur ajout prérequis', err);
            alert('Erreur lors de l\'ajout du prérequis');
        }
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => container.remove());
    
    btnContainer.appendChild(confirmBtn);
    btnContainer.appendChild(cancelBtn);
    container.appendChild(btnContainer);
    addRequiredMissionBtn.parentElement.appendChild(container);
});

// Charger la progression
async function loadProgression() {
    try {
        const params = new URLSearchParams();
        if (currentMap) params.set('map_id', currentMap.id);
        
        const progression = await fetchJSON(`/api/progression?${params.toString()}`);
        
        progressionPanel.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <strong>Missions</strong>
                    <div style="font-size: 24px; font-weight: bold; color: #4a9eff;">
                        ${progression.missions.completed} / ${progression.missions.total}
                    </div>
                    <div style="background: #333; height: 8px; border-radius: 4px; margin-top: 4px;">
                        <div style="background: #4a9eff; height: 100%; width: ${progression.missions.progress}%; border-radius: 4px;"></div>
                    </div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 4px;">
                        ${progression.missions.progress}% complétées • ${progression.missions.unlocked} débloquées
                    </div>
                </div>
                <div>
                    <strong>Annotations</strong>
                    <div style="font-size: 24px; font-weight: bold; color: #4caf50;">
                        ${progression.annotations.unlocked} / ${progression.annotations.total}
                    </div>
                    <div style="background: #333; height: 8px; border-radius: 4px; margin-top: 4px;">
                        <div style="background: #4caf50; height: 100%; width: ${progression.annotations.progress}%; border-radius: 4px;"></div>
                    </div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 4px;">
                        ${progression.annotations.progress}% débloquées • ${progression.annotations.locked} bloquées
                    </div>
                </div>
            </div>
            <div style="text-align: center; padding-top: 8px; border-top: 1px solid #444;">
                <strong>Progression globale : ${progression.overall.progress}%</strong>
            </div>
        `;
    } catch (err) {
        console.error('Erreur chargement progression', err);
        progressionPanel.innerHTML = '<p class="hint">Erreur de chargement</p>';
    }
}

// Afficher le graphique des missions
showGraphBtn.addEventListener('click', () => {
    missionGraphContainer.style.display = missionGraphContainer.style.display === 'none' ? 'block' : 'none';
    if (missionGraphContainer.style.display === 'block') {
        drawMissionGraph();
    }
});

async function drawMissionGraph() {
    const canvas = missionGraphCanvas;
    const ctx = canvas.getContext('2d');
    
    // Ajuster la taille du canvas
    const container = missionGraphContainer;
    canvas.width = container.clientWidth - 32;
    canvas.height = 400;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (currentMissions.length === 0) {
        ctx.fillStyle = '#aaa';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Aucune mission à afficher', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Charger les dépendances
    const missionsWithDeps = [];
    for (const m of currentMissions) {
        try {
            const missionDetail = await fetchJSON(`/api/missions/${m.id}`);
            missionsWithDeps.push({
                ...m,
                requiredMissions: missionDetail.requiredMissions || []
            });
        } catch (err) {
            missionsWithDeps.push({ ...m, requiredMissions: [] });
        }
    }
    
    // Positionnement en grille
    const cols = Math.ceil(Math.sqrt(missionsWithDeps.length));
    const rows = Math.ceil(missionsWithDeps.length / cols);
    const nodeWidth = (canvas.width - 40) / cols;
    const nodeHeight = (canvas.height - 40) / rows;
    const nodeRadius = 30;
    
    const nodes = [];
    missionsWithDeps.forEach((mission, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = 20 + col * nodeWidth + nodeWidth / 2;
        const y = 20 + row * nodeHeight + nodeHeight / 2;
        
        nodes.push({
            mission,
            x,
            y,
            id: mission.id
        });
    });
    
    // Dessiner les flèches (dépendances)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    missionsWithDeps.forEach(mission => {
        const node = nodes.find(n => n.id === mission.id);
        if (!node) return;
        
        mission.requiredMissions.forEach(req => {
            const reqNode = nodes.find(n => n.id === req.id);
            if (!reqNode) return;
            
            // Calculer l'angle et la position de la flèche
            const dx = node.x - reqNode.x;
            const dy = node.y - reqNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // Point de départ (bord du cercle requis)
            const startX = reqNode.x + Math.cos(angle) * nodeRadius;
            const startY = reqNode.y + Math.sin(angle) * nodeRadius;
            
            // Point d'arrivée (bord du cercle mission)
            const endX = node.x - Math.cos(angle) * nodeRadius;
            const endY = node.y - Math.sin(angle) * nodeRadius;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // Flèche
            const arrowLength = 8;
            const arrowAngle = Math.PI / 6;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
                endX - arrowLength * Math.cos(angle - arrowAngle),
                endY - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.moveTo(endX, endY);
            ctx.lineTo(
                endX - arrowLength * Math.cos(angle + arrowAngle),
                endY - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.stroke();
        });
    });
    
    // Dessiner les nœuds
    nodes.forEach(node => {
        const mission = node.mission;
        const isCompleted = mission.status === 'completed';
        const isUnlocked = mission.requiredMissions.length === 0 || 
            mission.requiredMissions.every(req => {
                const reqMission = missionsWithDeps.find(m => m.id === req.id);
                return reqMission && reqMission.status === 'completed';
            });
        
        // Cercle
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = isCompleted ? '#4caf50' : (isUnlocked ? '#4a9eff' : '#666');
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Texte
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = mission.title.length > 15 ? mission.title.substring(0, 15) + '...' : mission.title;
        ctx.fillText(text, node.x, node.y);
        
        // Icône de statut
        if (!isUnlocked) {
            ctx.fillStyle = '#ff9800';
            ctx.font = '16px Arial';
            ctx.fillText('🔒', node.x + nodeRadius - 8, node.y - nodeRadius + 8);
        }
    });
}

// Recharger les missions quand on change de map
mapSelect.addEventListener('change', async() => {
    await onMapChange();
    if (document.getElementById('tab-missions').classList.contains('active')) {
        await loadMissions();
        await loadProgression();
    }
});

// --- EMPÊCHER LE SCROLL DE LA CARTE DEPUIS LA SIDEBAR ET LES CONTRÔLES ---
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const controls = document.querySelector('.controls');
    
    // Empêcher la propagation du scroll depuis la sidebar
    if (sidebar) {
        sidebar.addEventListener('wheel', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }
    
    // Empêcher la propagation du scroll depuis les contrôles
    if (controls) {
        controls.addEventListener('wheel', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }
});

// --- INIT ---
resizeCanvas();
loadMaps().catch(err => {
    console.error(err);
    alert('Erreur au chargement des maps (regarde la console).');
});