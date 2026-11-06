/**
 * O centro de um módulo de aprendizado na Missão (05/11, o módulo de idiomas): a fila do dia (as novas e as revisões
 * vencidas), o nível em curso na forma de mostrar ("dominadas · do nível · faltam"), as peças do nível e os
 * protocolos do tipo (o gesto do dia), para o nó do departamento ou do projeto que as notas do tipo apontam.
 *
 * Por quê: o que é próprio de um domínio vira módulo especial, e não ramo especial (30/10): o tipo declara o
 * `aprendizado` no modelo dele, e o cartão e o painel genéricos do módulo mostram o centro. Nada aqui tem nome de
 * tipo, de campo, de língua nem de protocolo: tudo vem do modelo e das contas do motor (`engine/repeticao.ts`).
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/aprendizado.test.ts.
 */
import { contasDosNiveis, filaDoDia, nivelEmCurso, pecasDoNivel, type CartaoLido } from '../engine/repeticao';
import { grammarText, type GrammarCounts } from '../engine/showGrammar';
import type { DomainModel } from '../engine/domainModel';
import { APRENDIZADO } from './frases';
import type { NotaComCampos } from './entrada';
import type { CentroDoAprendizado, NivelDoCentro } from './tipos';

/**
 * O que faz: a conta de um nível na forma única de mostrar: as dominadas no lugar das feitas, as do nível no lugar
 * do plano e as que faltam, sem fora do plano nem algum dia.
 * Entra → sai: as dominadas e as do nível → a conta.
 */
function contaDoNivel(dominadas: number, doNivel: number): GrammarCounts {
    return { feitas: dominadas, planoFeitas: dominadas, plano: doNivel, faltam: doNivel - dominadas, fora: 0, algumDia: 0 };
}

/**
 * O que faz: o centro do módulo de nome `modulo`: o primeiro modelo com `aprendizado` que tem notas apontando para
 * ele; a fila do dia pela fila do modelo (a rodada de hoje: as novas que a Day já registra), as contas dos níveis, o nível em
 * curso, as peças do tipo `pecas` do modelo nesse nível e os protocolos do modelo. Sem nota do tipo no módulo,
 * `null` (o módulo comum não muda).
 * Por quê: "o centro do módulo mostra a fila do dia (a nova e as revisões vencidas) e o nível em 'dominadas · do
 * nível · faltam'" (proposta de 05/11, §6), pela forma de mostrar que já existe.
 * Entra → sai: o nome do módulo, as notas lidas, os modelos dos tipos, hoje e as novas que a Day de hoje já registra
 * (por `type`; 06/11, a mesma conta da fila do gesto) → o centro, ou `null`.
 * Erro e ataque: a nota de outro módulo, de outro tipo ou sem nível fica de fora da conta; o nível sem frase não
 * aparece; o modelo sem `aprendizado` não conta.
 * Prova: tests/missao/aprendizado.test.ts.
 */
export function centroDoAprendizado(modulo: string, notas: readonly NotaComCampos[], modelos: readonly DomainModel[], hoje: string, novasDeHoje: Readonly<Record<string, number>> = {}): CentroDoAprendizado | null {
    const lidas = (type: string | undefined): CartaoLido[] => !type ? [] : notas
        .filter(n => String(n.campos?.type ?? '').trim() === type)
        .map(n => ({ caminho: n.caminho, nome: n.nome, campos: n.campos }));
    const filtro = { modulo };
    for (const m of modelos) {
        if (!m.aprendizado) continue;
        const cartoes = lidas(m.candidatos.type);
        const contas = contasDosNiveis(cartoes, filtro);
        // As novas que a Day de hoje já registra (06/11): a mesma conta da fila do gesto.
        const fila = filaDoDia(cartoes, hoje, m.aprendizado.fila, { novasVistas: novasDeHoje[m.candidatos.type!] ?? 0 }, filtro);
        if (!contas.length && !fila.itens.length && !fila.novas) continue;
        const atual = nivelEmCurso(contas);
        const nivel: NivelDoCentro | null = atual
            ? { nivel: atual.nivel, linha: grammarText(contaDoNivel(atual.dominadas, atual.doNivel), APRENDIZADO.semFrases, APRENDIZADO.rotulos), contagens: contaDoNivel(atual.dominadas, atual.doNivel), usos: atual.usos }
            : null;
        const novas = fila.itens.filter(i => i.tipo === 'nova').length;
        const revisoes = fila.itens.length - novas;
        return {
            linhaDoCartao: APRENDIZADO.linhaDoCartao(novas, revisoes, nivel?.nivel ?? ''),
            linhaDaFila: fila.itens.length ? APRENDIZADO.linhaDaFila(novas, revisoes) : APRENDIZADO.filaVazia,
            fila: fila.itens,
            nivel,
            niveis: contas.map(c => ({ nivel: c.nivel, linha: grammarText(contaDoNivel(c.dominadas, c.doNivel), APRENDIZADO.semFrases, APRENDIZADO.rotulos) })),
            pecas: atual ? pecasDoNivel(lidas(m.aprendizado.pecas), atual.nivel, filtro) : [],
            protocolos: [...m.protocolos],
        };
    }
    return null;
}
