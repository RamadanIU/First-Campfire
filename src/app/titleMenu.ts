/**
 * Menu of the title screen (step 0.7): «Continue» (the world in the autosave slot), «New world»
 * with a seed field, «Load from file». Under the title — a note when there is something to say:
 * why the saved world cannot be opened, a question before something is erased, a warning about
 * the browser's storage. The title, the note and the cards stand in one column (`.title-screen`):
 * on a wide screen the cards go down to the bottom edge, below the people at the fire; on a
 * phone they follow the title, above the camp.
 *
 * Every way into the world goes through the autosave slot (./savedGame.ts): the menu puts a
 * world there and opens `?scene=world`, so a reload of that page returns to the same world.
 */
import { loadWorld } from '../sim/save.ts';
import { dateOf } from '../ui/dates.ts';
import { loadErrorText, loadWarningText, MENU, SAVE_TEXT } from '../ui/texts.ts';
import type { LaunchParams } from './params.ts';
import { inspectSlot, MAX_SEED, openSaveSlot, randomSeed, startNewWorld } from './savedGame.ts';
import { createFilePicker } from './saveFiles.ts';

type Child = Node | string | null;

/** Element with attributes and children (text is set as text, never as HTML). */
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  for (const child of children) if (child !== null) element.append(child);
  return element;
}

interface NoteAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

/** Open the world scene (it reads the world from the slot, or from the address). */
function goToWorld(query = '?scene=world'): void {
  window.location.assign(query);
}

