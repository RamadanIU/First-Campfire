/**
 * Roadmap tracker. The single source of truth for progress is docs/ROADMAP.md:
 * one checkbox line per step. This tool reads it, tells a new session what to do
 * next, and verifies that every finished step left a report and screenshots.
 *
 *   node tools/roadmap.ts next          — the next step to work on
 *   node tools/roadmap.ts status        — progress by stage
 *   node tools/roadmap.ts check         — consistency check (also runs in CI)
 *   node tools/roadmap.ts done <id>     — mark a step finished (verifies evidence first)
 *   node tools/roadmap.ts shots <id>    — Markdown with the step's screenshots for the PR body
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Step {
  id: string;
  title: string;
  done: boolean;
  stage: number;
  stageTitle: string;
  /** 1-based line in docs/ROADMAP.md. */
  line: number;
}

export interface Card {
  id: string;
  title: string;
  file: string;
  line: number;
}

const STEP_LINE = /^- \[( |x)\] \*\*(\d+\.\d+[a-z]?)\*\* (.+)$/;
const STAGE_LINE = /^## Этап (\d+)\. (.+)$/;
const CARD_LINE = /^### (\d+\.\d+[a-z]?) — (.+)$/;

export function parseIndex(markdown: string): Step[] {
  const steps: Step[] = [];
  let stage = -1;
  let stageTitle = '';
  markdown.split('\n').forEach((text, index) => {
    const stageMatch = STAGE_LINE.exec(text);
    if (stageMatch) {
      stage = Number(stageMatch[1]);
      stageTitle = stageMatch[2]!.trim();
      return;
    }
    const stepMatch = STEP_LINE.exec(text);
    if (stepMatch) {
      steps.push({
        id: stepMatch[2]!,
        title: stepMatch[3]!.trim(),
        done: stepMatch[1] === 'x',
        stage,
        stageTitle,
        line: index + 1,
      });
    }
  });
  return steps;
}

export function parseCards(markdown: string, file: string): Card[] {
  const cards: Card[] = [];
  markdown.split('\n').forEach((text, index) => {
    const match = CARD_LINE.exec(text);
    if (match) cards.push({ id: match[1]!, title: match[2]!.trim(), file, line: index + 1 });
  });
  return cards;
}

