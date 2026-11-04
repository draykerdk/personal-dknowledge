/**
 * Abrir a Missão já na triagem, de fora dela (o comando "📥 SMART de semanas passadas").
 *
 * Por quê: a SMART que ficou de uma semana que passou tem o grupo dela na triagem (02/11/2026);
 * o comando antigo do rollover (`dfm-rollover-smart`, o id fica pelos atalhos) só leva até lá,
 * onde ele dá a semana de cada uma (S, P), com o Desfazer da Missão. Nada aqui grava.
 */
import { App, Notice } from 'obsidian';

/**
 * O que faz: abre a Missão na aba dela e, quando ela termina de montar, aperta o botão
 * "Triagem" (o mesmo do clique e da tecla T); se ele não aparece a tempo, o aviso diz a tecla.
 * Por quê: a Missão não tem porta de fora para abrir a triagem (e a Missão não muda aqui);
 * o botão é o gesto que ele faria.
 * Erro e ataque: a triagem já aberta (o botão com `aria-pressed="true"`) não fecha.
 */
export async function abrirTriagemDaMissao(app: App, abrirMissao: () => Promise<void>, tipoDaVista: string): Promise<void> {
    await abrirMissao();
    for (let i = 0; i < 30; i++) {
        const leaf = app.workspace.getLeavesOfType(tipoDaVista)[0];
        const botao = (leaf?.view as { containerEl?: HTMLElement } | undefined)?.containerEl?.querySelector<HTMLElement>('[data-act="triagem"]');
        if (botao) {
            if (botao.getAttribute('aria-pressed') !== 'true') botao.click();
            return;
        }
        await new Promise(r => window.setTimeout(r, 100));
    }
    new Notice('A Missão abriu; a tecla T abre a triagem.');
}
