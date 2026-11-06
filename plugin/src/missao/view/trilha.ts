/**
 * A trilha de uso na tela (05/11/2026): a acolhida de quem chega à tarde ou à noite, o cartão do gesto da semana
 * e a dica da primeira vez.
 *
 * Por quê: a nota "Atrito na abertura diária e trilha didática de hábito de uso" (01/11). Nenhum botão novo
 * de registro: a acolhida põe à mão os que já existem (o "＋ O que fiz" do painel do dia, pelo mesmo
 * `feito-abrir`, e o 🌙 do ciclo, o mesmo botão do centro), e cada dia sem registro é o nó do dia, pelo mesmo
 * `data-goto` do mapa. Os textos vêm do arquivo da trilha, pelo modelo; nenhum mora aqui.
 *
 * Só desenha: o modelo e o contexto entram, o elemento sai. Prova: tests/missao/trilha.test.ts ("a tela").
 */
import type { AcolhidaDoDia, DicaDaTrilha, GestoDaVez } from '../tipos';
import { comValores } from '../trilha';
import { el, botao } from './dom';
import type { Contexto } from './contrato';

/** O que faz: `AAAA-MM-DD` → `DD/MM`. */
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * O que faz: a acolhida no centro do dia de hoje: a pergunta, o "＋ O que fiz" (abre o formulário do painel do
 * dia), o 🌙 do ciclo que veio (o mesmo botão), as linhas sobre o 📖 e o compromisso de amanhã e os dias de
 * antes sem registro (cada um leva ao nó do dia).
 * Entra → sai: o contexto, o dia, a acolhida e a fila do 🌙 (ou `null`) → o bloco.
 * Erro e ataque: o texto que o arquivo não traz não aparece (nenhum texto de reserva no código).
 */
export function acolhidaEl(ctx: Contexto, dia: string, a: AcolhidaDoDia, fechar: HTMLElement | null): HTMLElement {
    const { doc } = ctx;
    const t = a.textos;
    const box = el(doc, 'div', 'trl-acolhida', { role: 'group', 'aria-label': t.titulo || null });
    if (t.titulo) box.appendChild(el(doc, 'p', 'trl-titulo', null, t.titulo));
    if (t.texto) box.appendChild(el(doc, 'p', 'trl-texto', null, t.texto));
    const acts = el(doc, 'div', 'trl-acts');
    if (t.feito && ctx.gravar) {
        const b = botao(doc, 'cyc trl-feito', t.feito, { 'data-act': 'feito-abrir', 'data-dia': dia });
        ctx.marcar(b, t.feito_dica || t.feito);
        acts.appendChild(b);
    }
    if (fechar) acts.appendChild(fechar);
    if (acts.children.length) box.appendChild(acts);
    for (const k of ['fechar', 'abrir']) if (t[k]) box.appendChild(el(doc, 'p', 'trl-nota', null, t[k]));
    if (a.passados.length) {
        const p = el(doc, 'div', 'trl-passados', { role: 'group', 'aria-label': t.passados || null });
        if (t.passados) p.appendChild(el(doc, 'span', 'trl-rotulo', null, t.passados));
        for (const d of a.passados) {
            const b = botao(doc, 'trl-dia', diaCurto(d), { 'data-goto': `d:${d}` });
            ctx.marcar(b, t.passado_dica ? `${diaCurto(d)}: ${t.passado_dica}` : diaCurto(d));
            p.appendChild(b);
        }
        box.appendChild(p);
    }
    return box;
}

/**
 * O que faz: o cartão do gesto da semana: o gesto, a contagem pelo uso real, como se faz, para quê, o link do
 * guia e o seguinte; com todos os gestos em uso, a frase do fim.
 * Entra → sai: o contexto e o gesto da vez → o cartão.
 */
