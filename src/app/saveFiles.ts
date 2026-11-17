/**
 * Saves as files on the player's computer (step 0.7): «Save to file» downloads the save text,
 * «Load from file» lets the player pick one. The text is the same as in the autosave slot,
 * so a file opens anywhere: in another browser, on another computer, in `npm run sim --load`.
 */

/** Offer `text` as a download named `fileName`. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started by now; the address is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file the player picked: its name and text. */
export interface PickedFile {
  name: string;
  text: string;
}

/**
 * A hidden file picker inside `parent`. `open()` shows the browser's dialog; `onPick` gets the
 * chosen file (a file that cannot be read arrives as an empty text — the loader explains it).
 */
export function createFilePicker(parent: HTMLElement, onPick: (file: PickedFile) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again fires `change` again
    if (!file) return;
    file.text().then(
      (text) => onPick({ name: file.name, text }),
      () => onPick({ name: file.name, text: '' }),
    );
  });
  parent.append(input);
  return { open: () => input.click() };
}
