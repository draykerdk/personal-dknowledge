/**
 * Ferramentas de canvas e árvore — os geradores e sincronizadores do plugin.
 *
 * O Control Center antigo tinha uma aba inteira ("Action Hub") cujo único valor
 * exclusivo era dar gatilho a comandos de infraestrutura: sincronizar o mapa
 * geral, sincronizar dependências do canvas ativo, gerar o canvas estratégico.
 * O Mission Control listava canvas e árvores, mas **não oferecia nenhum dos
 * comandos** — quem quisesse rodá-los tinha de saber o nome do comando na paleta.
 *
 * Aqui cada botão chama o comando que já existe, pelo id. Nada é reimplementado:
 * o painel é uma porta, não um motor paralelo. E cada botão diz o que faz antes
 * de fazer — nenhum deles é inofensivo.
 */
import { actionButton, card, el, pill } from './primitives';
import { MissionPanelContext } from './context';

interface ToolSpec {
    command: string;
    label: string;
    icon: string;
    /** O que ele muda no vault, em uma linha. Sem isso o botão é um mistério. */
    effect: string;
    tone: 'accent' | 'cyan' | 'orange' | 'purple' | 'green';
}

const TOOLS: ReadonlyArray<ToolSpec> = [
    {
        command: 'dfm-create-tasknote-canvas',
        label: 'Canvas da tarefa',
        icon: 'square-dashed',
        effect: 'cria e abre o canvas ligado à nota de tarefa ativa.',
        tone: 'accent',
    },
    {
        command: 'dfm-sync-active-canvas-dependencies',
        label: 'Sincronizar dependências',
        icon: 'git-branch',
        effect: 'desenha as setas que faltam entre notas já ligadas nos metadados (tarefas se ligam pelas setas, não por aqui). Só com um canvas aberto.',
        tone: 'cyan',
    },
    {
        command: 'dfm-format-active-canvas-tasks',
        label: 'Formatar nós de tarefa',
        icon: 'layout-grid',
        effect: 'repinta cor, tamanho e HUD dos nós de tarefa do canvas ativo. Só com um canvas aberto.',
        tone: 'cyan',
    },
    {
        command: 'dfm-generate-strategic-canvas',
        label: 'Canvas estratégico',
        icon: 'target',
        effect: 'gera o canvas estratégico na pasta do projeto do arquivo ativo — e recusa sobrescrever um que já exista.',
        tone: 'purple',
    },
    // O comando Canvas do trimestre (`dfm-sync-quarterly-canvas`) saiu com o canvas do trimestre (aposentado em 02/11/2026):
    // o id virou porta, que abre o trimestre na Missão.
    {
        command: 'dfm-sync-tree-map',
        label: 'Mapa geral das áreas',
        icon: 'map',
        effect: 'regenera o mapa geral em 000 - KERNEL a partir das áreas — o arquivo é sobrescrito.',
        tone: 'orange',
    },
    {
        command: 'dfm-arvore-reavaliar-todas',
        label: 'Reavaliar árvores',
        icon: 'git-merge',
        effect: 'reavalia todas as árvores de progressão: pode mudar nível, marcar status e criar tarefas.',
        tone: 'orange',
    },
    {
        command: 'dfm-arvore-nova',
        label: 'Nova árvore',
        icon: 'sprout',
        effect: 'abre o assistente que cria o documento da árvore e o nó dela no canvas do projeto.',
        tone: 'green',
    },
];

export function renderCanvasTools(host: HTMLElement, ctx: MissionPanelContext): void {
    const node = card(host, {
        title: 'Ferramentas de canvas e árvore',
        icon: 'wrench',
        tone: 'purple',
        subtitle: 'os geradores e sincronizadores do plugin, com o efeito declarado',
        badge: `${TOOLS.length}`,
    });

    for (const tool of TOOLS) {
        const row = el(node.body, 'div', 'mc-tool');
        const head = el(row, 'div', 'mc-tool-head');
        actionButton(head, {
            label: tool.label,
            icon: tool.icon,
            tone: tool.tone,
            onClick: () => ctx.executeCommand(tool.command),
            title: `dfm-system:${tool.command}`,
        });
        el(row, 'p', 'mc-tool-effect', tool.effect);
    }

    const foot = el(node.body, 'div', 'mc-inspector-badges');
    pill(foot, 'alguns comandos exigem arquivo ativo', 'yellow', 'info');
    el(node.body, 'p', 'mc-hint',
        'Cada botão dispara o comando que o plugin já registra — o mesmo que aparece na paleta. Nenhum deles é somente leitura: leia o efeito antes de clicar.');
}
