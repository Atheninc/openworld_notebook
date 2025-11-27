# World Notes – Open World Annotator

Outil web pour annoter des cartes d'open world (jeux vidéo). Permet de créer des annotations sur des cartes, organiser les éléments en layers, dessiner des zones, et gérer des informations sur les personnages, lieux, événements, easter eggs et architecture.

## 🎯 Fonctionnalités

### Gestion des cartes
- **Upload de cartes** : Glisser-déposer ou sélectionner des images de cartes
- **Création manuelle** : Ajouter une carte avec un nom et un chemin d'image
- **Navigation** : Zoom (molette) et déplacement (clic milieu) sur les cartes

### Annotations
- **Types d'annotations** :
  - 👤 Personnage
  - 📍 Lieu
  - 🎉 Évènement
  - 🥚 Easter Egg
  - 🏛️ Architecture
- **Informations** : Titre, description, tags, références (URLs)
- **Positionnement** : Clic sur la carte pour placer, glisser-déposer pour déplacer
- **Filtrage** : Par layer et par type

### Layers (Calques)
- Organisation des annotations et zones par calques
- Filtrage par layer pour afficher/masquer des éléments

### Zones (Shapes)
- Dessin de polygones sur la carte
- Édition des points des zones existantes
- Nommage des zones (biomes, régions, donjons, etc.)

## 🛠️ Technologies

- **Backend** : Node.js avec Express
- **Base de données** : SQLite (better-sqlite3)
- **Frontend** : HTML, CSS, JavaScript vanilla
- **Upload** : Multer pour la gestion des fichiers

## 📦 Installation

1. Cloner le dépôt :
```bash
git clone <url-du-repo>
cd openworld_notebook
```

2. Installer les dépendances :
```bash
npm install
```

3. Installer multer (si non présent) :
```bash
npm install multer
```

4. Démarrer le serveur :
```bash
npm start
```

5. Ouvrir dans le navigateur :
```
http://localhost:3000
```

## 📁 Structure du projet

```
openworld_notebook/
├── server.js          # Serveur Express et API REST
├── package.json       # Dépendances et scripts
├── public/
│   ├── index.html     # Interface utilisateur
│   ├── app.js         # Logique frontend
│   ├── styles.css     # Styles
│   └── maps/          # Images de cartes uploadées
└── worldnotes.db      # Base de données SQLite (créée automatiquement)
```

## 🗄️ Structure de la base de données

### Tables principales

- **maps** : Cartes (id, name, image_path, created_at)
- **layers** : Calques (id, map_id, name, order)
- **annotations** : Annotations (id, map_id, layer_id, type, title, description, x, y, width, height, meta_json)
- **shapes** : Zones/polygones (id, map_id, layer_id, name, shape_json, meta_json)
- **media** : Médias liés aux annotations (id, annotation_id, kind, url, description)

## 🎮 Utilisation

### Créer une carte
1. Glisser-déposer une image dans la zone de drop, ou
2. Remplir le formulaire "Ajouter map (manuel)" avec un nom et un chemin d'image

### Ajouter une annotation
1. Sélectionner une carte
2. Cliquer sur la carte à l'emplacement souhaité
3. Remplir le formulaire (titre, type, description, tags, références)
4. Cliquer sur "Enregistrer"

### Déplacer une annotation
- Cliquer et glisser le marqueur sur la carte

### Créer un layer
1. Sélectionner une carte
2. Entrer un nom dans "Nom du layer"
3. Cliquer sur "+ Ajouter layer"

### Dessiner une zone
1. Entrer un nom pour la zone (optionnel)
2. Cliquer sur "✏️ Dessiner une zone"
3. Cliquer sur la carte pour placer les points du polygone
4. Cliquer sur "✅ Terminer la zone" (minimum 3 points requis)

### Éditer une zone
1. Cliquer sur une zone dans la liste pour la sélectionner
2. Glisser les points jaunes pour modifier la forme

### Filtrer
- Sélectionner un layer dans le menu déroulant pour n'afficher que ses éléments
- Sélectionner un type dans le filtre "Type" pour n'afficher que ce type d'annotations

## 🔧 API REST

### Maps
- `GET /api/maps` - Liste des cartes
- `GET /api/maps/:id` - Détails d'une carte
- `POST /api/maps` - Créer une carte
- `POST /api/upload-map` - Upload d'une image de carte

### Layers
- `GET /api/maps/:id/layers` - Liste des layers d'une carte
- `POST /api/maps/:id/layers` - Créer un layer

