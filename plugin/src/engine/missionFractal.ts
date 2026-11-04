/**
 * Em que **escala do padrão fractal** o canvas aberto está.
 *
 * A escala não é invenção deste módulo: vem do Manual Central do vault
 * (`000 - KERNEL/03 - MANUAIS_OPERACIONAIS/000 - Manual Central — Como o Sistema Funciona.md`,
 * seção "O padrão fractal"), que no eixo **Espaço** desce
 * `Área → Projeto → Tarefa SMART → Tarefa atômica` e manda dividir para conquistar
 * "inclusive graficamente, no canvas do projeto".
 *
 * Por que aqui e não no painel: o painel desenha, o motor decide. A leitura precisa
 * ser testável sem DOM e reutilizável por qualquer superfície que mostre o mesmo
 * canvas (o mapa hoje, o inspetor amanhã).
 *
 * Módulo **puro**: sem `obsidian`, sem DOM, sem I/O. Só recebe o índice já lido.
 */
import type { MissionCanvasIndex } from './missionCanvasIndex';
import { COCKPIT_PATH } from './canvasTree';

export type FractalScale = 'sistema' | 'area' | 'projeto' | 'tarefas' | 'indefinida';

export interface FractalReading {
    scale: FractalScale;
    /** Rótulo curto para a tela (ex.: "Projeto"). */
    label: string;
    /** A trilha do eixo Espaço até a escala atual: ['Área','Projeto'] etc. */
    trail: string[];
    /** A evidência que decidiu — texto curto, exibível. Nunca vazio. */
    reason: string;
}

/**
 * A trilha do eixo Espaço até cada escala, do topo para baixo.
 *
 * `tarefas` começa em "Projeto" porque no eixo Espaço a tarefa mora **dentro** de um
 * projeto: o canvas que só chega até tarefas está na faixa de baixo do projeto, não
 * numa quarta raiz. `indefinida` não tem trilha — inventar uma seria declarar uma
 * escala que a leitura não achou.
 */
const TRAILS: Record<FractalScale, string[]> = {
    sistema: ['Sistema'],
    area: ['Área'],
    projeto: ['Área', 'Projeto'],
    tarefas: ['Projeto', 'Tarefas'],
    indefinida: [],
};

const LABELS: Record<FractalScale, string> = {
    sistema: 'Sistema',
    area: 'Área',
    projeto: 'Projeto',
    tarefas: 'Tarefas',
    // A ausência é dita em palavras, não maquiada por um rótulo de nível.
    indefinida: 'Escala indefinida',
};

function reading(scale: FractalScale, reason: string): FractalReading {
    return { scale, label: LABELS[scale], trail: [...TRAILS[scale]], reason };
}

/**
 * A escala do canvas aberto, decidida por **evidência**, na ordem em que a evidência
 * é forte — a primeira que casa vence.
 *
 * POR QUE A ORDEM IMPORTA: as três primeiras regras leem uma **declaração** do índice
 * (o campo `system`, o mapa dos cockpits, o mapa dos canvas de projeto); a quarta lê
 * apenas o **conteúdo** do desenho. Invertê-las trocaria declaração por inferência:
 * todo canvas de projeto tem nós de tarefa, então `tasks > 0` casaria primeiro e
 * rebaixaria todo projeto para "tarefas". Do mesmo modo, o cockpit vem antes do
 * projeto porque um cockpit pode conter nós de projeto sem deixar de ser o topo da
 * área; e `system` vem antes de todos porque é o único caso em que o canvas não é
 * trabalho do operador, e nenhuma outra leitura deve reivindicá-lo.
 */
