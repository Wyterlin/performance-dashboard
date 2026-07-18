/**
 * Lógica pura da seleção de conteúdo do PowerPoint.
 * Mantida fora do componente para poder ser testada isoladamente.
 *
 * Formato da seleção:
 *   { [nomeDaSecao]: { checked: boolean, activities: boolean[] } }
 * O array `activities` é paralelo a `section.activities` (índice a índice),
 * o que evita depender de ids que podem faltar em registros antigos.
 */

export function buildInitialSelection(sections) {
  const initial = {};
  (sections || []).forEach((section) => {
    const activities = section.activities || [];
    initial[section.name] = {
      checked: activities.length > 0,
      activities: activities.map(() => true),
    };
  });
  return initial;
}

export function setAllSelection(sections, value) {
  const next = {};
  (sections || []).forEach((section) => {
    next[section.name] = {
      checked: value,
      activities: (section.activities || []).map(() => value),
    };
  });
  return next;
}

export function toggleSectionSelection(selection, name) {
  const current = selection[name];
  if (!current) return selection;
  const nextChecked = !current.checked;
  return {
    ...selection,
    [name]: { checked: nextChecked, activities: current.activities.map(() => nextChecked) },
  };
}

export function toggleActivitySelection(selection, name, index) {
  const current = selection[name];
  if (!current) return selection;
  const activities = current.activities.map((value, i) => (i === index ? !value : value));
  // A seção acompanha as tarefas: fica marcada enquanto sobrar ao menos uma.
  return { ...selection, [name]: { checked: activities.some(Boolean), activities } };
}

export function countSelection(sections, selection) {
  let temas = 0;
  let tarefas = 0;
  (sections || []).forEach((section) => {
    const sel = selection[section.name];
    if (!sel) return;
    const count = sel.activities.filter(Boolean).length;
    if (sel.checked && count > 0) {
      temas += 1;
      tarefas += count;
    }
  });
  return { temas, tarefas };
}

/** Aplica a seleção, devolvendo apenas seções marcadas e com tarefas marcadas. */
export function buildFilteredSections(sections, selection) {
  return (sections || [])
    .map((section) => {
      const sel = selection[section.name];
      if (!sel?.checked) return null;
      const activities = (section.activities || []).filter((_, index) => sel.activities[index]);
      if (!activities.length) return null;
      return { ...section, activities };
    })
    .filter(Boolean);
}
