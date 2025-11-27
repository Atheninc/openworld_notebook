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

app.delete('/api/shapes/:id', (req, res) => {
    db.prepare('DELETE FROM shapes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- START ---
app.listen(PORT, () => {
    console.log(`World Notes en route sur http://localhost:${PORT}`);
});