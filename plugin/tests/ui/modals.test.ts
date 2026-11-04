import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        App: class {},
        Modal: class { open() {} close() {} },
        TextAreaComponent: class {},
        Notice: class {},
        Setting: class {}
    };
});

import { multiselectOptionId } from '../../src/ui/modals';

// O harness não tem DOM (ambiente node, sem jsdom), então o id do checkbox não pode ser
// exercitado pelo `onOpen`. A função que o gera é exportada justamente para ser testável:
// é ela que garante espaço trocado e unicidade do `for=` do label.
describe('multiselectOptionId', () => {
    it('troca os espaços do rótulo em vez de deixar o id com espaço', () => {
        expect(multiselectOptionId(0, '🧠 Percepção que precisa virar clareza'))
            .toBe('ms-0-🧠-Percepção-que-precisa-virar-clareza');
    });

    it('não colide quando duas opções normalizam para o mesmo texto', () => {
        expect(multiselectOptionId(3, 'A B')).not.toBe(multiselectOptionId(4, 'A-B'));
    });

    it('continua gerando id válido para opção vazia', () => {
        expect(multiselectOptionId(1, '')).toBe('ms-1-');
    });
});
