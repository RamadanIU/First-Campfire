import { describe, expect, it } from 'vitest';
import { findStructureProblems, parseCards, parseIndex } from './roadmap.ts';

const INDEX = `# Дорожная карта

## Этап 0. Фундамент

- [x] **0.1** Репозиторий и сборка
- [ ] **0.2** Ядро симуляции

## Этап 1. Двое у костра

- [ ] **1.1** Карта и камера
- [ ] **1.3a** Сытость
`;

const CARDS = `# Этап 0

### 0.1 — Репозиторий и сборка
текст

### 0.2 — Ядро симуляции
`;

describe('roadmap', () => {
  it('parses steps with stage, status and line', () => {
    const steps = parseIndex(INDEX);
    expect(steps.map((step) => step.id)).toEqual(['0.1', '0.2', '1.1', '1.3a']);
    expect(steps[0]).toMatchObject({ done: true, stage: 0, stageTitle: 'Фундамент', line: 5 });
    expect(steps[2]).toMatchObject({ done: false, stage: 1, title: 'Карта и камера' });
  });

  it('parses step cards', () => {
    expect(parseCards(CARDS, 'stage-00.md')).toEqual([
      { id: '0.1', title: 'Репозиторий и сборка', file: 'stage-00.md', line: 3 },
      { id: '0.2', title: 'Ядро симуляции', file: 'stage-00.md', line: 6 },
    ]);
  });

  it('reports steps without cards and cards without steps', () => {
    const steps = parseIndex(INDEX);
    const cards = [
      ...parseCards(CARDS, 'stage-00.md'),
      { id: '9.9', title: 'x', file: 'f', line: 1 },
    ];
    const problems = findStructureProblems(steps, cards);
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain('9.9');
    expect(problems.join('\n')).toContain('1.1');
    expect(problems.join('\n')).toContain('1.3a');
  });

  it('reports duplicates and steps filed under the wrong stage', () => {
    const steps = parseIndex('## Этап 0. А\n- [ ] **0.1** a\n- [ ] **0.1** b\n- [ ] **2.1** c\n');
    const cards = [
      { id: '0.1', title: 'a', file: 'f', line: 1 },
      { id: '2.1', title: 'c', file: 'f', line: 2 },
    ];
    expect(findStructureProblems(steps, cards)).toHaveLength(2);
  });
});
