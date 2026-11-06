import { Notice, Setting, TFile, type App } from 'obsidian';
import type DFMPlugin from '../main';
import { PAPEIS, type Papel } from '../engine/papeisDeProtocolo';
import {
    editarLista, editarPapel, editarPonteLigada, editarPortaDaPonte, editarTexto, editarTrilha, formatoDaLista, opcoesDoPapel, textoDaLista,
    type CampoDaTrilha, type CampoDeLista, type CampoDeTexto, type Edicao,
} from './definicoesDaAba';

/**
 * A seção "Definições do sistema" da aba de configurações (B2 do mapa da v0).
 *
 * O que faz: mostra as definições lidas (`plugin.definicoes`: os padrões, as camadas de partida dos
 * módulos, os nomes antigos do salvamento e o bloco salvo) e deixa a pessoa editar o nome e o fuso,
 * o nome do agente, os valores e os das relações, as áreas, o foco do trimestre, as pastas, a nota da
 * reserva, a ponte do agente (ligar e a porta) e o protocolo de cada papel; os arquivos de configuração (pesos, reputação, ECH,
 * vocabulário) abrem para editar, e o caminho deles fica à vista.
 * Por quê: as definições são de cada pessoa e não ficam escritas no código; a aba é onde ela as vê e
 * muda. O que a edição vira no bloco, e se vale, é de `definicoesDaAba.ts` (puro, testado à parte).
 * Erro e ataque: o campo grava ao sair dele (o evento `change`), não a cada tecla; a edição que o
 * leitor recusaria avisa e volta ao valor que vale; nada grava enquanto nada muda.
 * Prova: tests/ui/definicoesDaAba.test.ts (o que vira salvamento); a prévia no Obsidian (a tela).
 */
