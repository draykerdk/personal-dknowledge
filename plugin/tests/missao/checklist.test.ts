/**
 * Prova da checklist de uma nota (29/10): os itens `- [ ]` e `- [x]` do corpo, e as edições de uma
 * linha só (marcar, acrescentar, tirar), sem tocar no resto da nota.
 */
import { describe, expect, it } from 'vitest';
import { acrescentarItem, checagensDoTexto, checklistDoTexto, marcarItem, textoLimpoDoItem, tirarItem } from '../../src/missao/checklist';

const NOTA = [
    '---',
    'title: Arrumar a mala',
    'tags: [- [ ] não é item]',
    '- [ ] nem isto, é frontmatter',
    '---',
    '',
    'Antes de sair.',
    '',
    '- [ ] passaporte',
    '- [x] carregador',
    '  * [X] adaptador',
    '',
    '```',
    '- [ ] dentro do código não conta',
    '```',
    '',
    'Fim.',
    '',
].join('\n');

/** O que mudou entre dois textos: as linhas diferentes (índice, antes, depois). */
function diferencas(a: string, b: string): Array<[number, string | undefined, string | undefined]> {
    const la = a.split('\n'), lb = b.split('\n');
    const out: Array<[number, string | undefined, string | undefined]> = [];
    for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) out.push([i, la[i], lb[i]]);
    return out;
}

describe('ler a checklist', () => {
    it('os itens do corpo, na ordem, com a linha e o estado; fora o frontmatter e o código', () => {
        expect(checklistDoTexto(NOTA)).toEqual([
            { linha: 8, feito: false, texto: 'passaporte' },
            { linha: 9, feito: true, texto: 'carregador' },
            { linha: 10, feito: true, texto: 'adaptador' },
        ]);
    });
    it('sem checklist, nenhum item; o que não é texto, nenhum', () => {
        expect(checklistDoTexto('só texto\n- item sem caixa\n')).toEqual([]);
        expect(checklistDoTexto(null as unknown as string)).toEqual([]);
    });
});

describe('o lugar vazio do modelo da tarefa (a percorrida de 06/11)', () => {
    it('o "- [ ] " sem texto não é item; os de texto ficam, com a linha deles', () => {
        const nota = '---\nstatus: open\n---\n# T\n\n## 📋 Checklist\n- [ ] \n- [ ] A fonte primária\n';
        expect(checklistDoTexto(nota)).toEqual([{ linha: 7, feito: false, texto: 'A fonte primária' }]);
        expect(checklistDoTexto('## 📋 Checklist\n- [ ] \n')).toEqual([]);
    });
});

describe('marcar um item: só aquela linha muda', () => {
    it('marca e desmarca, e nada mais da nota muda', () => {
        const r = marcarItem(NOTA, 8, true, 'passaporte');
        if (!('texto' in r)) throw new Error('não marcou');
        expect(diferencas(NOTA, r.texto)).toEqual([[8, '- [ ] passaporte', '- [x] passaporte']]);
        const d = marcarItem(r.texto, 8, false, 'passaporte');
        if (!('texto' in d)) throw new Error('não desmarcou');
        expect(d.texto).toBe(NOTA);
        const x = marcarItem(NOTA, 10, false, 'adaptador');
        expect('texto' in x && diferencas(NOTA, x.texto)).toEqual([[10, '  * [X] adaptador', '  * [ ] adaptador']]);
    });
    it('a linha que mudou depois da leitura, a que não é item e o mesmo estado não gravam', () => {
        expect(marcarItem(NOTA, 8, true, 'outro texto')).toEqual({ problema: 'mudou' });
        expect(marcarItem(NOTA, 6, true, 'Antes de sair.')).toEqual({ problema: 'mudou' });
        expect(marcarItem(NOTA, 13, true, 'dentro do código não conta')).toEqual({ problema: 'mudou' });
        expect(marcarItem(NOTA, 3, true, 'nem isto, é frontmatter')).toEqual({ problema: 'mudou' });
        expect(marcarItem(NOTA, 9, true, 'carregador')).toEqual({ problema: 'igual' });
    });
    it('o fim de linha do Windows fica', () => {
        const crlf = NOTA.replace(/\n/g, '\r\n');
        const r = marcarItem(crlf, 8, true, 'passaporte');
        expect('texto' in r && r.texto).toBe(crlf.replace('- [ ] passaporte\r\n', '- [x] passaporte\r\n'));
    });
});

