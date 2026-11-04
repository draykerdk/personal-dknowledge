// O padrão do vitest, com uma exceção: `arquivo/` guarda código aposentado para consulta
// (a gamificação, arquivada em 29/10/2026; ver ARQUIVO_GAMIFICACAO.md). Os testes de lá
// acompanham o código que provavam e não rodam mais.
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: [...configDefaults.exclude, 'arquivo/**'],
    },
});
