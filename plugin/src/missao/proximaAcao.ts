/**
 * A próxima ação real de um projeto na Missão: a ação aberta dele que vem primeiro, ou a que a nota do
 * projeto fixa.
 *
 * Por quê: o inventário do painel antigo aposentado (02/11/2026, item 2; o que ele fazia bem se incorpora):
 * o painel antigo dizia a próxima ação de cada projeto e lia o
 * `proxima_acao_real:` da nota; a Missão ordenava as tarefas, mas não dizia qual vinha primeiro em cada
 * projeto. A ordem é a que já existe (`ordemPadrao`, que quem compõe passa): nenhuma ordem nova nasce aqui.
 * A fixada vence pela regra do motor (`fixadaEntre`). O projeto sem ação aberta não ganha sinal novo: é o
 * que a `central-sem-movimento` já diz.
 *
 * Módulo puro. Prova: tests/missao/proximaAcao.test.ts.
 */
import { fixadaEntre } from '../engine/proximaAcao';
import type { MissaoIndice, MissaoTarefa, ProximaAcao } from './tipos';

/**
 * O que faz: as candidatas a próxima ação de um projeto: as ações abertas dele (direto ou pela SMART mãe),
 * sem as que esperam por outra tarefa ainda aberta (o `blockedBy`).
 * Por quê: a próxima ação é "real" quando dá para fazer agora; a bloqueada por uma aberta espera (a regra
 * do painel antigo). O bloqueio por uma tarefa já feita, ou que não está no índice, não segura.
 * Entra → sai: o índice e o id do projeto → as tarefas, na ordem do índice.
 * Erro e ataque: a SMART, a feita, a de algum dia e a cancelada ficam de fora; o bloqueio por si mesma não conta.
 */
function candidatasDoProjeto(indice: MissaoIndice, id: string): MissaoTarefa[] {
    const abertaPorNome = new Map<string, boolean>();
    for (const t of indice.tarefas) abertaPorNome.set(t.record.basename.normalize('NFC').toLowerCase(), t.aberta);
    return indice.vivas.filter(t => t.tipo === 'acao' && t.aberta && t.projeto === id && !(t.record.blockedBy ?? []).some(b => {
        const nome = String(b ?? '').normalize('NFC').toLowerCase();
        return nome !== t.record.basename.normalize('NFC').toLowerCase() && abertaPorNome.get(nome) === true;
    }));
}

/**
 * O que faz: a próxima ação real de um projeto: a fixada na nota dele (`proxima_acao_real`), quando é uma
 * das candidatas; senão a primeira das candidatas pela ordem que chega.
 * Por quê: a fixada é uma decisão de quem usa e vence a ordem, dita como fixada; a fixada que já não é candidata
 * (feita, de outro projeto) não inventa nada, a ordem volta a valer e o painel diz o que o campo aponta.
 * Entra → sai: o índice, o id do projeto e a ordem (a comparação de `ordemPadrao`) → `ProximaAcao`, ou
 * `null` (o id não é de projeto, ou ele não tem ação aberta).
 * Erro e ataque: a lista não é mutada (a ordem roda numa cópia); sem fixada, `fixadaSemEfeito` é `null`.
 * Prova: tests/missao/proximaAcao.test.ts.
 */
export function proximaAcaoDoProjeto(indice: MissaoIndice, id: string, ordem: (a: MissaoTarefa, b: MissaoTarefa) => number): ProximaAcao | null {
    const p = indice.projetos.get(id);
    if (!p) return null;
    const cands = candidatasDoProjeto(indice, id);
    const fixada = String(p.fixada ?? '').trim();
    const achada = fixada ? fixadaEntre(cands, fixada, t => [t.caminho, t.record.basename]) : null;
    if (achada) return { tarefa: achada, origem: 'fixada', fixadaSemEfeito: null };
    const primeira = [...cands].sort(ordem)[0];
    if (!primeira) return null;
    return { tarefa: primeira, origem: 'ordem', fixadaSemEfeito: fixada || null };
}