export function readFractalScale(input: {
    canvasPath: string;
    /** Do `canvasContents`: quantas tarefas e quais projetos o desenho contém. */
    contents: { tasks: number; projects: string[] };
    index: MissionCanvasIndex;
}): FractalReading {
    const canvasPath = input.canvasPath ?? '';
    const tasks = input.contents?.tasks ?? 0;
    const projects = input.contents?.projects ?? [];
    const index = input.index;

    // 1. SISTEMA — declaração direta do índice. Vem primeiro porque é o único caso em
    // que o canvas não pertence ao trabalho do operador: se qualquer regra abaixo o
    // reivindicasse, o painel mandaria descer uma árvore que não é do operador.
    const system = (index.entries ?? []).find(entry => entry.system && entry.path === canvasPath);
    if (system || canvasPath === COCKPIT_PATH) {
        return reading('sistema', `O índice marca "${canvasPath}" como canvas do sistema`
            + (system?.name ? ` (${system.name})` : '')
            + ' — não é trabalho de projeto nem de área.');
    }

    // 2. ÁREA — o cockpit é declarado por caminho (`<raiz da área>/<nome da área>.canvas`),
    // e o índice o guarda em `byAreaCockpit`. Varredura porque a pergunta é "este
    // caminho é o cockpit de alguma área?", e o mapa é indexado pelo id da área.
    for (const [areaId, entry] of index.byAreaCockpit ?? []) {
        if (entry.path !== canvasPath) continue;
        const area = entry.area ?? areaId;
        return reading('area', `É o cockpit da área "${area}": byAreaCockpit aponta `
            + `${canvasPath} como o canvas do topo dela.`);
    }

    // 3. PROJETO — também é declaração: o caminho segue a convenção
    // `<pasta do projeto>/<nome do projeto>.canvas`. `byProjectPath` é a chave
    // autoritativa (nome de projeto repete entre áreas); `byProject` é o mesmo achado
    // pelo nome, e só entra como segunda passada.
    for (const [projectPath, entry] of index.byProjectPath ?? []) {
        if (entry.path !== canvasPath) continue;
        // O texto de sempre para o caminho de sempre (o cabeçalho fractal já gravado
        // compara o texto); o canvas na área (repositório git próprio) diz onde está.
        const conventional = `${projectPath}/${entry.project ?? entry.name}.canvas`;
        return reading('projeto', entry.path === conventional
            ? `Canvas do projeto "${entry.project ?? entry.name}", pela convenção do caminho: ${conventional}.`
            : `Canvas do projeto "${entry.project ?? entry.name}", na área (o projeto é um repositório git próprio): ${entry.path}.`);
    }
    for (const [projectName, entry] of index.byProject ?? []) {
        if (entry.path !== canvasPath) continue;
        return reading('projeto', `Canvas do projeto "${entry.project ?? projectName}", `
            + `achado em byProject: ${canvasPath}.`);
    }

    // 4. TAREFAS — inferência pelo conteúdo, a evidência mais fraca das quatro: um
    // desenho com nós de tarefa não é necessariamente um canvas "de tarefas". Só chega
    // aqui o canvas que não é sistema, não é cockpit e não segue a convenção de projeto.
    if (tasks > 0) {
        return reading('tarefas', `O desenho não é de projeto nem de área, mas contém `
            + `${tasks} tarefa(s) como nó — a escala lida é a das tarefas.`);
    }

    // 5. INDEFINIDA — a ausência é declarada. Nunca inventamos um nível: um canvas
    // avulso que não casa com nada é exatamente o que o índice chama de `loose`, e
    // dizer "não deu para determinar" é a informação útil (manda olhar o arquivo).
    //
    // DECISÃO PENDENTE: o motivo cita também os projetos que o desenho menciona. Eles
    // não decidem escala nenhuma aqui — citar um projeto não faz do canvas um canvas de
    // projeto —, mas o número evita que o operador leia "indefinida" como "canvas
    // vazio" quando há conteúdo que o índice simplesmente não reivindica.
    const refs = projects.length
        ? ` O desenho cita ${projects.length} projeto(s), mas citar não define escala.`
        : '';
    return reading('indefinida', 'Não foi possível determinar a escala: o índice não marca '
        + 'este canvas como sistema, ele não é cockpit de área, o caminho não segue a convenção '
        + `de canvas de projeto e o desenho não tem nenhuma tarefa (0 tarefas).${refs}`);
}
