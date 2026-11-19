const pending = new Map<HTMLFormElement, { button: HTMLButtonElement; label: string | null }>();

document.addEventListener('submit', (event) => {
  const { target: form, submitter: button } = event;
  if (event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
  if (pending.has(form)) {
    event.preventDefault();
    return;
  }
  if (!(button instanceof HTMLButtonElement) || !button.dataset.pending) return;
  pending.set(form, { button, label: button.textContent });
  button.setAttribute('aria-disabled', 'true');
  button.textContent = button.dataset.pending;
  form.setAttribute('aria-busy', 'true');
});

window.addEventListener('pageshow', () => {
  for (const [form, { button, label }] of pending) {
    button.textContent = label;
    button.removeAttribute('aria-disabled');
    form.removeAttribute('aria-busy');
  }
  pending.clear();
});
