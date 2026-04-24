/**
 * EduSchedule — script.js
 * Application de gestion d'emploi du temps scolaire
 * Vanilla JS + localStorage — aucune dépendance externe
 * ──────────────────────────────────────────────────────
 */

/* ════════════════════════════════════════════════════
   1. CONSTANTES & CONFIGURATION
   ════════════════════════════════════════════════════ */

/** Jours de la semaine affichés */
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Créneaux horaires (début de chaque heure) */
const HOURS = [
  '07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','15:00','16:00','17:00','18:00'
];

/** Clés localStorage */
const STORAGE_KEYS = {
  classes:  'edu_classes',
  teachers: 'edu_teachers',
  rooms:    'edu_rooms',
  subjects: 'edu_subjects',
  courses:  'edu_courses',
};

/* ════════════════════════════════════════════════════
   2. ÉTAT GLOBAL
   ════════════════════════════════════════════════════ */

/** Objet central contenant toutes les données */
const state = {
  classes:  [],
  teachers: [],
  rooms:    [],
  subjects: [],
  courses:  [],   // { id, day, hour, classId, teacherId, subjectId, roomId }
};

/* ════════════════════════════════════════════════════
   3. UTILITAIRES
   ════════════════════════════════════════════════════ */

/** Génère un identifiant unique simple */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

/** Récupère un élément du DOM */
const $ = id => document.getElementById(id);

/** Formate l'heure pour l'affichage (ex: "08:00 → 09:00") */
const formatSlot = hour => {
  const [h] = hour.split(':').map(Number);
  const end = String(h + 1).padStart(2, '0') + ':00';
  return `${hour} – ${end}`;
};

/** Affiche un toast de notification */
function showToast(message, type = 'info', duration = 3200) {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/** Trouve un élément par id dans un tableau */
const findById = (arr, id) => arr.find(x => x.id === id);

/** Sécurise une chaîne HTML */
const esc = str => String(str ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ════════════════════════════════════════════════════
   4. PERSISTANCE — localStorage
   ════════════════════════════════════════════════════ */

/** Charge toutes les données depuis localStorage */
function loadData() {
  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) state[key] = JSON.parse(raw);
    } catch { /* données corrompues → ignorer */ }
  }
}

/** Sauvegarde une collection spécifique */
function saveData(key) {
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(state[key]));
  } catch (e) {
    showToast('Erreur de sauvegarde. Stockage plein ?', 'error');
  }
}

/** Sauvegarde tout */
function saveAll() {
  for (const key of Object.keys(STORAGE_KEYS)) saveData(key);
}

/* ════════════════════════════════════════════════════
   5. GESTION DES CONFLITS
   ════════════════════════════════════════════════════ */

/**
 * Vérifie si un nouveau cours crée un conflit.
 * @param {object} candidate - Le cours à tester
 * @param {string|null} excludeId - ID d'un cours à ignorer (modification)
 * @returns {{ conflict: boolean, message: string }}
 */
function checkConflicts(candidate, excludeId = null) {
  const { day, hour, classId, teacherId, roomId } = candidate;

  // Cours existants sur le même créneau (même jour + même heure)
  const sameSlot = state.courses.filter(
    c => c.day === day && c.hour === hour && c.id !== excludeId
  );

  // 1) Conflit de classe
  const classConflict = sameSlot.find(c => c.classId === classId);
  if (classConflict) {
    const cls = findById(state.classes, classId);
    const subj = findById(state.subjects, classConflict.subjectId);
    return {
      conflict: true,
      message: `La classe "${cls?.name}" a déjà un cours de "${subj?.name ?? '?'}" à ce créneau.`
    };
  }

  // 2) Conflit de professeur
  const teacherConflict = sameSlot.find(c => c.teacherId === teacherId);
  if (teacherConflict) {
    const teacher = findById(state.teachers, teacherId);
    const cls = findById(state.classes, teacherConflict.classId);
    return {
      conflict: true,
      message: `Le professeur "${teacher?.name}" est déjà assigné à la classe "${cls?.name ?? '?'}" à ce créneau.`
    };
  }

  // 3) Conflit de salle (seulement si une salle est choisie)
  if (roomId) {
    const roomConflict = sameSlot.find(c => c.roomId === roomId && c.roomId);
    if (roomConflict) {
      const room = findById(state.rooms, roomId);
      const cls = findById(state.classes, roomConflict.classId);
      return {
        conflict: true,
        message: `La salle "${room?.name}" est déjà occupée par la classe "${cls?.name ?? '?'}" à ce créneau.`
      };
    }
  }

  return { conflict: false, message: '' };
}