/** Add the note and the menu to the column of the title screen (after the title). */
export function createTitleMenu(column: HTMLElement, params: LaunchParams): void {
  const slot = openSaveSlot(params);
  const contents = inspectSlot(slot);
  const current =
    contents.kind === 'saved'
      ? MENU.worldLine(dateOf(contents.header.tick), contents.header.seed)
      : null;

  const note = h('div', { class: 'menu-note', role: 'status', hidden: '' });
  const cards = h('div', { class: 'menu-cards' });
  const root = h('nav', { class: 'menu', 'aria-label': MENU.label }, cards);

  /** Show the note; actions become buttons beside the text. */
  function showNote(
    kind: 'problem' | 'info' | 'ask',
    title: string,
    text: string,
    detail = '',
    actions: NoteAction[] = [],
  ): void {
    note.className = `menu-note menu-note-${kind}`;
    const body = h(
      'div',
      { class: 'menu-note-text' },
      h('div', { class: 'menu-note-title' }, title),
      h('div', {}, text),
    );
    if (detail) body.append(h('div', { class: 'menu-detail' }, MENU.details(detail)));
    note.replaceChildren(body);
    if (actions.length > 0) {
      const row = h('div', { class: 'menu-actions' });
      for (const action of actions) {
        const button = h('button', { type: 'button', class: action.primary ? 'primary' : '' });
        button.textContent = action.label;
        button.addEventListener('click', action.run);
        row.append(button);
      }
      note.append(row);
    }
    note.hidden = false;
  }

  function showDefaultNote(): void {
    if (contents.kind === 'problem') {
      showNote(
        'problem',
        MENU.savedProblemTitle,
        MENU.savedProblemText(loadErrorText(contents.error)),
        contents.error.detail,
      );
    } else if (!slot.available) {
      showNote('info', MENU.noStorageTitle, SAVE_TEXT.noStorage);
    } else {
      note.hidden = true;
    }
  }

  /** Ask before erasing the current world; without one, just do it. */
  function confirmErase(question: string, yes: string, run: () => void): void {
    if (current === null) {
      run();
      return;
    }
    showNote('ask', question, MENU.eraseText(current), '', [
      { label: yes, primary: true, run },
      { label: MENU.cancel, run: showDefaultNote },
    ]);
  }

  // «Continue» — only when the slot holds a world that opens.
  if (contents.kind === 'saved') {
    const continueCard = h(
      'button',
      { type: 'button', class: 'menu-card primary', 'data-action': 'continue' },
      h('span', { class: 'menu-title' }, MENU.continueTitle),
      h('span', { class: 'menu-sub' }, dateOf(contents.header.tick)),
      h(
        'span',
        { class: 'menu-sub' },
        MENU.continueSeed(contents.header.seed, contents.header.tick),
      ),
      ...contents.warnings.map((warning) =>
        h('span', { class: 'menu-warn' }, loadWarningText(warning)),
      ),
    );
    continueCard.addEventListener('click', () => goToWorld());
    cards.append(continueCard);
  }

  // «New world» with a seed.
  const seedInput = h('input', {
    type: 'text',
    inputmode: 'numeric',
    maxlength: String(MAX_SEED).length.toString(),
    'aria-label': MENU.seedLabel,
    spellcheck: 'false',
    autocomplete: 'off',
  }) as HTMLInputElement;
  // A random seed is suggested — except when the address names one or freezes a frame
  // (screenshots must come out the same every time).
  seedInput.value = String(params.seedGiven || params.frame !== null ? params.seed : randomSeed());
  const reroll = h('button', { type: 'button', class: 'menu-reroll', title: MENU.reroll });
  reroll.textContent = '↻';
  const begin = h('button', { type: 'button', class: 'menu-go', 'data-action': 'new' });
  begin.textContent = MENU.begin;
  const seedError = h('span', { class: 'menu-error', hidden: '' });
  seedError.textContent = MENU.seedError(MAX_SEED);
  const newCard = h(
    'div',
    { class: `menu-card${contents.kind === 'saved' ? '' : ' primary'}`, 'data-card': 'new' },
    h('span', { class: 'menu-title' }, MENU.newTitle),
    h('span', { class: 'menu-sub menu-tagline' }, MENU.newTagline),
    h('span', { class: 'menu-seed' }, h('label', {}, MENU.seedWord, seedInput), reroll, begin),
    seedError,
  );
  cards.append(newCard);

  const readSeed = (): number | null => {
    const text = seedInput.value.trim();
    const seed = Number(text);
    return /^\d{1,9}$/.test(text) && seed <= MAX_SEED ? seed : null;
  };
  seedInput.addEventListener('input', () => {
    seedError.hidden = readSeed() !== null;
    seedInput.toggleAttribute('aria-invalid', readSeed() === null);
  });
  reroll.addEventListener('click', () => {
    seedInput.value = String(randomSeed());
    seedError.hidden = true;
    seedInput.removeAttribute('aria-invalid');
  });

  const startNew = () => {
    const seed = readSeed();
    if (seed === null) {
      seedError.hidden = false;
      seedInput.focus();
      return;
    }
    confirmErase(MENU.newAsk, MENU.newYes, () => {
      // Without storage the world can only come from the address — and it will not save itself.
      if (!slot.available) {
        goToWorld(`?scene=world&seed=${seed}`);
        return;
      }
      const result = startNewWorld(slot, seed);
      if (result.ok) goToWorld();
      else showNote('problem', MENU.newFailed, result.message);
    });
  };
  begin.addEventListener('click', startNew);
  seedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') startNew();
  });

  // «Load from file».
  const picker = createFilePicker(root, ({ name, text }) => {
    const result = loadWorld(text);
    if (!result.ok) {
      showNote(
        'problem',
        MENU.fileFailed(name),
        MENU.fileProblemText(loadErrorText(result.error)),
        result.error.detail,
      );
      return;
    }
    const what = MENU.worldLine(dateOf(result.header.tick), result.header.seed);
    confirmErase(MENU.openAsk(name, what), MENU.openYes, () => {
      const written = slot.write(text);
      if (written.ok) goToWorld();
      else showNote('problem', MENU.fileFailed(name), written.message);
    });
  });
  const loadCard = h(
    'button',
    { type: 'button', class: 'menu-card', 'data-action': 'load' },
    h('span', { class: 'menu-title' }, MENU.loadTitle),
    h('span', { class: 'menu-sub' }, MENU.loadSub),
  );
  loadCard.addEventListener('click', () => picker.open());
  cards.append(loadCard);

  showDefaultNote();
  column.append(note, root);
}
