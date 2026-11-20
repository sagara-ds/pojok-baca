class CopyText extends HTMLElement {
  connectedCallback() {
    const button = this.querySelector('button');
    const message = this.querySelector('[role="status"]');
    const quote = this.closest('li')?.querySelector('blockquote');
    if (!navigator.clipboard || !button || !message || !quote) return;
    this.hidden = false;
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(quote.textContent?.trim() ?? '');
        message.textContent = 'Kutipan disalin.';
      } catch {
        message.textContent = 'Gagal menyalin. Blok teks untuk menyalin secara manual.';
      }
    };
  }
}

customElements.define('copy-text', CopyText);