/* ════════════════════════════════════════════════════
   6. RENDU DE LA GRILLE (EMPLOI DU TEMPS)
   ════════════════════════════════════════════════════ */

/** Retourne le filtre actif { type, value } */
function getActiveFilter() {
  const type  = $('filterType').value;
  const value = $('filterValue').value;
  return { type, value };
}

/** Construit et insère le tableau dans le DOM */
function renderTimetable() {
  const grid = $('timetableGrid');
  const filter = getActiveFilter();
  grid.innerHTML = '';

  // ── En-tête ──
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Heure</th>' +
    DAYS.map(d => `<th>${d}</th>`).join('');
  thead.appendChild(headerRow);
  grid.appendChild(thead);

  // ── Corps ──
  const tbody = document.createElement('tbody');

  for (const hour of HOURS) {
    const tr = document.createElement('tr');

    // Colonne heure
    const timeTd = document.createElement('td');
    timeTd.className = 'time-cell';
    timeTd.innerHTML = `<strong>${hour}</strong>`;
    tr.appendChild(timeTd);

    // Une cellule par jour
    for (const day of DAYS) {
      const td = document.createElement('td');
      td.className = 'slot';
      td.dataset.day = day;
      td.dataset.hour = hour;

      // Trouver le cours correspondant
      const course = state.courses.find(c => c.day === day && c.hour === hour);

      if (course) {
        // Appliquer le filtre
        let dimmed = false;
        if (filter.type !== 'all' && filter.value) {
          const match =
            (filter.type === 'class'   && course.classId   === filter.value) ||
            (filter.type === 'teacher' && course.teacherId === filter.value) ||
            (filter.type === 'room'    && course.roomId    === filter.value);
          if (!match) dimmed = true;
        }

        if (dimmed) {
          td.classList.add('slot-dimmed');
        } else {
          td.classList.add('slot-filled');
          td.appendChild(buildCourseCard(course));
        }

        td.addEventListener('click', () => openModal(day, hour, course));
      } else {
        // Cellule vide → bouton "+"
        const addBtn = document.createElement('div');
        addBtn.className = 'add-btn';
        addBtn.textContent = '+';
        td.appendChild(addBtn);
        td.addEventListener('click', () => openModal(day, hour, null));
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  grid.appendChild(tbody);
}

/** Crée la carte de cours (élément DOM) */
function buildCourseCard(course) {
  const subj    = findById(state.subjects, course.subjectId);
  const cls     = findById(state.classes,  course.classId);
  const teacher = findById(state.teachers, course.teacherId);
  const room    = findById(state.rooms,    course.roomId);

  const color = subj?.color ?? '#4f7cff';

  const card = document.createElement('div');
  card.className = 'course-card';
  card.style.color = color;

  card.innerHTML = `
    <div class="c-subject">${esc(subj?.name ?? '?')}</div>
    <div class="c-class">${esc(cls?.name ?? '?')}</div>
    <div class="c-teacher">${esc(teacher?.name ?? '?')}</div>
    ${room ? `<div class="c-room">📍 ${esc(room.name)}</div>` : ''}
  `;

  return card;
}

/* ════════════════════════════════════════════════════
   7. MODAL D'AJOUT / MODIFICATION D'UN COURS
   ════════════════════════════════════════════════════ */

/** Ouvre le modal pour un créneau donné */
function openModal(day, hour, existingCourse) {
  $('slot-day').value  = day;
  $('slot-hour').value = hour;
  $('slot-course-id').value = existingCourse?.id ?? '';

  // Titre & info créneau
  $('modal-title').textContent = existingCourse ? 'Modifier le cours' : 'Ajouter un cours';
  $('modalSlotInfo').textContent = `${day}  ·  ${formatSlot(hour)}`;

  // Peupler les selects
  populateSelect('course-class',   state.classes,   'Sélectionner une classe');
  populateSelect('course-teacher', state.teachers,  'Sélectionner un professeur');
  populateSelect('course-subject', state.subjects,  'Sélectionner une matière');
  populateSelect('course-room',    state.rooms,     'Aucune salle', true);

  // Pré-remplir si modification
  if (existingCourse) {
    $('course-class').value   = existingCourse.classId;
    $('course-teacher').value = existingCourse.teacherId;
    $('course-subject').value = existingCourse.subjectId;
    $('course-room').value    = existingCourse.roomId ?? '';
    $('deleteCourseBtn').classList.remove('hidden');
  } else {
    $('course-class').value   = '';
    $('course-teacher').value = '';
    $('course-subject').value = '';
    $('course-room').value    = '';
    $('deleteCourseBtn').classList.add('hidden');
  }

  // Masquer l'alerte de conflit
  $('conflict-alert').classList.add('hidden');

  // Afficher le modal
  $('modal-overlay').classList.remove('hidden');
}

/** Ferme le modal */
function closeModal() {
  $('modal-overlay').classList.add('hidden');
}

/** Remplit un <select> avec des entités */
function populateSelect(selectId, items, placeholder, allowEmpty = false) {
  const sel = $(selectId);
  sel.innerHTML = `<option value="">— ${placeholder} —</option>`;
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name + (item.subject ? ` (${item.subject})` : '')
                                + (item.capacity ? ` · ${item.capacity} pl.` : '');
    sel.appendChild(opt);
  }
}

/* ════════════════════════════════════════════════════
   8. GESTION DES COURS (CRUD)
   ════════════════════════════════════════════════════ */

/** Soumission du formulaire de cours (ajout ou modification) */
function handleCourseSubmit(e) {
  e.preventDefault();

  const day       = $('slot-day').value;
  const hour      = $('slot-hour').value;
  const classId   = $('course-class').value;
  const teacherId = $('course-teacher').value;
  const subjectId = $('course-subject').value;
  const roomId    = $('course-room').value || null;
  const editId    = $('slot-course-id').value || null;

  // Validation basique
  if (!classId || !teacherId || !subjectId) {
    showToast('Veuillez remplir tous les champs obligatoires.', 'error');
    return;
  }

  const candidate = { day, hour, classId, teacherId, subjectId, roomId };

  // Vérification des conflits
  const { conflict, message } = checkConflicts(candidate, editId);

  if (conflict) {
    // Afficher le message de conflit dans le modal
    $('conflict-message').textContent = message;
    $('conflict-alert').classList.remove('hidden');
    return;
  }

  // Masquer l'alerte si pas de conflit
  $('conflict-alert').classList.add('hidden');

  if (editId) {
    // Modification
    const idx = state.courses.findIndex(c => c.id === editId);
    if (idx !== -1) state.courses[idx] = { id: editId, ...candidate };
    showToast('Cours modifié avec succès.', 'success');
  } else {
    // Ajout
    state.courses.push({ id: uid(), ...candidate });
    showToast('Cours ajouté avec succès.', 'success');
  }

  saveData('courses');
  closeModal();
  renderTimetable();
}

/** Suppression d'un cours */
function deleteCourse() {
  const courseId = $('slot-course-id').value;
  if (!courseId) return;

  state.courses = state.courses.filter(c => c.id !== courseId);
  saveData('courses');
  closeModal();
  renderTimetable();
  showToast('Cours supprimé.', 'info');
}

/* ════════════════════════════════════════════════════
   9. GESTION DES ENTITÉS (CRUD GÉNÉRIQUE)
   ════════════════════════════════════════════════════ */

/**
 * Crée les gestionnaires d'entité (classe, prof, salle, matière)
 * @param {object} cfg - Configuration de l'entité
 */
function setupEntityManager(cfg) {
  const {
    key,        // clé dans state et STORAGE_KEYS
    formId,     // id du <form>
    editId,     // id du <input type="hidden"> pour l'édition
    cancelId,   // id du bouton annuler
    listId,     // id du <ul>
    getValues,  // fn() → objet de l'entité (sans id)
    clearForm,  // fn() → vide les champs
    renderItem, // fn(item) → string HTML interne du <li>
  } = cfg;

  const form   = $(formId);
  const cancel = $(cancelId);

  // Soumission du formulaire
  form.addEventListener('submit', e => {
    e.preventDefault();
    const values = getValues();
    if (!values) return; // validation échouée

    const editingId = $(editId).value;

    if (editingId) {
      // Modification
      const idx = state[key].findIndex(x => x.id === editingId);
      if (idx !== -1) state[key][idx] = { id: editingId, ...values };
      showToast('Modifié avec succès.', 'success');
      $(editId).value = '';
      cancel.classList.add('hidden');
    } else {
      // Vérifier doublon de nom
      const exists = state[key].some(
        x => x.name.trim().toLowerCase() === values.name.trim().toLowerCase()
      );
      if (exists) {
        showToast(`"${values.name}" existe déjà.`, 'error');
        return;
      }
      state[key].push({ id: uid(), ...values });
      showToast('Ajouté avec succès.', 'success');
    }

    saveData(key);
    clearForm();
    renderEntityList(cfg);
    updateFilterOptions();

    // Mettre à jour les selects du modal si ouvert
    if (!$('modal-overlay').classList.contains('hidden')) {
      populateSelect('course-class',   state.classes,   'Sélectionner une classe');
      populateSelect('course-teacher', state.teachers,  'Sélectionner un professeur');
      populateSelect('course-subject', state.subjects,  'Sélectionner une matière');
      populateSelect('course-room',    state.rooms,     'Aucune salle', true);
    }
  });

  // Annuler l'édition
  cancel.addEventListener('click', () => {
    $(editId).value = '';
    cancel.classList.add('hidden');
    clearForm();
  });

  // Rendu initial
  renderEntityList(cfg);
}

/** Affiche la liste d'une entité */
function renderEntityList(cfg) {
  const { key, listId, renderItem } = cfg;
  const list = $(listId);
  list.innerHTML = '';

  if (state[key].length === 0) {
    list.innerHTML = `<li class="entity-empty">Aucun élément. Ajoutez-en un ci-dessus.</li>`;
    return;
  }

  for (const item of state[key]) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="entity-name">${renderItem(item)}</div>
      <div class="entity-actions">
        <button class="edit-btn" title="Modifier" data-id="${item.id}">✏</button>
        <button class="del-btn"  title="Supprimer" data-id="${item.id}">✕</button>
      </div>
    `;
    list.appendChild(li);
  }

  // Boutons modifier
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => startEdit(cfg, btn.dataset.id));
  });

  // Boutons supprimer
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteEntity(cfg, btn.dataset.id));
  });
}

/** Lance l'édition d'une entité */
function startEdit(cfg, id) {
  const { key, editId, cancelId, startEditFn } = cfg;
  const item = findById(state[key], id);
  if (!item) return;

  $(editId).value = id;
  $(cancelId).classList.remove('hidden');
  startEditFn(item);
}

/** Supprime une entité (avec vérification des dépendances) */
function deleteEntity(cfg, id) {
  const { key, listId } = cfg;

  // Vérifier si des cours utilisent cette entité
  const depField = { classes: 'classId', teachers: 'teacherId', rooms: 'roomId', subjects: 'subjectId' }[key];
  const usedBy = state.courses.filter(c => c[depField] === id).length;

  if (usedBy > 0) {
    showToast(`Impossible : utilisé dans ${usedBy} cours. Supprimez d'abord ces cours.`, 'error');
    return;
  }

  state[key] = state[key].filter(x => x.id !== id);
  saveData(key);
  renderEntityList(cfg);
  updateFilterOptions();
  showToast('Supprimé.', 'info');
}

/* ════════════════════════════════════════════════════
   10. FILTRE DE L'EMPLOI DU TEMPS
   ════════════════════════════════════════════════════ */

/** Met à jour les options du select de valeur de filtre */
function updateFilterOptions() {
  const type    = $('filterType').value;
  const valSel  = $('filterValue');
  valSel.innerHTML = '<option value="">— Choisir —</option>';

  const map = {
    class:   state.classes,
    teacher: state.teachers,
    room:    state.rooms,
  };

  const items = map[type] ?? [];
  valSel.disabled = items.length === 0 || type === 'all';

  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    valSel.appendChild(opt);
  }
}

