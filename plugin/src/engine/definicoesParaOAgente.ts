/**
 * As definições do sistema para o agente (05/11, o Dk pessoal): o que a pessoa definiu (o nome, os valores, as
 * áreas, o foco do trimestre, as pastas, as notas, os protocolos de cada papel), já lido pelas camadas de
 * sempre (`lerDefinicoes`: os padrões, as camadas de partida dos módulos e o bloco `definicoes` do salvamento).
 *
 * Por quê: o agente lia os valores e as áreas por arquivo, ou nem lia, e o `data.json` deste cofre não tem o
 * bloco `definicoes` (vêm da camada de partida do módulo do cofre). A ponte passa a dar a leitura que o
 * plugin usa, a mesma que a aba mostra; só leitura.
 *
 * Módulo puro: recebe as definições e o que a borda sabe (o fuso que vale, se há bloco salvo). Prova:
 * tests/engine/definicoesParaOAgente.test.ts.
 */
import type { Definicoes } from '../definicoes';

/** O que a borda sabe e a leitura não traz. */
export interface ContextoDasDefinicoes {
    /** O fuso que vale (o das definições, ou o do relógio do sistema). */
    fusoEfetivo: string;
    /** Se o salvamento tem o bloco `definicoes` (sem ele, valem os padrões e as camadas de partida). */
    salvo: boolean;
}

/**
 * O que faz: as definições na forma curta para o agente: os campos que dizem quem a pessoa é e onde as coisas
 * estão, os protocolos só dos papéis que têm um, os papéis sem protocolo pelo nome e, dos ajustes dos pesos,
 * só as categorias ajustadas.
 * Por quê: o agente recomenda pelo foco e pelos valores e acha as notas pelas pastas; o detalhe dos pesos é do
 * plugin (a ordem já vem pronta em `dfm_mission_state`) e não cabe no contexto de um modelo pequeno.
 * Entra → sai: as definições e o contexto → um objeto novo, de cópias (mudar o resultado não muda as definições).
 * Erro e ataque: nada lança; o que a leitura não preencheu já vem com o padrão; nenhuma chave da ponte (o token)
 * mora nas definições.
 * Prova: tests/engine/definicoesParaOAgente.test.ts.
 */
export function definicoesParaOAgente(d: Definicoes, contexto: ContextoDasDefinicoes): Record<string, unknown> {
    const papeis = Object.entries(d.protocolos_por_papel ?? {});
    return {
        versao: d.versao,
        inicializado: d.inicializado,
        pessoa: { nome: d.pessoa.nome, fuso_horario: d.pessoa.fuso_horario, fuso_efetivo: contexto.fusoEfetivo },
        rotulos: { ...d.rotulos },
        valores: d.valores.map(v => ({ ...v })),
        valores_relacoes: d.valores_relacoes.map(v => ({ ...v })),
        areas: d.areas.map(a => ({ ...a })),
        trimestre: { foco: [...d.trimestre.foco] },
        vocabulario: { termos_extra: d.vocabulario.termos_extra.map(t => ({ ...t })) },
        pastas: { ...d.pastas, excluidas: [...d.pastas.excluidas] },
        arquivos: { ...d.arquivos },
        pesos: { categorias_ajustadas: Object.keys(d.pesos.ajustes ?? {}).filter(k => !k.startsWith('_')) },
        ponte: { ...d.ponte },
        protocolos_por_papel: Object.fromEntries(papeis.filter(([, id]) => typeof id === 'string' && id)),
        papeis_sem_protocolo: papeis.filter(([, id]) => !id).map(([papel]) => papel),
        salvo: contexto.salvo,
        fonte: contexto.salvo
            ? 'os padrões, as camadas de partida dos módulos e o bloco definicoes do salvamento (este vale por cima)'
            : 'os padrões e as camadas de partida dos módulos (o salvamento não tem o bloco definicoes)',
    };
}
