const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = 3000;

// --- DB INIT ---
const db = new Database('worldnotes.db');

db.exec(`
CREATE TABLE IF NOT EXISTS maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  layer_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL,
  height REAL,
  meta_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
  FOREIGN KEY(layer_id) REFERENCES layers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY(annotation_id) REFERENCES annotations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shapes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  layer_id INTEGER,
  name TEXT,
  shape_json TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
  FOREIGN KEY(layer_id) REFERENCES layers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  layer_id INTEGER,
  name TEXT,
  path_json TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
  FOREIGN KEY(layer_id) REFERENCES layers(id) ON DELETE SET NULL
);
`);

// --- UPLOAD CONFIG ---
const uploadDir = path.join(__dirname, 'public', 'maps');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.png';
        cb(null, 'map-' + unique + ext);
    }
});
const upload = multer({ storage });

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES MAPS ---
// Liste des maps
app.get('/api/maps', (req, res) => {
    const maps = db.prepare('SELECT * FROM maps ORDER BY id').all();
    res.json(maps);
});

// Création d'une map (name + image_path)
app.post('/api/maps', (req, res) => {
    const { name, image_path } = req.body;
    if (!name || !image_path) {
        return res.status(400).json({ error: 'name et image_path sont obligatoires' });
    }
    const stmt = db.prepare('INSERT INTO maps (name, image_path) VALUES (?, ?)');
    const info = stmt.run(name, image_path);
    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(map);
});

// Détails d’une map
app.get('/api/maps/:id', (req, res) => {
    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
    if (!map) return res.status(404).json({ error: 'map non trouvée' });
    res.json(map);
});

// Upload d'une image de map (drag & drop)
app.post('/api/upload-map', upload.single('mapImage'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier' });
    }
    const image_path = '/maps/' + req.file.filename;
    res.status(201).json({ image_path });
});

// --- ROUTES LAYERS ---
app.get('/api/maps/:id/layers', (req, res) => {
    const layers = db
        .prepare('SELECT * FROM layers WHERE map_id = ? ORDER BY "order" ASC, id ASC')
        .all(req.params.id);
    res.json(layers);
});

app.post('/api/maps/:id/layers', (req, res) => {
    const { name, order = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'name est obligatoire' });
    const stmt = db.prepare('INSERT INTO layers (map_id, name, "order") VALUES (?, ?, ?)');
    const info = stmt.run(req.params.id, name, order);
    const layer = db.prepare('SELECT * FROM layers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(layer);
});

// --- ROUTES ANNOTATIONS ---
app.get('/api/maps/:id/annotations', (req, res) => {
    const { layer_id, type } = req.query;
    let sql = 'SELECT * FROM annotations WHERE map_id = ?';
    const params = [req.params.id];

    if (layer_id) {
        sql += ' AND layer_id = ?';
        params.push(layer_id);
    }
    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }

    const annots = db.prepare(sql + ' ORDER BY created_at ASC').all(...params);
    res.json(annots.map(a => ({
        ...a,
        meta: a.meta_json ? JSON.parse(a.meta_json) : null
    })));
});

