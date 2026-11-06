const current = dv.current();
const day = current.file.day ?? dv.date(current.file.name);
const today = day ? day.toFormat('yyyy-MM-dd') : current.file.name;

const isoDay = value => {
  if (!value) return null;
  if (typeof value.toFormat === 'function') return value.toFormat('yyyy-MM-dd');
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
};

const clock = value => {
  if (!value) return '—';
  if (typeof value.toFormat === 'function') return value.toFormat('HH:mm');
  const match = String(value).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '—';
};

const commandValue = current.acao_comando ?? current.tarefa_smart;
const commandPath = commandValue?.path ?? null;
// Agenda só mostra tarefa viva: concluída, cancelada ou arquivada fica de fora.
const tasks = dv.pages('"TaskNotes/Tasks"')
  .where(t => String(t.type ?? 'task') !== 'tarefa_smart')
  .where(t => !['done', 'cancelled'].includes(String(t.status ?? '')))
  .where(t => t.archived !== true && !t.file.path.startsWith('TaskNotes/Archive/'))
  .where(t =>
    isoDay(t.scheduled) === today ||
    isoDay(t.due) === today ||
    String(t.status ?? '') === 'in-progress' ||
    (commandPath && t.file.path === commandPath)
  )
  .sort(t => t.scheduled ?? t.due ?? '9999', 'asc');

if (!tasks.length) {
  dv.el('div', '> [!info] Nenhuma task agendada, vencendo ou em andamento hoje.');
} else {
  dv.table(
    ['Hora', 'TaskNotes', 'Status', 'Estimativa', 'Projeto'],
    tasks.map(t => [
      clock(t.scheduled),
      t.file.link,
      t.status ?? '—',
      t.timeEstimate ?? '—',
      t.projects ?? '—'
    ])
  );
}