/* ════════════════════════════════════════════════════
   11. EXPORT JSON
   ════════════════════════════════════════════════════ */

function exportJSON() {
  const payload = {
    exportDate: new Date().toISOString(),
    classes:  state.classes,
    teachers: state.teachers,
    rooms:    state.rooms,
    subjects: state.subjects,
    courses:  state.courses,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `emploi-du-temps-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export JSON téléchargé.', 'success');
}

/* ════════════════════════════════════════════════════
   12. RÉINITIALISATION
   ════════════════════════════════════════════════════ */

function resetData() {
  const confirmed = confirm(
    '⚠ Êtes-vous sûr de vouloir supprimer TOUTES les données ?\n' +
    'Classes, professeurs, salles, matières et emplois du temps seront effacés.'
  );
  if (!confirmed) return;

  state.classes  = [];
  state.teachers = [];
  state.rooms    = [];
  state.subjects = [];
  state.courses  = [];
  saveAll();
  init();
  showToast('Toutes les données ont été réinitialisées.', 'info');
}

/* ════════════════════════════════════════════════════
   13. NAVIGATION PAR ONGLETS
   ════════════════════════════════════════════════════ */

function setupTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      $(`tab-${tab}`).classList.add('active');
    });
  });
}

/* ════════════════════════════════════════════════════
   14. DONNÉES DE DÉMONSTRATION
   ════════════════════════════════════════════════════ */

/** Insère des données de démo si la base est vide */
function insertDemoData() {
  if (state.classes.length > 0) return; // déjà des données

  state.classes = [
    { id: uid(), name: 'Terminale A' },
    { id: uid(), name: 'Terminale C' },
    { id: uid(), name: 'Première D' },
  ];

  state.teachers = [
    { id: uid(), name: 'M. Kamga',   subject: 'Mathématiques' },
    { id: uid(), name: 'Mme Bella',  subject: 'Français' },
    { id: uid(), name: 'M. Nguele',  subject: 'Physique' },
    { id: uid(), name: 'Mme Fouda',  subject: 'Histoire-Géo' },
  ];

  state.rooms = [
    { id: uid(), name: 'Salle 101', capacity: 40 },
    { id: uid(), name: 'Salle 102', capacity: 35 },
    { id: uid(), name: 'Labo Physique', capacity: 25 },
  ];

  state.subjects = [
    { id: uid(), name: 'Mathématiques', color: '#4f7cff' },
    { id: uid(), name: 'Français',      color: '#e05c5c' },
    { id: uid(), name: 'Physique',      color: '#f5a623' },
    { id: uid(), name: 'Histoire-Géo',  color: '#3ecf6e' },
  ];

  // Quelques cours de démo
  const c = state.classes;
  const t = state.teachers;
  const r = state.rooms;
  const s = state.subjects;

  state.courses = [
    { id: uid(), day: 'Lundi',   hour: '08:00', classId: c[0].id, teacherId: t[0].id, subjectId: s[0].id, roomId: r[0].id },
    { id: uid(), day: 'Lundi',   hour: '10:00', classId: c[1].id, teacherId: t[1].id, subjectId: s[1].id, roomId: r[1].id },
    { id: uid(), day: 'Mardi',   hour: '08:00', classId: c[0].id, teacherId: t[2].id, subjectId: s[2].id, roomId: r[2].id },
    { id: uid(), day: 'Mardi',   hour: '09:00', classId: c[1].id, teacherId: t[3].id, subjectId: s[3].id, roomId: r[0].id },
    { id: uid(), day: 'Mercredi',hour: '07:00', classId: c[2].id, teacherId: t[0].id, subjectId: s[0].id, roomId: r[1].id },
    { id: uid(), day: 'Jeudi',   hour: '11:00', classId: c[0].id, teacherId: t[3].id, subjectId: s[3].id, roomId: r[0].id },
  ];

  saveAll();
}

/* ════════════════════════════════════════════════════
   15. INITIALISATION PRINCIPALE
   ════════════════════════════════════════════════════ */

function init() {

  // ── Onglets ──
  setupTabs();

  // ── Données ──
  loadData();
  insertDemoData();

  // ── Entité : Classes ──
  setupEntityManager({
    key: 'classes', formId: 'form-classes', editId: 'class-edit-id',
    cancelId: 'class-cancel', listId: 'list-classes',
    getValues: () => {
      const name = $('class-name').value.trim();
      if (!name) { showToast('Nom de classe requis.', 'error'); return null; }
      return { name };
    },
    clearForm:    () => { $('class-name').value = ''; },
    startEditFn:  item => { $('class-name').value = item.name; },
    renderItem:   item => `<span>${esc(item.name)}</span>`,
  });

  // ── Entité : Professeurs ──
  setupEntityManager({
    key: 'teachers', formId: 'form-teachers', editId: 'teacher-edit-id',
    cancelId: 'teacher-cancel', listId: 'list-teachers',
    getValues: () => {
      const name    = $('teacher-name').value.trim();
      const subject = $('teacher-subject').value.trim();
      if (!name) { showToast('Nom de professeur requis.', 'error'); return null; }
      return { name, subject };
    },
    clearForm:   () => { $('teacher-name').value = ''; $('teacher-subject').value = ''; },
    startEditFn: item => { $('teacher-name').value = item.name; $('teacher-subject').value = item.subject ?? ''; },
    renderItem:  item => `<span>${esc(item.name)}</span>${item.subject ? `<span class="entity-meta">${esc(item.subject)}</span>` : ''}`,
  });

  // ── Entité : Salles ──
  setupEntityManager({
    key: 'rooms', formId: 'form-rooms', editId: 'room-edit-id',
    cancelId: 'room-cancel', listId: 'list-rooms',
    getValues: () => {
      const name     = $('room-name').value.trim();
      const capacity = parseInt($('room-capacity').value) || null;
      if (!name) { showToast('Nom de salle requis.', 'error'); return null; }
      return { name, capacity };
    },
    clearForm:   () => { $('room-name').value = ''; $('room-capacity').value = ''; },
    startEditFn: item => { $('room-name').value = item.name; $('room-capacity').value = item.capacity ?? ''; },
    renderItem:  item => `<span>${esc(item.name)}</span>${item.capacity ? `<span class="entity-meta">${item.capacity} pl.</span>` : ''}`,
  });

  // ── Entité : Matières ──
  setupEntityManager({
    key: 'subjects', formId: 'form-subjects', editId: 'subject-edit-id',
    cancelId: 'subject-cancel', listId: 'list-subjects',
    getValues: () => {
      const name  = $('subject-name').value.trim();
      const color = $('subject-color').value;
      if (!name) { showToast('Nom de matière requis.', 'error'); return null; }
      return { name, color };
    },
    clearForm:   () => { $('subject-name').value = ''; $('subject-color').value = '#4f7cff'; },
    startEditFn: item => { $('subject-name').value = item.name; $('subject-color').value = item.color ?? '#4f7cff'; },
    renderItem:  item => `
      <span class="entity-dot" style="background:${esc(item.color ?? '#4f7cff')}"></span>
      <span>${esc(item.name)}</span>`,
  });

  // ── Modal : cours ──
  $('course-form').addEventListener('submit', handleCourseSubmit);
  $('modalClose').addEventListener('click', closeModal);
  $('modalCancel').addEventListener('click', closeModal);
  $('deleteCourseBtn').addEventListener('click', deleteCourse);

  // Fermer modal en cliquant sur l'overlay
  $('modal-overlay').addEventListener('click', e => {
    if (e.target === $('modal-overlay')) closeModal();
  });

  // Touche Échap pour fermer
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Filtres ──
  $('filterType').addEventListener('change', () => {
    updateFilterOptions();
    renderTimetable();
  });

  $('filterValue').addEventListener('change', () => {
    renderTimetable();
  });

  // ── Export & Reset ──
  $('exportBtn').addEventListener('click', exportJSON);
  $('resetBtn').addEventListener('click', resetData);

  // ── Rendu initial de la grille ──
  updateFilterOptions();
  renderTimetable();

  console.log('%c EduSchedule chargé ', 'background:#4f7cff;color:#fff;padding:4px 8px;border-radius:4px;');
}

/* ════════════════════════════════════════════════════
   POINT D'ENTRÉE
   ════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
