self.onmessage = ({ data }) => {
  try {
    const { text } = data;
    const lines = text.split(/\r?\n/);
    const items = [];
    const groups = new Map();

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXTINF')) continue;
      const url = (lines[i + 1] || '').trim();
      if (!url || url.startsWith('#')) continue;

      const comma = line.indexOf(',');
      const displayName = comma >= 0 ? line.slice(comma + 1).trim() : 'Sem nome';
      const attrs = {};
      for (const match of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];

      const group = attrs['group-title'] || 'Sem categoria';
      const hint = `${group} ${displayName} ${attrs['tvg-name'] || ''}`.toLocaleLowerCase();
      let type = 'live';
      if (/\b(series|s[eé]rie|tv shows?)\b/.test(hint)) type = 'series';
      else if (/\b(vod|movie|filme|filmes|cinema)\b/.test(hint)) type = 'vod';

      const item = {
        id: `${items.length}-${url}`,
        type,
        name: (attrs['tvg-name'] || displayName || 'Sem nome').trim(),
        url,
        logo: attrs['tvg-logo'] || '',
        group,
        tvgId: attrs['tvg-id'] || '',
        tvgName: attrs['tvg-name'] || ''
      };
      items.push(item);
      const key = `${type}::${group}`;
      groups.set(key, { key, type, name: group, count: (groups.get(key)?.count || 0) + 1 });
    }

    self.postMessage({ ok: true, items, categories: [...groups.values()] });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Erro ao processar M3U' });
  }
};
