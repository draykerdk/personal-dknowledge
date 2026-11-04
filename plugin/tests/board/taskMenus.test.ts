import { describe, expect, it, vi } from 'vitest';

/**
 * O submenu DFM do clique-direito numa tarefa (`TaskMenus`):
 * - reabrir uma tarefa feita ou cancelada pelo Status passa pelo `reopenTask` do quadro
 *   (o TaskNotes desfaz a conclusão e tira a tarefa do arquivo); antes só o campo era
 *   gravado e ela ficava aberta em `TaskNotes/Archive/`;
 * - o 🤝 Fazer agora no topo (arquitetura 4.7: "o clique-direito de um nó de tarefa no
 *   canvas da semana oferece 🤝 Fazer agora, que abre o gesto já com aquela tarefa").
 * Falha sem a mudança.
 */
vi.mock('obsidian', () => {
    class Menu {
        items: any[] = [];
        addItem(fn: (item: any) => void) {
            const item: any = {
                title: '', clicks: [] as any[], sub: null as any,
                setTitle(t: string) { item.title = t; return item; },
                setIcon() { return item; },
                setSection() { return item; },
                setDisabled() { return item; },
                onClick(cb: any) { item.clicks.push(cb); return item; },
                setSubmenu() { item.sub = new Menu(); return item.sub; },
            };
            fn(item);
            this.items.push(item);
            return this;
        }
        addSeparator() { return this; }
        showAtMouseEvent() {}
    }
    return {
        Menu,
        Modal: class { app: any; constructor(app: any) { this.app = app; } open() {} close() {} },
        Notice: class {},
        Setting: class {},
        TFile: class {},
        Platform: { isMobile: false },
        Keymap: {},
    };
});

import { Menu } from 'obsidian';
import { TaskMenus } from '../../src/board/taskMenus';
import { DO_NOW_PAPEL } from '../../src/canvas/taskCardModel';

const task = (over: Record<string, any> = {}) => ({
    path: 'TaskNotes/Archive/Gravar.md', basename: 'Gravar', title: 'Gravar', status: 'done', type: 'task',
    projects: [], tags: [], week: '', scheduled: '', due: '', ...over,
});

function setup() {
    (globalThis as any).window = { moment: () => ({ add: () => ({ format: () => '2026-10-20' }), format: () => '2026-10-19', isoWeekday: () => 1 }) };
    const board: any = {
        tasks: { all: () => [], read: () => null },
        completeTask: vi.fn(async () => true),
        setStatus: vi.fn(async () => true),
        updateTask: vi.fn(async () => true),
        reopenTask: vi.fn(async () => true),
        runProtocol: vi.fn(),
        runPapel: vi.fn(async () => {}),
    };
    const plugin: any = { app: {}, manager: { get: () => null }, nowTree: null };
    return { menus: new TaskMenus(plugin, board), board };
}

const find = (menu: any, title: string): any => {
    for (const item of menu.items) {
        if (item.title === title) return item;
        if (item.sub) { const hit = find(item.sub, title); if (hit) return hit; }
    }
    return null;
};

describe('o submenu DFM', () => {
    it('Status › Próxima ação numa tarefa feita passa pelo reopenTask, não só pelo campo', async () => {
        const { menus, board } = setup();
        const menu: any = new (Menu as any)();
        (menus as any).fill(menu, [task()]);
        find(menu, 'Próxima ação').clicks[0]();
        await vi.waitFor(() => expect(board.reopenTask).toHaveBeenCalledWith('TaskNotes/Archive/Gravar.md', 'next-action'));
        expect(board.updateTask).not.toHaveBeenCalled();
    });

    it('numa tarefa aberta, trocar o status continua só gravando o campo', async () => {
        const { menus, board } = setup();
        const menu: any = new (Menu as any)();
        (menus as any).fill(menu, [task({ path: 'TaskNotes/Tasks/Gravar.md', status: 'next-action' })]);
        find(menu, 'Em execução').clicks[0]();
        await vi.waitFor(() => expect(board.updateTask).toHaveBeenCalledWith('TaskNotes/Tasks/Gravar.md', { status: 'in-progress' }));
        expect(board.reopenTask).not.toHaveBeenCalled();
    });

    it('com a tabela do modelo lida, o Status lista os estados do modelo, como o ⋯ Status da Missão (03/11)', async () => {
        const { menus, board } = setup();
        board.missao = { estadosDaTarefa: () => [
            { valor: 'inbox', estado: 'entrada', rotulo: 'entrada', lugar: 'tempo', marca: 'triagem' },
            { valor: 'next-action', estado: 'aberta', rotulo: 'próxima', lugar: 'tempo' },
            { valor: 'done', estado: 'feita', rotulo: 'feita', lugar: 'conclusao' },
            { valor: 'cancelled', estado: 'cancelada', rotulo: 'cancelada', lugar: 'fora' },
        ] };
        const menu: any = new (Menu as any)();
        (menus as any).fill(menu, [task({ path: 'TaskNotes/Tasks/Gravar.md', status: 'inbox' })]);
        expect(find(menu, 'Próxima')).toBeTruthy();
        expect(find(menu, 'Concluir (feita)')).toBeTruthy();
        expect(find(menu, 'Cancelada')).toBeTruthy();
        expect(find(menu, 'Esperando')).toBeNull();
        find(menu, 'Próxima').clicks[0]();
        await vi.waitFor(() => expect(board.updateTask).toHaveBeenCalledWith('TaskNotes/Tasks/Gravar.md', { status: 'next-action' }));
    });

    it('🤝 Fazer agora no topo da tarefa aberta abre o gesto já com ela', () => {
        const { menus, board } = setup();
        const menu: any = new (Menu as any)();
        (menus as any).fill(menu, [task({ path: 'TaskNotes/Tasks/Gravar.md', status: 'next-action' })]);
        expect(menu.items[0].title).toBe('🤝 Fazer agora');
        menu.items[0].clicks[0]();
        expect(board.runPapel).toHaveBeenCalledWith(DO_NOW_PAPEL, expect.objectContaining({ tarefa_agora_path: 'TaskNotes/Tasks/Gravar.md' }));
    });

    it('feita, cancelada ou várias juntas: sem o 🤝 Fazer agora', () => {
        const { menus } = setup();
        for (const tasks of [[task()], [task({ status: 'cancelled' })], [task({ status: 'next-action' }), task({ status: 'next-action', path: 'TaskNotes/Tasks/B.md' })]]) {
            const menu: any = new (Menu as any)();
            (menus as any).fill(menu, tasks);
            expect(find(menu, '🤝 Fazer agora')).toBeNull();
        }
    });
});
