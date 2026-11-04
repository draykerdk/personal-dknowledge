import type { App } from 'obsidian';
import type DFMPlugin from './main';
import type { DFMPluginSettings } from './settings';

/**
 * O que a aba de configurações entrega a um módulo opcional para ele desenhar a sua seção.
 * `redesenhar` refaz a aba inteira (o `display()` dela), para um campo que muda outros.
 */
export interface ContextoDaAba {
    plugin: DFMPlugin;
    app: App;
    containerEl: HTMLElement;
    redesenhar: () => void;
}

/**
 * Um módulo opcional do plugin: uma peça que o núcleo não importa e que um build pode deixar de fora.
 *
 * O que faz: diz o que o módulo registra na carga (`registrar`: vistas, ícones, comandos), o que
 * ele faz quando o núcleo existe (`comONucleo`), o que ele lê do salvamento na carga
 * (`naCargaDasConfiguracoes`), as definições de partida que ele traz
 * (`definicoesDePartida`, uma camada por baixo do bloco salvo, ver `src/definicoes.ts`) e o que ele
 * desenha na aba de configurações (`secaoDaAba`). O núcleo só percorre a lista de
 * `src/modulosOpcionais.ts` e usa o que cada um traz.
 * Por quê: o pacote aberto sai sem o agente do celular e sem as vistas do agente (03/11/2026). Com
 * a lista como a única porta, o pacote troca só a lista (por `src/modulosOpcionais.v0.ts`, vazia) e
 * nenhum arquivo do núcleo muda nem importa o que ficou de fora.
 * Erro e ataque: todos os ganchos são opcionais; um módulo sem nenhum deles não faz nada.
 * Prova: tests/opcionais/modulosOpcionais.test.ts.
 */
export interface ModuloOpcional {
    id: string;
    registrar?: (plugin: DFMPlugin) => void;
    /** Chamado logo depois de o núcleo (`plugin.nucleo`) nascer, na carga. */
    comONucleo?: (plugin: DFMPlugin) => void;
    /**
     * Chamado na carga das configurações, depois dos padrões e do salvo: o módulo põe nas configurações
     * os campos que são só dele (o agente, o bloco `mobileAgent`), lidos do salvo.
     */
    naCargaDasConfiguracoes?: (settings: DFMPluginSettings, salvo: Record<string, unknown>) => void;
    /** As definições de partida do módulo: uma camada por baixo do bloco `definicoes` do salvamento. */
    definicoesDePartida?: unknown;
    secaoDaAba?: (contexto: ContextoDaAba) => void;
}
