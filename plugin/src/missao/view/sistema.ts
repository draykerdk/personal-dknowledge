/**
 * A vista do sistema: o nível Sistema da expansão da pinça (30/10), o sistema inteiro do começo até
 * hoje: os anos, do mais novo ao mais antigo, cada um com os trimestres dele em cartões do mapa, com
 * as notas de período, as tarefas feitas e abertas e a linha do ECH (que chega da borda, só lida).
 *
 * Por quê: a escada da expansão (30/10/2026): depois da visão do ano vem a visão geral do período da
 * visão de longo prazo, e depois uma visão do sistema todo, do começo até agora. Versão mínima e honesta:
 * só o que já se conta, sem dado novo. O clique num trimestre abre o painel dele, e a pinça sobre
 * ele entra no ramo dele, como em toda a Missão (`data-node`).
 *
 * Só desenha o que chega pronto (`modelo.sistema()`): nenhum nome de tipo, de campo nem de ramo.
 */
import { PINCA } from '../frases';
import type { LinhaDoSistema } from '../tipos';
import { el } from './dom';
import type { Contexto } from './contrato';
import { noEl } from './nos';

/**
 * O que faz: a vista do sistema: a linha dos anos e dos trimestres; cada trimestre é o cartão do
 * trimestre do mapa (`noEl`, com o nó do modelo, `modelo.no`), e embaixo dele as contas do Sistema (as
 * notas de período, as tarefas feitas e abertas) e a linha do ECH.
 * Por quê: o cartão de cada espécie tem um dono só (30/10: os outros nós seguem o mesmo
 * padrão); o que só o Sistema conta fica fora do cartão, na legenda dele.
 */
export function sistemaEl(ctx: Contexto, linha: LinhaDoSistema, ech: (chave: string) => string | null | undefined, selecionado: string | null): HTMLElement {
    const d = ctx.doc;
    const raiz = el(d, 'section', 'sistema', { 'aria-label': PINCA.sistema });
    raiz.appendChild(el(d, 'p', 'sistema-titulo', null, PINCA.sistemaDesde(linha.desde)));
    for (const a of linha.anos) {
        const ano = raiz.appendChild(el(d, 'div', 'sis-ano', { 'data-ano': a.ano }));
        ano.appendChild(el(d, 'span', 'sis-ano-rot mono', null, a.ano));
        const qs = ano.appendChild(el(d, 'div', 'sis-qs'));
        for (const q of a.trimestres) {
            const id = `q:${q.chave}`;
            const no = ctx.modelo.no(id);
            const w = qs.appendChild(el(d, 'div', `sis-q${q.atual ? ' today' : ''}`, { 'data-q': q.chave }));
            if (no) {
                // O cartão do trimestre com a interação do mapa (o que ele oferece e a alça de ligar).
                const cartao = w.appendChild(noEl(ctx, no, { minis: true }));
                ((cartao.querySelector('[data-node]') as HTMLElement | null) ?? cartao).classList.toggle('selected', id === selecionado);
            }
            w.appendChild(el(d, 'span', 'sis-contas', null, PINCA.contasDoTrimestre(q.notas, q.feitas, q.abertas)));
            const linhaEch = ech(q.chave);
            if (linhaEch !== null) w.appendChild(el(d, 'span', 'sis-ech', null, linhaEch === undefined ? PINCA.lendoEch : linhaEch));
            ctx.marcar(w, PINCA.dicaDoTrimestre(q.chave));
        }
    }
    if (linha.antes) raiz.appendChild(el(d, 'p', 'sis-antes', null, PINCA.sistemaAntes(linha.antes)));
    return raiz;
}