app.post('/api/annotations', (req, res) => {
    const {
        map_id,
        layer_id = null,
        type,
        title,
        description = '',
        x,
        y,
        width = null,
        height = null,
        meta = null
    } = req.body;

    if (!map_id || !type || !title || x == null || y == null) {
        return res.status(400).json({ error: 'map_id, type, title, x, y sont obligatoires' });
    }

    const meta_json = meta ? JSON.stringify(meta) : null;
    const stmt = db.prepare(`
    INSERT INTO annotations (map_id, layer_id, type, title, description, x, y, width, height, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const info = stmt.run(map_id, layer_id, type, title, description, x, y, width, height, meta_json);
    const annot = db.prepare('SELECT * FROM annotations WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({
        ...annot,
        meta: annot.meta_json ? JSON.parse(annot.meta_json) : null
    });
});

app.put('/api/annotations/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'annotation non trouvée' });

    const {
        title = existing.title,
            description = existing.description,
            type = existing.type,
            x = existing.x,
            y = existing.y,
            width = existing.width,
            height = existing.height,
            meta = existing.meta_json ? JSON.parse(existing.meta_json) : null,
            layer_id = existing.layer_id
    } = req.body;

    const meta_json = meta ? JSON.stringify(meta) : null;

    db.prepare(`
    UPDATE annotations
    SET title = ?, description = ?, type = ?, x = ?, y = ?, width = ?, height = ?, meta_json = ?, layer_id = ?
    WHERE id = ?
  `).run(title, description, type, x, y, width, height, meta_json, layer_id, req.params.id);

    const annot = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
    res.json({
        ...annot,
        meta: annot.meta_json ? JSON.parse(annot.meta_json) : null
    });
});

app.delete('/api/annotations/:id', (req, res) => {
    db.prepare('DELETE FROM annotations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- ROUTES MEDIA ---
app.get('/api/annotations/:id/media', (req, res) => {
    const rows = db
        .prepare('SELECT * FROM media WHERE annotation_id = ? ORDER BY id')
        .all(req.params.id);
    res.json(rows);
});

app.post('/api/annotations/:id/media', (req, res) => {
    const { kind, url, description = '' } = req.body;
    if (!kind || !url) {
        return res.status(400).json({ error: 'kind et url sont obligatoires' });
    }
    const stmt = db.prepare(`
    INSERT INTO media (annotation_id, kind, url, description)
    VALUES (?, ?, ?, ?)
  `);
    const info = stmt.run(req.params.id, kind, url, description);
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(media);
});

// --- ROUTES SHAPES ---
app.get('/api/maps/:id/shapes', (req, res) => {
    const { layer_id } = req.query;
    let sql = 'SELECT * FROM shapes WHERE map_id = ?';
    const params = [req.params.id];

    if (layer_id) {
        sql += ' AND layer_id = ?';
        params.push(layer_id);
    }

    const rows = db.prepare(sql + ' ORDER BY created_at ASC').all(...params);
    res.json(rows.map(s => ({
        ...s,
        shape: JSON.parse(s.shape_json),
        meta: s.meta_json ? JSON.parse(s.meta_json) : null
    })));
});

app.post('/api/shapes', (req, res) => {
    const { map_id, layer_id = null, name = '', points, meta = null } = req.body;
    if (!map_id || !points || !Array.isArray(points) || points.length < 3) {
        return res.status(400).json({ error: 'map_id et au moins 3 points sont obligatoires' });
    }
    const shape_json = JSON.stringify(points);
    const meta_json = meta ? JSON.stringify(meta) : null;

    const stmt = db.prepare(`
    INSERT INTO shapes (map_id, layer_id, name, shape_json, meta_json)
    VALUES (?, ?, ?, ?, ?)
  `);
    const info = stmt.run(map_id, layer_id, name, shape_json, meta_json);
    const s = db.prepare('SELECT * FROM shapes WHERE id = ?').get(info.lastInsertRowid);

    res.status(201).json({
        ...s,
        shape: JSON.parse(s.shape_json),
        meta: s.meta_json ? JSON.parse(s.meta_json) : null
    });
});

app.put('/api/shapes/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM shapes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'shape non trouvée' });

    const { map_id, layer_id = existing.layer_id, name = existing.name, points, meta = null } = req.body;
    if (!points || !Array.isArray(points) || points.length < 3) {
        return res.status(400).json({ error: 'au moins 3 points sont obligatoires' });
    }

    const shape_json = JSON.stringify(points);
    const meta_json = meta ? JSON.stringify(meta) : existing.meta_json;

    db.prepare(`
    UPDATE shapes
    SET map_id = ?, layer_id = ?, name = ?, shape_json = ?, meta_json = ?
    WHERE id = ?
  `).run(map_id, layer_id, name, shape_json, meta_json, req.params.id);

    const s = db.prepare('SELECT * FROM shapes WHERE id = ?').get(req.params.id);
    res.json({
        ...s,
        shape: JSON.parse(s.shape_json),
        meta: s.meta_json ? JSON.parse(s.meta_json) : null
    });
});

app.delete('/api/shapes/:id', (req, res) => {
    db.prepare('DELETE FROM shapes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- ROUTES PATHS ---
app.get('/api/maps/:id/paths', (req, res) => {
    const { layer_id } = req.query;
    let sql = 'SELECT * FROM paths WHERE map_id = ?';
    const params = [req.params.id];

    if (layer_id) {
        sql += ' AND layer_id = ?';
        params.push(layer_id);
    }

    const rows = db.prepare(sql + ' ORDER BY created_at ASC').all(...params);
    res.json(rows.map(p => ({
        ...p,
        path: JSON.parse(p.path_json),
        meta: p.meta_json ? JSON.parse(p.meta_json) : null
    })));
});

app.post('/api/paths', (req, res) => {
    const { map_id, layer_id = null, name = '', points, meta = null } = req.body;
    if (!map_id || !points || !Array.isArray(points) || points.length < 2) {
        return res.status(400).json({ error: 'map_id et au moins 2 points sont obligatoires' });
    }
    const path_json = JSON.stringify(points);
    const meta_json = meta ? JSON.stringify(meta) : null;

    const stmt = db.prepare(`
    INSERT INTO paths (map_id, layer_id, name, path_json, meta_json)
    VALUES (?, ?, ?, ?, ?)
  `);
    const info = stmt.run(map_id, layer_id, name, path_json, meta_json);
    const p = db.prepare('SELECT * FROM paths WHERE id = ?').get(info.lastInsertRowid);

    res.status(201).json({
        ...p,
        path: JSON.parse(p.path_json),
        meta: p.meta_json ? JSON.parse(p.meta_json) : null
    });
});

app.put('/api/paths/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM paths WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'path non trouvé' });

    const { map_id, layer_id = existing.layer_id, name = existing.name, points, meta = null } = req.body;
    if (!points || !Array.isArray(points) || points.length < 2) {
        return res.status(400).json({ error: 'au moins 2 points sont obligatoires' });
    }

    const path_json = JSON.stringify(points);
    const meta_json = meta ? JSON.stringify(meta) : existing.meta_json;

    db.prepare(`
    UPDATE paths
    SET map_id = ?, layer_id = ?, name = ?, path_json = ?, meta_json = ?
    WHERE id = ?
  `).run(map_id, layer_id, name, path_json, meta_json, req.params.id);

    const p = db.prepare('SELECT * FROM paths WHERE id = ?').get(req.params.id);
    res.json({
        ...p,
        path: JSON.parse(p.path_json),
        meta: p.meta_json ? JSON.parse(p.meta_json) : null
    });
});

app.delete('/api/paths/:id', (req, res) => {
    db.prepare('DELETE FROM paths WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- ROUTES IMPORT/EXPORT ---
app.get('/api/export', (req, res) => {
    const maps = db.prepare('SELECT * FROM maps ORDER BY id').all();
    const layers = db.prepare('SELECT * FROM layers ORDER BY id').all();
    const annotations = db.prepare('SELECT * FROM annotations ORDER BY id').all();
    const shapes = db.prepare('SELECT * FROM shapes ORDER BY id').all();
    const paths = db.prepare('SELECT * FROM paths ORDER BY id').all();
    const media = db.prepare('SELECT * FROM media ORDER BY id').all();

    const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        maps: maps,
        layers: layers,
        annotations: annotations.map(a => ({
            ...a,
            meta: a.meta_json ? JSON.parse(a.meta_json) : null
        })),
        shapes: shapes.map(s => ({
            ...s,
            shape: JSON.parse(s.shape_json),
            meta: s.meta_json ? JSON.parse(s.meta_json) : null
        })),
        paths: paths.map(p => ({
            ...p,
            path: JSON.parse(p.path_json),
            meta: p.meta_json ? JSON.parse(p.meta_json) : null
        })),
        media: media
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="worldnotes-export.json"');
    res.json(exportData);
});

app.post('/api/import', (req, res) => {
    const { maps, layers, annotations, shapes, paths, media } = req.body;

    if (!maps || !Array.isArray(maps)) {
        return res.status(400).json({ error: 'Format invalide : maps requis' });
    }

    const transaction = db.transaction(() => {
        let imported = { maps: 0, layers: 0, annotations: 0, shapes: 0, paths: 0, media: 0 };

        // Import maps
        if (maps && Array.isArray(maps)) {
            const stmt = db.prepare('INSERT INTO maps (name, image_path, created_at) VALUES (?, ?, ?)');
            maps.forEach(m => {
                stmt.run(m.name, m.image_path, m.created_at || new Date().toISOString());
                imported.maps++;
            });
        }

        // Import layers
        if (layers && Array.isArray(layers)) {
            const stmt = db.prepare('INSERT INTO layers (map_id, name, "order") VALUES (?, ?, ?)');
            layers.forEach(l => {
                stmt.run(l.map_id, l.name, l.order || 0);
                imported.layers++;
            });
        }

        // Import annotations
        if (annotations && Array.isArray(annotations)) {
            const stmt = db.prepare(`
        INSERT INTO annotations (map_id, layer_id, type, title, description, x, y, width, height, meta_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            annotations.forEach(a => {
                const meta_json = a.meta ? JSON.stringify(a.meta) : (a.meta_json || null);
                stmt.run(
                    a.map_id, a.layer_id, a.type, a.title, a.description || '',
                    a.x, a.y, a.width || null, a.height || null,
                    meta_json, a.created_at || new Date().toISOString()
                );
                imported.annotations++;
            });
        }

        // Import shapes
        if (shapes && Array.isArray(shapes)) {
            const stmt = db.prepare('INSERT INTO shapes (map_id, layer_id, name, shape_json, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)');
            shapes.forEach(s => {
                const shape_json = JSON.stringify(s.shape || s.points || []);
                const meta_json = s.meta ? JSON.stringify(s.meta) : (s.meta_json || null);
                stmt.run(s.map_id, s.layer_id || null, s.name || '', shape_json, meta_json, s.created_at || new Date().toISOString());
                imported.shapes++;
            });
        }

        // Import paths
        if (paths && Array.isArray(paths)) {
            const stmt = db.prepare('INSERT INTO paths (map_id, layer_id, name, path_json, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)');
            paths.forEach(p => {
                const path_json = JSON.stringify(p.path || p.points || []);
                const meta_json = p.meta ? JSON.stringify(p.meta) : (p.meta_json || null);
                stmt.run(p.map_id, p.layer_id || null, p.name || '', path_json, meta_json, p.created_at || new Date().toISOString());
                imported.paths++;
            });
        }

        // Import media
        if (media && Array.isArray(media)) {
            const stmt = db.prepare('INSERT INTO media (annotation_id, kind, url, description) VALUES (?, ?, ?, ?)');
            media.forEach(m => {
                stmt.run(m.annotation_id, m.kind, m.url, m.description || '');
                imported.media++;
            });
        }

        return imported;
    });

    try {
        const imported = transaction();
        res.json({ success: true, imported });
    } catch (err) {
        console.error('Erreur import:', err);
        res.status(500).json({ error: 'Erreur lors de l\'import', details: err.message });
    }
});

// --- START ---
app.listen(PORT, () => {
    console.log(`World Notes en route sur http://localhost:${PORT}`);
});