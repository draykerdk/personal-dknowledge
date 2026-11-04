export interface DfmDshSkill {
    id: string;
    label: string;
    description: string;
    /** Caminho do SKILL.md no vault. Fonte da verdade da localizacao — nao inferir de pasta. */
    path: string;
    primary?: boolean;
}

export interface DfmNoteContext {
    basename: string;
    path: string;
}

// Espelha as skills `kind: "skill"` do Plugin Commons. Cada entrada carrega o
// proprio caminho no vault: resolver por pasta ou por lista de ids quebra em
// silencio quando uma skill nova entra em `Skills/System/`. O teste deste modulo
// confere existencia em disco e coerencia com o manifesto.
export const DFM_DSH_SKILLS: readonly DfmDshSkill[] = [
    { id: 'dfm-operator', label: 'Operar', description: 'operar o DFM conforme o estado vivo e os contratos do vault', path: '200 - FUNCTIONS/Skills/System/dfm-operator/SKILL.md', primary: true },
    { id: 'dfm-memory', label: 'Memória', description: 'recuperar ou registrar memória federada com proveniência', path: '200 - FUNCTIONS/Skills/System/dfm-memory/SKILL.md', primary: true },
    { id: 'dfm-agent-routing', label: 'Roteamento', description: 'classificar o trabalho, escolher a capacidade e recolher evidência', path: '200 - FUNCTIONS/Skills/System/dfm-agent-routing/SKILL.md' },
    { id: 'dfm-engineering-loop', label: 'Engenharia', description: 'construir, verificar e integrar peças de engenharia com evidência', path: '200 - FUNCTIONS/Skills/System/dfm-engineering-loop/SKILL.md' },
    { id: 'dfm-skill-maintenance', label: 'Manutenção de skill', description: 'avaliar, corrigir e consolidar skills com base em evidência', path: '200 - FUNCTIONS/Skills/System/dfm-skill-maintenance/SKILL.md' },
    { id: 'dfm-micro-review', label: 'Micro-review', description: 'fechar o bloco atual com ação, resultado, lacuna e ajuste', path: '200 - FUNCTIONS/Plugins/portable/dfm-micro-review/SKILL.md', primary: true },
    { id: 'dfm-daily-cycle', label: 'Dia', description: 'abrir, operar ou fechar o ciclo diário do DFM', path: '200 - FUNCTIONS/Plugins/portable/dfm-daily-cycle/SKILL.md', primary: true },
    { id: 'dfm-weekly-cycle', label: 'Semana', description: 'planejar, acompanhar ou revisar a semana', path: '200 - FUNCTIONS/Plugins/portable/dfm-weekly-cycle/SKILL.md', primary: true },
    { id: 'dfm-decision-matrix', label: 'Decidir', description: 'comparar alternativas e tornar trade-offs explícitos', path: '200 - FUNCTIONS/Plugins/portable/dfm-decision-matrix/SKILL.md' },
    { id: 'dfm-resistance-breaker', label: 'Destravar', description: 'reduzir resistência a uma próxima ação executável', path: '200 - FUNCTIONS/Plugins/portable/dfm-resistance-breaker/SKILL.md' },
    { id: 'dfm-best-practices', label: 'Boa prática', description: 'transformar um acerto recorrente em SOP verificável', path: '200 - FUNCTIONS/Plugins/portable/dfm-best-practices/SKILL.md' },
    { id: 'dfm-inbox-processor', label: 'Inbox', description: 'triar capturas e propor o destino permanente correto', path: '200 - FUNCTIONS/Plugins/portable/dfm-inbox-processor/SKILL.md' },
    { id: 'dfm-project-genesis', label: 'Novo projeto', description: 'estruturar uma iniciativa do objetivo à primeira ação', path: '200 - FUNCTIONS/Plugins/portable/dfm-project-genesis/SKILL.md' },
    { id: 'dfm-operational-manager', label: 'Modo operacional', description: 'rotear trabalho entre foco, execução, estudo e captura', path: '200 - FUNCTIONS/Plugins/portable/dfm-operational-manager/SKILL.md' },
    { id: 'dfm-victory-log', label: 'Vitória', description: 'registrar uma conquista ou marco relevante', path: '200 - FUNCTIONS/Plugins/portable/dfm-victory-log/SKILL.md' },
    { id: 'dfm-quarterly-review', label: 'Trimestre', description: 'fechar o trimestre factual e preparar o ciclo seguinte', path: '200 - FUNCTIONS/Plugins/portable/dfm-quarterly-review/SKILL.md' }
];

export function getDfmDshSkill(skillId: string): DfmDshSkill | undefined {
    return DFM_DSH_SKILLS.find(skill => skill.id === skillId);
}

export function buildSkillInvocation(skill: DfmDshSkill, note?: DfmNoteContext | null): string {
    const lines = [
        `Use a skill \`${skill.id}\` para ${skill.description}.`,
        'Leia primeiro o estado vivo do DFM e preserve as decisões atuais.'
    ];
    if (note) {
        const wikilink = `[[${note.path.replace(/\.md$/i, '')}]]`;
        lines.push('', `Contexto DFM: ${wikilink}`, `Caminho no vault: ${note.path}`);
    }
    return lines.join('\n');
}

export function buildSkillsInvocation(skills: readonly DfmDshSkill[], note?: DfmNoteContext | null): string {
    const uniqueSkills = skills.filter((skill, index) =>
        skills.findIndex(candidate => candidate.id === skill.id) === index
    );
    if (uniqueSkills.length === 0) throw new Error('Selecione ao menos uma skill DFM.');
    if (uniqueSkills.length === 1) return buildSkillInvocation(uniqueSkills[0], note);

    const lines = [
        'Use conjuntamente as skills DFM selecionadas nesta tarefa:',
        ...uniqueSkills.map(skill => `- \`${skill.id}\`: ${skill.description}.`),
        '',
        'Coordene as responsabilidades sem duplicar trabalho. Leia primeiro o estado vivo do DFM e preserve as decisões atuais.'
    ];
    if (note) {
        const wikilink = `[[${note.path.replace(/\.md$/i, '')}]]`;
        lines.push('', `Contexto DFM: ${wikilink}`, `Caminho no vault: ${note.path}`);
    }
    return lines.join('\n');
}