### Annotations
- `GET /api/maps/:id/annotations` - Liste des annotations (filtres: layer_id, type)
- `POST /api/annotations` - Créer une annotation
- `PUT /api/annotations/:id` - Modifier une annotation
- `DELETE /api/annotations/:id` - Supprimer une annotation

### Shapes
- `GET /api/maps/:id/shapes` - Liste des zones (filtre: layer_id)
- `POST /api/shapes` - Créer une zone
- `DELETE /api/shapes/:id` - Supprimer une zone

### Media
- `GET /api/annotations/:id/media` - Liste des médias d'une annotation
- `POST /api/annotations/:id/media` - Ajouter un média

## 📝 Notes

- Les coordonnées sont stockées en valeurs relatives (0.0 à 1.0) pour s'adapter à différentes tailles d'écran
- La base de données SQLite est créée automatiquement au premier démarrage
- Les images uploadées sont stockées dans `public/maps/` avec des noms uniques

## 🚀 Développement

Le serveur démarre sur le port 3000 par défaut. Modifier `PORT` dans `server.js` pour changer le port.

## 💡 Fonctionnalités futures

Voici une liste de fonctionnalités intéressantes qui pourraient être ajoutées au projet :

### 🎨 Amélioration de l'interface et de l'expérience utilisateur

- **Thèmes personnalisables** : Mode sombre/clair, couleurs personnalisables par type d'annotation
- **Icônes personnalisées** : Permettre d'uploader des icônes personnalisées pour chaque annotation
- **Mini-map** : Vue d'ensemble réduite pour naviguer rapidement sur de grandes cartes
- **Raccourcis clavier** : Navigation et actions rapides au clavier (Ctrl+Z pour annuler, etc.)
- **Barre de recherche** : Rechercher des annotations par titre, tags, description
- **Vue liste améliorée** : Tri, pagination, vue compacte/détaillée des annotations
- **Tooltips enrichis** : Afficher un aperçu de l'annotation au survol du marqueur
- **Indicateur de zoom** : Afficher le niveau de zoom actuel
- **Raccourci pour centrer la carte** : Bouton pour recentrer la vue

### 🔍 Recherche et filtrage avancés

- **Recherche full-text** : Recherche dans les descriptions, tags, références
- **Filtres multiples** : Combiner plusieurs filtres (layer + type + tags)
- **Filtres par date** : Filtrer les annotations par date de création
- **Sauvegarde de filtres** : Créer des vues prédéfinies avec filtres sauvegardés
- **Recherche géographique** : Trouver toutes les annotations dans une zone spécifique
- **Filtres par tags** : Sélection multiple de tags pour filtrer

### 📊 Visualisation et statistiques

- **Légende interactive** : Légende cliquable pour filtrer par type
- **Compteurs** : Afficher le nombre d'annotations par type/layer
- **Statistiques** : Graphiques et statistiques sur les annotations (répartition par type, etc.)
- **Heatmap** : Visualisation de la densité d'annotations sur la carte
- **Timeline** : Vue chronologique des annotations créées
- **Carte de chaleur** : Zones les plus annotées mises en évidence

### 🔗 Relations et organisation

- **Liens entre annotations** : Créer des connexions/relations entre annotations
- **Groupes d'annotations** : Grouper des annotations liées (ex: quête avec plusieurs étapes)
- **Hiérarchie de layers** : Layers imbriqués ou organisés en catégories
- **Templates de layers** : Créer des templates de layers réutilisables
- **Duplication de layers** : Copier un layer avec toutes ses annotations
- **Import/Export de layers** : Partager des layers entre cartes

### 📸 Médias et captures

- **Upload d'images** : Attacher des images directement aux annotations (pas seulement URLs)
- **Capture d'écran intégrée** : Prendre des captures depuis l'interface
- **Galerie de médias** : Vue galerie pour tous les médias d'une annotation
- **Vignettes** : Aperçus des images dans les tooltips
- **Vidéo embarquée** : Support pour les vidéos YouTube/Vimeo dans les annotations
- **Audio notes** : Enregistrer des notes audio pour les annotations

### 🗺️ Gestion des cartes

- **Multi-cartes** : Vue avec plusieurs cartes côte à côte
- **Calques de cartes** : Superposer plusieurs cartes (ex: carte de base + carte des ressources)
- **Miniatures des cartes** : Aperçus dans la liste de sélection
- **Édition de cartes** : Rotation, recadrage, ajustement de contraste/luminosité
- **Coordonnées GPS** : Si les cartes ont des coordonnées réelles, conversion GPS
- **Échelle/référence** : Ajouter une barre d'échelle sur les cartes
- **Points de repère** : Système de coordonnées personnalisé (ex: grille de jeu)