export function gestoEl(ctx: Contexto, g: GestoDaVez): HTMLElement {
    const { doc } = ctx;
    const t = g.textos;
    const box = el(doc, 'div', 'trl-gesto', { role: 'group', 'aria-label': t.titulo || null });
    if (t.titulo) box.appendChild(el(doc, 'p', 'trl-rotulo', null, t.titulo));
    if (!('gesto' in g)) {
        if (t.fim) box.appendChild(el(doc, 'p', 'trl-texto', null, t.fim));
        return box;
    }
    const cab = el(doc, 'p', 'trl-titulo', null, [g.gesto.emoji, g.gesto.titulo].filter(Boolean).join(' '));
    box.appendChild(cab);
    if (t.contagem) box.appendChild(el(doc, 'p', 'trl-conta', null, comValores(t.contagem, { n: g.n, meta: g.meta })));
    const linha = (rotulo: string | undefined, valor: string) => {
        if (!valor) return;
        const p = el(doc, 'p', 'trl-texto');
        if (rotulo) p.appendChild(el(doc, 'b', null, null, `${rotulo}: `));
        p.append(valor);
        box.appendChild(p);
    };
    linha(t.como, g.gesto.como);
    linha(t.para, g.gesto.para);
    if (g.gesto.guia && t.guia) {
        const b = botao(doc, 'trl-guia', t.guia, { 'data-act': 'trl-guia', 'data-guia': g.gesto.guia });
        ctx.marcar(b, t.guia_dica || t.guia);
        box.appendChild(b);
    }
    if (g.proximo && t.proximo) box.appendChild(el(doc, 'p', 'trl-nota', null, comValores(t.proximo, { gesto: [g.proximo.emoji, g.proximo.titulo].filter(Boolean).join(' ') })));
    return box;
}

/**
 * O que faz: o seletor do botão de uma dica (o `data-act` e, no botão do ciclo, o protocolo).
 * Erro e ataque: o `act` e o protocolo já vêm limpos do leitor do arquivo (letras, números, `-` e `_`).
 */
export function seletorDaDica(d: DicaDaTrilha): string {
    return `[data-act="${d.act}"]${d.protocolo ? `[data-protocolo="${d.protocolo}"]` : ''}`;
}

/**
 * O que faz: a dica da primeira vez: tira a que estava e, da primeira dica ainda não vista cujo botão está na
 * tela, põe a linha logo depois do botão, com o "Entendi". Uma dica por vez.
 * Por quê: "na primeira vez que um gesto ou botão aparece, uma linha de dica, que some depois de vista": a dica
 * mostrada vira vista no salvamento (não volta na próxima abertura) e fica nesta abertura até o "Entendi".
 * Entra → sai: a raiz, o documento, as dicas, as vistas e as desta abertura (as que já apareceram e as fechadas)
 * → o id da dica posta, ou `null`.
 * Erro e ataque: o botão escondido (`hidden` ou dentro de um escondido) não conta; o seletor que não serve é pulado.
 */
export function porDica(raiz: HTMLElement, doc: Document, dicas: readonly DicaDaTrilha[], vistas: readonly string[], abertura: { mostradas: Set<string>; fechadas: Set<string> }, fechar: string): string | null {
    for (const velha of Array.from(raiz.querySelectorAll('.trl-dica'))) velha.remove();
    for (const d of dicas) {
        if (abertura.fechadas.has(d.id) || (vistas.includes(d.id) && !abertura.mostradas.has(d.id))) continue;
        let alvo: HTMLElement | null = null;
        try {
            alvo = (Array.from(raiz.querySelectorAll(seletorDaDica(d))) as HTMLElement[]).find(e => !e.closest('[hidden]')) ?? null;
        } catch (e) { continue; }
        if (!alvo) continue;
        const linha = el(doc, 'p', 'trl-dica', { role: 'note', 'data-dica-trilha': d.id }, d.texto);
        if (fechar) linha.appendChild(botao(doc, 'trl-dica-ok', fechar, { 'data-act': 'trl-dica-ok', 'data-dica': d.id }));
        alvo.insertAdjacentElement('afterend', linha);
        abertura.mostradas.add(d.id);
        return d.id;
    }
    return null;
}
