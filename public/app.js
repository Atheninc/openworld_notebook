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
const annotTags = document.getElementById('annot-tags');
const annotRefs = document.getElementById('annot-refs');
const deleteAnnotBtn = document.getElementById('delete-annot-btn');

const annotationsList = document.getElementById('annotations-list');

// Upload map
const dropZone = document.getElementById('drop-zone');
const mapFileInput = document.getElementById('map-file-input');

// Shapes
const shapeNameInput = document.getElementById('shape-name');
const startShapeBtn = document.getElementById('start-shape-btn');
const finishShapeBtn = document.getElementById('finish-shape-btn');
const shapesList = document.getElementById('shapes-list');

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

        if (s.id === selectedShapeId) {
            mapCtx.fillStyle = 'rgba(255, 255, 255, 0.10)';
            mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        } else {
            mapCtx.fillStyle = 'rgba(66, 165, 245, 0.18)';
            mapCtx.strokeStyle = 'rgba(144, 202, 249, 1)';
        }

        mapCtx.fill();
        mapCtx.stroke();
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
        const li = document.createElement('li');
        li.textContent = `[${a.type}] ${a.title}`;
        li.dataset.id = a.id;
        if (a.id === selectedAnnotationId) {
            li.style.background = '#333';
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

    // Création d'une annotation (préparation)
    lastClickPosition = coords;

    selectedAnnotationId = null;
    annotIdInput.value = '';
    annotTitle.value = '';
    annotDesc.value = '';
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
            meta
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
            y: existing ? existing.y : 0.5
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
    const body = {
        map_id: currentMap.id,
        layer_id: layerSelect.value || null,
        name,
        points: currentShapePoints
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

// --- ÉDITION DES SHAPES : drag des coins ---
mapCanvas.addEventListener('mousedown', (e) => {
    if (!currentMap) return;
    if (drawingShape) return; // si on dessine une nouvelle shape, pas d'édition

    const coords = getRelativeCoordsFromEvent(e);
    if (!coords) return;

    const handle = getHandleAtCoords(coords);
    if (handle) {
        draggingShapePoint = {
            shapeId: handle.shape.id,
            pointIndex: handle.pointIndex
        };
        e.preventDefault();
        e.stopPropagation(); // évite le click pour création d'annotation
    }
});

// --- ZOOM (molette) ---
mapContainer.addEventListener('wheel', (e) => {
    if (!currentMap) return;
    e.preventDefault();

    const rect = mapInner.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * delta, 0.5), 4);
    const zoomFactor = newZoom / zoom;

    offsetX = mouseX - zoomFactor * (mouseX - offsetX);
    offsetY = mouseY - zoomFactor * (mouseY - offsetY);

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
                        points: shape.shape // le backend reçoit "points"
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
});

typeFilter.addEventListener('change', loadAnnotations);

// --- INIT ---
resizeCanvas();
loadMaps().catch(err => {
    console.error(err);
    alert('Erreur au chargement des maps (regarde la console).');
});