### 🎯 Annotations avancées

- **Annotations avec zone** : Rectangles/cercles en plus des points
- **Annotations de chemin** : Dessiner des routes/chemins entre points
- **Annotations conditionnelles** : Afficher/masquer selon des conditions
- **Priorités** : Système de priorité pour les annotations (important, normal, secondaire)
- **Statut** : Marquer comme "complété", "à faire", "en cours"
- **Dates/échéances** : Ajouter des dates importantes aux annotations
- **Notes privées** : Notes visibles seulement par le créateur
- **Commentaires** : Système de commentaires sur les annotations
- **Historique** : Historique des modifications d'une annotation

### 🛠️ Outils de dessin

- **Formes prédéfinies** : Cercles, rectangles, lignes en plus des polygones
- **Outils de mesure** : Mesurer des distances sur la carte
- **Grille de dessin** : Afficher une grille pour aligner les éléments
- **Snap to grid** : Alignement automatique sur une grille
- **Outils de texte** : Ajouter du texte directement sur la carte
- **Flèches directionnelles** : Indicateurs de direction
- **Styles de zones** : Différents styles (plein, hachuré, pointillé)

### 💾 Import/Export et partage

- **Export JSON/CSV** : Exporter toutes les données pour sauvegarde
- **Import de données** : Importer des annotations depuis un fichier
- **Export d'image** : Exporter la carte avec annotations en PNG/PDF
- **Partage de cartes** : Générer un lien de partage pour une carte
- **Mode lecture seule** : Vue publique sans possibilité d'édition
- **Export pour imprimer** : Format optimisé pour impression
- **Synchronisation cloud** : Sauvegarde automatique dans le cloud
- **Backup automatique** : Sauvegardes régulières de la base de données

### 👥 Collaboration

- **Multi-utilisateurs** : Système d'authentification et de comptes
- **Permissions** : Contrôle d'accès (lecture seule, édition, admin)
- **Historique collaboratif** : Voir qui a créé/modifié quoi
- **Notifications** : Notifications quand quelqu'un modifie une annotation
- **Chat/commentaires** : Communication entre utilisateurs
- **Attribution** : Créditer les créateurs d'annotations

### 🔧 Fonctionnalités techniques

- **Mode hors-ligne** : Fonctionnement sans connexion avec synchronisation
- **Cache intelligent** : Cache des images et données pour performance
- **Compression d'images** : Compression automatique des images uploadées
- **Thumbnails** : Génération automatique de miniatures
- **API complète** : Documentation Swagger/OpenAPI
- **Webhooks** : Notifications externes lors de modifications
- **Versioning** : Système de versions pour les cartes
- **Performance** : Lazy loading pour les grandes cartes
- **PWA** : Transformer en Progressive Web App (installable)

### 🎮 Spécifique aux jeux vidéo

- **Intégration avec guides** : Liens vers des guides externes (Wiki, etc.)
- **Système de quêtes** : Organiser les annotations en quêtes avec progression
- **Niveaux de difficulté** : Marquer la difficulté d'accès à un lieu
- **Ressources** : Tracker les ressources disponibles à chaque endroit
- **Ennemis/Boss** : Informations détaillées sur les ennemis rencontrés
- **Loot tables** : Liste des objets trouvables
- **Conditions météo** : Annotations conditionnelles selon la météo (si applicable)
- **Horloge du jeu** : Annotations visibles selon l'heure du jour/nuit du jeu

### 📱 Mobile et accessibilité

- **Version mobile responsive** : Interface optimisée pour mobile
- **Touch gestures** : Gestes tactiles pour zoom/pan sur mobile
- **Accessibilité** : Support lecteurs d'écran, navigation au clavier
- **Mode contraste élevé** : Pour les utilisateurs malvoyants
- **Taille de police ajustable** : Personnalisation de la taille du texte

### 🔐 Sécurité et données

- **Chiffrement** : Chiffrement des données sensibles
- **Validation des données** : Validation stricte des entrées
- **Rate limiting** : Protection contre les abus
- **Sanitization** : Nettoyage des entrées utilisateur
- **Logs d'audit** : Journalisation des actions importantes

## 📄 Licence

Ce projet est un outil open source pour l'annotation de cartes de jeux vidéo.
