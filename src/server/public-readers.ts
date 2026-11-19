interface ReaderForPublicList {
  name: string;
  className: string;
  readAt: Date;
}

const relativeTime = new Intl.RelativeTimeFormat('id-ID', { numeric: 'always' });

export function maskName(name: string): string {
  const letters = Array.from(name.trim().normalize('NFC'));
  if (letters.length < 2) return '****';
  if (letters.length === 2) return `${letters[0]}****`;
  return `${letters[0]}****${letters.at(-1)}`;
}

/** Call on the server after selecting active students who allow public visibility. */
export function toPublicReader(reader: ReaderForPublicList, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - reader.readAt.getTime()) / 60_000));
  let readTime = 'Baru saja';
  if (minutes >= 1440) readTime = relativeTime.format(-Math.floor(minutes / 1440), 'day');
  else if (minutes >= 60) readTime = relativeTime.format(-Math.floor(minutes / 60), 'hour');
  else if (minutes > 0) readTime = relativeTime.format(-minutes, 'minute');

  return {
    maskedName: maskName(reader.name),
    className: reader.className,
    readTime,
  };
}
