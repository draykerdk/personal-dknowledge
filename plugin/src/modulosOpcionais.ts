import type { ModuloOpcional } from './moduloOpcional';

/**
 * Os módulos opcionais do pacote aberto: nenhum.
 *
 * O que faz: o mesmo contrato de `modulosOpcionais.ts`, com a lista vazia. A exportação para o
 * pacote copia este arquivo com o nome `modulosOpcionais.ts`; o build do pacote não importa
 * nenhum arquivo de `src/opcionais`, de `src/mobile` nem das vistas do agente.
 * Por quê: a v0 sai sem o agente do celular e sem as vistas do agente (03/11/2026).
 * Prova: tests/opcionais/modulosOpcionais.test.ts (o grafo de imports a partir do main.ts com esta
 * lista não chega a nenhum desses arquivos).
 */
export const MODULOS_OPCIONAIS: readonly ModuloOpcional[] = [];