/** Problems that do not depend on the file system: ids, stages, cards. */
export function findStructureProblems(steps: Step[], cards: Card[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) problems.push(`Шаг ${step.id} встречается в ROADMAP.md дважды`);
    seen.add(step.id);
    if (Number(step.id.split('.')[0]) !== step.stage) {
      problems.push(`Шаг ${step.id} стоит в разделе этапа ${step.stage}`);
    }
  }
  const cardIds = new Set<string>();
  for (const card of cards) {
    if (cardIds.has(card.id))
      problems.push(`Карточка шага ${card.id} описана дважды (${card.file})`);
    cardIds.add(card.id);
    if (!seen.has(card.id)) {
      problems.push(`Карточка ${card.id} (${card.file}) не внесена в docs/ROADMAP.md`);
    }
  }
  for (const step of steps) {
    if (!cardIds.has(step.id)) problems.push(`У шага ${step.id} нет карточки в docs/roadmap/`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const INDEX_FILE = join(ROOT, 'docs', 'ROADMAP.md');
const CARDS_DIR = join(ROOT, 'docs', 'roadmap');
const JOURNAL_DIR = join(ROOT, 'docs', 'journal');
const SHOTS_DIR = join(ROOT, 'docs', 'screenshots');

function loadSteps(): Step[] {
  return parseIndex(readFileSync(INDEX_FILE, 'utf8'));
}

function loadCards(): Card[] {
  return readdirSync(CARDS_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .flatMap((name) => {
      const file = join(CARDS_DIR, name);
      return parseCards(readFileSync(file, 'utf8'), relative(ROOT, file));
    });
}

function screenshotsOf(id: string): string[] {
  const dir = join(SHOTS_DIR, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => relative(ROOT, join(dir, name)));
}

function evidenceProblems(id: string): string[] {
  const problems: string[] = [];
  if (!existsSync(join(JOURNAL_DIR, `${id}.md`))) {
    problems.push(`Шаг ${id}: нет отчёта docs/journal/${id}.md`);
  }
  if (screenshotsOf(id).length === 0) {
    problems.push(`Шаг ${id}: нет скриншотов в docs/screenshots/${id}/`);
  }
  return problems;
}

function findStep(steps: Step[], id: string | undefined): Step {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) {
    console.error(`Шаг "${id ?? ''}" не найден в docs/ROADMAP.md`);
    process.exit(1);
  }
  return step;
}

function commandNext() {
  const steps = loadSteps();
  const cards = loadCards();
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  console.log(`Прогресс: ${done} из ${steps.length} шагов`);
  const last = steps.filter((step) => step.done).at(-1);
  if (last)
    console.log(
      `Последний выполненный: ${last.id} ${last.title} (отчёт: docs/journal/${last.id}.md)`,
    );
  if (!next) {
    console.log('Все шаги дорожной карты выполнены.');
    return;
  }
  const card = cards.find((candidate) => candidate.id === next.id);
  console.log(`СЛЕДУЮЩИЙ ШАГ: ${next.id} — ${next.title}`);
  console.log(`Этап ${next.stage}. ${next.stageTitle}`);
  if (card) console.log(`Карточка шага: ${card.file}:${card.line}`);
}

function commandStatus() {
  const steps = loadSteps();
  const stages = new Map<number, Step[]>();
  for (const step of steps) stages.set(step.stage, [...(stages.get(step.stage) ?? []), step]);
  for (const [stage, list] of stages) {
    const done = list.filter((step) => step.done).length;
    const mark = done === list.length ? '✔' : done > 0 ? '…' : ' ';
    console.log(`[${mark}] Этап ${stage}. ${list[0]!.stageTitle}: ${done}/${list.length}`);
  }
  const done = steps.filter((step) => step.done).length;
  console.log(`Итого: ${done} из ${steps.length}`);
}

function commandCheck() {
  const steps = loadSteps();
  const problems = findStructureProblems(steps, loadCards());
  if (steps.length === 0) problems.push('В docs/ROADMAP.md не найдено ни одного шага');
  for (const step of steps) if (step.done) problems.push(...evidenceProblems(step.id));
  if (problems.length > 0) {
    console.error(`Дорожная карта: найдено проблем — ${problems.length}`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exit(1);
  }
  const done = steps.filter((step) => step.done).length;
  console.log(`Дорожная карта в порядке: ${steps.length} шагов, выполнено ${done}.`);
}

function commandDone(id: string | undefined) {
  const step = findStep(loadSteps(), id);
  if (step.done) {
    console.log(`Шаг ${step.id} уже отмечен выполненным.`);
    return;
  }
  const problems = evidenceProblems(step.id);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error('Шаг не отмечен: сначала нужны отчёт и скриншоты.');
    process.exit(1);
  }
  const lines = readFileSync(INDEX_FILE, 'utf8').split('\n');
  lines[step.line - 1] = lines[step.line - 1]!.replace('- [ ]', '- [x]');
  writeFileSync(INDEX_FILE, lines.join('\n'));
  console.log(`Шаг ${step.id} отмечен выполненным в docs/ROADMAP.md.`);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function commandShots(id: string | undefined) {
  const step = findStep(loadSteps(), id);
  const shots = screenshotsOf(step.id);
  if (shots.length === 0) {
    console.error(`Нет скриншотов в docs/screenshots/${step.id}/`);
    process.exit(1);
  }
  const repo = /github\.com[:/](.+?)(?:\.git)?$/.exec(git('remote', 'get-url', 'origin'))?.[1];
  const sha = git('rev-parse', 'HEAD');
  if (git('status', '--porcelain', '--', join('docs', 'screenshots', step.id)) !== '') {
    console.error('Скриншоты ещё не закоммичены: ссылки заработают только после commit и push.');
  }
  for (const shot of shots) {
    const name = shot
      .split('/')
      .at(-1)!
      .replace(/\.png$/, '');
    console.log(`![${name}](https://github.com/${repo}/blob/${sha}/${shot}?raw=true)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2);
  switch (command) {
    case 'next':
      commandNext();
      break;
    case 'status':
      commandStatus();
      break;
    case 'check':
      commandCheck();
      break;
    case 'done':
      commandDone(argument);
      break;
    case 'shots':
      commandShots(argument);
      break;
    default:
      console.log('Команды: next | status | check | done <id> | shots <id>');
      process.exit(command ? 1 : 0);
  }
}