describe('acrescentar um item', () => {
    it('no fim do bloco da checklist, com o recuo e o marcador do item de cima; nada mais muda', () => {
        const r = acrescentarItem(NOTA, '  escova de dente ');
        if (!('texto' in r)) throw new Error('não acrescentou');
        expect(r.linha).toBe(11);
        expect(diferencas(NOTA, r.texto).slice(0, 1)).toEqual([[11, '', '  * [ ] escova de dente']]);
        // Só se inseriu uma linha: tirando-a, o texto é o mesmo.
        const t = tirarItem(r.texto, 11, 'escova de dente');
        expect('texto' in t && t.texto).toBe(NOTA);
    });
    it('sem checklist: no fim do corpo, antes da quebra do fim; sem quebra, numa linha nova', () => {
        const r = acrescentarItem('---\ntitle: x\n---\nTexto.\n', 'primeiro');
        expect(r).toEqual({ texto: '---\ntitle: x\n---\nTexto.\n- [ ] primeiro\n', linha: 4 });
        expect(acrescentarItem('Texto.', 'primeiro')).toEqual({ texto: 'Texto.\n- [ ] primeiro', linha: 1 });
        expect(acrescentarItem('', 'primeiro')).toEqual({ texto: '- [ ] primeiro', linha: 0 });
    });
    it('o item vazio ou com quebra de linha não grava', () => {
        expect(acrescentarItem(NOTA, '   ')).toEqual({ problema: 'vazio' });
        expect(acrescentarItem(NOTA, 'dois\nitens')).toEqual({ problema: 'vazio' });
    });
});

describe('tirar o item acrescentado (o Desfazer)', () => {
    it('só se a linha ainda é aquele item aberto', () => {
        expect(tirarItem(NOTA, 8, 'outro')).toEqual({ problema: 'mudou' });
        expect(tirarItem(NOTA, 9, 'carregador')).toEqual({ problema: 'mudou' });
        const t = tirarItem(NOTA, 8, 'passaporte');
        expect('texto' in t && diferencas(NOTA, t.texto)[0]).toEqual([8, '- [ ] passaporte', '- [x] carregador']);
    });
    it('limpa os links [[alvo|rótulo]] e [[alvo]] para mostrar na tela', () => {
        expect(textoLimpoDoItem('Executar: [[200 - FUNCTIONS/Protocolos/X.md|📊 Novo Hub de Cidade]]')).toBe('Executar: 📊 Novo Hub de Cidade');
        expect(textoLimpoDoItem('Ver [[500 - RESOURCES/Pessoas/Ana.md]] hoje')).toBe('Ver Ana hoje');
        // O negrito sai (06/11, os itens da 🔎 Conferência); o asterisco sem par fica.
        expect(textoLimpoDoItem('🤖 **A fonte primária.** O site oficial')).toBe('🤖 A fonte primária. O site oficial');
        expect(textoLimpoDoItem('__Data__ e 2 * 3')).toBe('Data e 2 * 3');
    });
});

describe('as checagens de uma nota de função (30/10)', () => {
    it('o negrito do começo de cada item, sem o ":" e o "." do fim; sem negrito, até o "Porquê:"; marcado ou não', () => {
        const texto = [
            '---', 'type: funcao', '---', '# 🏨 Hospedagem', '## 📋 Planejar',
            '- [ ] **As noites que a reserva cobre, contra a chegada e a partida:** a entrada no dia da chegada. Porquê: as datas.',
            '- [x] **A data das fotos.** Porquê: a foto antiga.',
            '- [ ] A política de cancelamento. Porquê: o plano muda.',
            '- [ ] **A data das fotos.** repetida',
            '- [ ] Porquê: só o porquê',
            '- [ ] ',
            '```', '- [ ] **dentro do código**', '```',
            '## ✅ Executar', '1. Na entrada: conferir.', '- sem caixa',
        ].join('\n');
        expect(checagensDoTexto(texto)).toEqual(['As noites que a reserva cobre, contra a chegada e a partida', 'A data das fotos', 'A política de cancelamento']);
    });
    it('a nota sem checklist, ou o que não é texto, dá vazio', () => {
        expect(checagensDoTexto('# nada\n- item sem caixa')).toEqual([]);
        expect(checagensDoTexto(undefined as unknown as string)).toEqual([]);
    });
});