export function secaoDasDefinicoes(plugin: DFMPlugin, app: App, containerEl: HTMLElement, redesenhar: () => void): void {
    const partida = plugin.partidaDasDefinicoes;
    const lidas = () => plugin.definicoes;
    /** Grava a edição: o bloco novo vai ao salvamento; sem mudança, nada; com erro, o aviso e a tela volta. */
    const gravar = async (edicao: Edicao, voltar: () => void) => {
        if ('erro' in edicao) { new Notice(`⚠️ ${edicao.erro}. Nada foi gravado.`, 8000); voltar(); return; }
        if (!edicao.bloco) return;
        (plugin.settings as any).definicoes = edicao.bloco;
        await plugin.saveSettings();
    };
    /** Um campo de texto que grava ao sair dele. */
    const texto = (nome: string, desc: string, campo: CampoDeTexto, placeholder = '') => {
        const valorAtual = () => String(campo.split('.').reduce<any>((v, k) => v?.[k], lidas()) ?? '');
        new Setting(containerEl).setName(nome).setDesc(desc).addText(t => {
            t.setPlaceholder(placeholder).setValue(valorAtual());
            t.inputEl.addEventListener('change', () => {
                void gravar(editarTexto(plugin.settings, partida, campo, t.getValue()), () => t.setValue(valorAtual()));
            });
        });
    };
    /** Um campo de lista (uma linha por item) que grava ao sair dele. */
    const lista = (nome: string, desc: string, campo: CampoDeLista) => {
        new Setting(containerEl).setName(nome).setDesc(`${desc} Uma linha por item: ${formatoDaLista(campo)}.`).addTextArea(t => {
            t.setValue(textoDaLista(lidas(), campo));
            t.inputEl.rows = 4;
            t.inputEl.addEventListener('change', () => {
                void gravar(editarLista(plugin.settings, partida, campo, t.getValue()), () => t.setValue(textoDaLista(lidas(), campo)));
            });
        });
    };

    containerEl.createEl('h2', { text: '🧬 Definições do sistema' });
    containerEl.createEl('p', {
        text: 'O que é seu e não fica escrito no código: o seu nome, os seus valores, as suas áreas, as pastas e o protocolo que faz cada papel. Os valores mostrados são os que valem agora; só o que você mudar é gravado.',
        cls: 'setting-item-description',
    });

    containerEl.createEl('h3', { text: 'Você' });
    texto('Nome', 'O nome do seu nível pessoal nas notas (a chave do número de 0 a 10 que os protocolos gravam).', 'pessoa.nome');
    texto('Fuso horário', 'Decide a semana corrente e a anterior. Um id IANA, como America/Sao_Paulo; vazio = o do sistema.', 'pessoa.fuso_horario', 'o do sistema');
    texto('Nome do agente', 'Como a tela chama o agente que só propõe; vazio = "o agente".', 'rotulos.agente', 'o agente');

    containerEl.createEl('h3', { text: 'Valores, áreas e foco' });
    lista('Valores', 'Os seus valores, na ordem; sem as notas de valor, a rotação da semana usa estes (e depois os das relações).', 'valores');
    lista('Valores das relações', 'Os valores das suas relações, na ordem (o segundo do par da semana).', 'valores_relacoes');
    lista('Áreas', 'As suas áreas: a pasta em 100 - AREAS e a etiqueta que leva uma nota para os projetos dela.', 'areas');
    lista('Foco do trimestre', 'O foco do trimestre corrente; a nota de cada trimestre continua guardando o dela.', 'trimestre.foco');

    containerEl.createEl('h3', { text: 'Pastas e arquivos' });
    texto('Caixa de entrada', 'Onde as notas novas e as capturas caem. Vazio = a de partida.', 'pastas.inbox');
    texto('Protocolos', 'Onde os arquivos .json dos protocolos estão. Vazio = a de partida.', 'pastas.protocolos');
    texto('Revisão semanal', 'A pasta da revisão da semana. Vazio = a de partida.', 'pastas.revisao_semanal');
    texto('Notas de valor', 'A pasta das notas de valor (`type: valor`, com `ordem`). Vazio = a de partida.', 'pastas.valores');
    lista('Pastas fora do organizador', 'As pastas que o organizador nunca move.', 'pastas.excluidas');
    texto('Nota da reserva', 'A nota da reserva que a Missão mostra; vazia = o módulo da reserva desligado.', 'arquivos.reserva', 'nenhuma');
    const arquivos: Array<[string, keyof ReturnType<typeof lidas>['arquivos']]> = [['Pesos', 'pesos'], ['Reputação', 'reputacao'], ['ECH', 'ech'], ['Vocabulário', 'vocabulario']];
    for (const [nome, chave] of arquivos) {
        const caminho = lidas().arquivos[chave];
        new Setting(containerEl)
            .setName(nome)
            .setDesc(`${caminho} (o mesmo arquivo que a bancada de juízes lê; edite os números nele).`)
            .addButton(b => b.setButtonText('Abrir').onClick(() => {
                const file = app.vault.getAbstractFileByPath(caminho);
                if (file instanceof TFile) void app.workspace.getLeaf(false).openFile(file);
                else new Notice(`⚠️ ${caminho} não existe neste cofre.`);
            }));
    }

    containerEl.createEl('h3', { text: 'Ponte do agente' });
    containerEl.createEl('p', {
        text: 'A ponte pela qual o agente local (o DSH) lê a Missão e propõe; nada grava sem o seu sim. Ligada, escuta só neste computador (127.0.0.1). Desligada, nada sobe nem avisa.',
        cls: 'setting-item-description',
    });
    /** Grava a edição da ponte e a sobe, a desce ou a muda de porta, pelo que vale depois. */
    const gravarPonte = async (edicao: Edicao, voltar: () => void) => {
        await gravar(edicao, voltar);
        await plugin.aplicarPonte();
    };
    new Setting(containerEl).setName('Ligar a ponte').setDesc('Sobe a ponte agora e a cada abertura do Obsidian.').addToggle(t => {
        t.setValue(lidas().ponte.ligada);
        t.onChange(valor => { void gravarPonte(editarPonteLigada(plugin.settings, partida, valor), redesenhar); });
    });
    new Setting(containerEl).setName('Porta').setDesc('A porta no 127.0.0.1, de 1024 a 65535. Vazio = a de partida.').addText(t => {
        t.setPlaceholder(String(lidas().ponte.porta)).setValue(String(lidas().ponte.porta));
        t.inputEl.addEventListener('change', () => {
            void gravarPonte(editarPortaDaPonte(plugin.settings, partida, t.getValue()), () => t.setValue(String(lidas().ponte.porta)));
        });
    });

    containerEl.createEl('h3', { text: 'Trilha de uso' });
    containerEl.createEl('p', {
        text: 'A Missão ensina o sistema pelo uso: recebe quem chega à tarde ou à noite com "o que você fez hoje?", mostra um gesto por vez no centro (marcado pelo uso real) e uma dica na primeira vez de cada botão. Os textos estão no arquivo da trilha; aqui se liga, desliga e ajusta.',
        cls: 'setting-item-description',
    });
    /** Grava a edição da trilha e a Missão relê (o que liga e as horas entram no modelo). */
    const gravarTrilha = async (edicao: Edicao, voltar: () => void) => {
        await gravar(edicao, voltar);
        (plugin as any).board?.missao?.agendar?.();
    };
    const trilha = () => lidas().trilha;
    const sim = (nome: string, desc: string, campo: CampoDaTrilha, valor: () => boolean) => {
        new Setting(containerEl).setName(nome).setDesc(desc).addToggle(t => {
            t.setValue(valor());
            t.onChange(v => { void gravarTrilha(editarTrilha(plugin.settings, partida, campo, v), redesenhar); });
        });
    };
    const campoDaTrilha = (nome: string, desc: string, campo: CampoDaTrilha, valor: () => string, placeholder = '') => {
        new Setting(containerEl).setName(nome).setDesc(desc).addText(t => {
            t.setPlaceholder(placeholder).setValue(valor());
            t.inputEl.addEventListener('change', () => {
                void gravarTrilha(editarTrilha(plugin.settings, partida, campo, t.getValue()), () => t.setValue(valor()));
            });
        });
    };
    sim('Receber à tarde ou à noite', 'Com a Day de hoje sem registro depois da hora abaixo, a Missão abre o dia com "o que você fez hoje?" (o ＋ O que fiz, o 🌙 e os dias de antes sem registro) no lugar do ▶️ da manhã.', 'trilha.acolhida', () => trilha().acolhida);
    campoDaTrilha('Hora da tarde', 'A partir de quando a acolhida aparece (HH:MM). Vazio = 14:00.', 'trilha.hora_da_tarde', () => trilha().hora_da_tarde, '14:00');
    campoDaTrilha('Dias de antes', 'Quantos dias para trás a acolhida procura os dias sem registro (0 a 31; 0 = nenhum). Vazio = 7.', 'trilha.dias_passados', () => String(trilha().dias_passados), '7');
    sim('O gesto da semana', 'O cartão no centro da Missão com o gesto da vez: como se faz, para quê e o link do guia; ele se marca pelo uso real.', 'trilha.gesto_da_semana', () => trilha().gesto_da_semana);
    campoDaTrilha('Vezes até o próximo', 'Em quantos dias o gesto feito o dá por aprendido; aí a árvore de uso propõe o seguinte pela triagem (1 a 30). Vazio = 3.', 'trilha.vezes', () => String(trilha().vezes), '3');
    sim('A dica da primeira vez', 'Uma linha de dica na primeira vez que um botão aparece; depois de vista, não volta.', 'trilha.dicas', () => trilha().dicas);
    campoDaTrilha('Arquivo da trilha', 'Os textos (as boas-vindas, os gestos e as dicas) e a forma de contar cada gesto. Vazio = a trilha desligada.', 'arquivos.trilha', () => lidas().arquivos.trilha, 'nenhum');

    containerEl.createEl('h3', { text: 'Protocolos por papel' });
    containerEl.createEl('p', {
        text: 'O código pede um protocolo pelo papel. Sem protocolo (ou com um que não carregou), o botão e as opções do papel somem.',
        cls: 'setting-item-description',
    });
    const carregados = ((plugin.manager?.getAll?.() ?? []) as Array<{ id: string; name?: string }>).map(p => ({ id: String(p.id), name: p.name }));
    for (const papel of PAPEIS) {
        const atual = lidas().protocolos_por_papel[papel as Papel];
        new Setting(containerEl).setName(papel).addDropdown(d => {
            for (const o of opcoesDoPapel(carregados, atual)) d.addOption(o.valor, o.rotulo);
            d.setValue(atual ?? '');
            d.onChange(valor => { void gravar(editarPapel(plugin.settings, partida, papel, valor || null), redesenhar); });
        });
    }
    containerEl.createEl('br');
}
