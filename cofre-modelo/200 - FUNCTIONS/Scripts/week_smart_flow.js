const current = dv.current();
const week = String(current.week ?? '').trim() || (current.file.name.match(/\d{4}-W\d{2}/) || [])[0];
const pages = dv.pages('"TaskNotes"').where(p => String(p.week ?? '') === String(week ?? ''));
// A SMART de manutenção de rotina (`natureza: manutencao`, 02/11) não conta nas até três: a Week a mostra na
// parte dela (`{ manutencao: true }`), e as entregas, sem ela.
const soManutencao = typeof input !== 'undefined' && input?.manutencao === true;
const deManutencao = p => [].concat(p.natureza ?? []).some(v => String(v ?? '').trim().toLowerCase() === 'manutencao');
const smartTasks = pages
  .where(p => String(p.type ?? '') === 'tarefa_smart' && deManutencao(p) === soManutencao)
  // Abertas primeiro, depois as concluídas e, no fim, as canceladas.
  .sort(p => p.status === 'cancelled' ? 2 : p.status === 'done' ? 1 : 0, 'asc');

const linksTo = (value, parent) => {
  const values = Array.isArray(value) ? value : [value];
  return values.some(item => {
    const path = item?.path ?? String(item ?? '').replace(/[\[\]]/g, '').split('|')[0];
    return path === parent.file.path || path === parent.file.name || path === parent.file.basename || path.endsWith(`/${parent.file.name}`);
  });
};

if (!week) {
  dv.paragraph('> [!warning] A nota ainda não tem uma semana válida.');
} else if (!smartTasks.length) {
  dv.paragraph(soManutencao
    ? '> Nenhuma SMART de manutenção nesta semana.'
    : '> [!tip] Nenhuma Tarefa SMART definida. Crie até três entregas semanais ligadas aos projetos do trimestre.');
} else {
  // Cancelada é decisão, não SMART ativa: fica fora da conta (como no número do topo).
  if (!soManutencao && smartTasks.where(t => !['done', 'cancelled'].includes(String(t.status ?? ''))).length > 3) {
    dv.paragraph('> [!warning] Há mais de três Tarefas SMART ativas. Reduza o escopo manualmente; o sistema não cria outra fila automática.');
  }

  dv.table(
    ['Tarefa SMART', 'Projeto', 'Suficiente', 'Ações atômicas', 'Próximas ações'],
    smartTasks.map(parent => {
      const children = pages
        .where(t => String(t.type ?? 'task') !== 'tarefa_smart' && linksTo(t.projects, parent));
      const done = children.where(t => t.status === 'done');
      const pending = children.where(t => !['done', 'cancelled'].includes(String(t.status ?? '')));
      return [
        parent.file.link,
        parent.projects ?? '—',
        parent.criterio_suficiente ?? parent.entrega_observavel ?? '—',
        `${done.length} concluída(s) · ${pending.length} aberta(s)`,
        pending.length ? pending.map(t => t.file.link) : '—'
      ];
    })
  );
}
