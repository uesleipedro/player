import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Tv, Search, Settings, Upload, Link, LogIn, Heart, List, X,
  Film, Clapperboard, Radio, LoaderCircle
} from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import VirtualList from './components/VirtualList';
import { loadM3U } from './services/m3u';
import {
  getXtreamLiveCategories, getXtreamLiveStreams,
  getXtreamVodCategories, getXtreamVod,
  getXtreamSeriesCategories, getXtreamSeries,
  loginXtream, xtreamLiveUrl, xtreamVodUrl
} from './services/xtream';
import { replaceLibrary, getCategories, getItems, getItemsByIds, getMeta } from './services/db';

const FAVORITES_KEY = 'iptv-player-favorites';
const XTREAM_KEY = 'iptv-player-xtream';
const BUFFER_KEY = 'iptv-player-buffer';
const DEFAULT_BUFFER = 8;
const PAGE_SIZE = 80;

const TYPES = [
  { id: 'live', label: 'TV ao vivo', icon: Radio },
  { id: 'vod', label: 'Filmes', icon: Film },
  { id: 'series', label: 'Séries', icon: Clapperboard },
  { id: 'favorites', label: 'Favoritos', icon: Heart }
];

function safeJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

export default function App() {
  const [mediaType, setMediaType] = useState('live');
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('Todos');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(() => new Set(safeJson(FAVORITES_KEY, [])));
  const [mode, setMode] = useState('none');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceType, setSourceType] = useState('m3u-url');
  const [m3uUrl, setM3uUrl] = useState('');
  const [xtream, setXtream] = useState(() => safeJson(XTREAM_KEY, { server: '', username: '', password: '' }));
  const [bufferSeconds, setBufferSeconds] = useState(() => {
    const value = Number(localStorage.getItem(BUFFER_KEY));
    return Number.isFinite(value) && value >= 2 && value <= 30 ? value : DEFAULT_BUFFER;
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [focusArea, setFocusArea] = useState('category');
  const [categoryFocus, setCategoryFocus] = useState(0);
  const [itemFocus, setItemFocus] = useState(0);
  const [categoryScroll, setCategoryScroll] = useState(0);
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const sourceInfoRef = useRef(null);

  // Ref usada para controlar o fullscreen do player pelo Enter/OK.
  const playerRef = useRef(null);

  const notify = useCallback((message) => {
    setStatus(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setStatus(''), 2800);
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(BUFFER_KEY, String(bufferSeconds));
  }, [bufferSeconds]);

  useEffect(() => {
    localStorage.setItem(XTREAM_KEY, JSON.stringify(xtream));
  }, [xtream]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await getMeta();
      if (!cancelled && meta?.mode) {
        setMode(meta.mode);
        setSourceLoaded(true);
      }
    })().catch(() => { });
    return () => { cancelled = true; };
  }, []);

  const loadCategories = useCallback(async (type) => {
    if (type === 'favorites') {
      setCategories([]);
      setCategory('Favoritos');
      return;
    }
    const list = await getCategories(type);
    setCategories(list);
    setCategory('Todos');
  }, []);

  const loadPage = useCallback(async ({ reset = false, type = mediaType, group = category, search = query } = {}) => {
    const effectiveType = type === 'favorites' ? 'live' : type;
    const offset = reset ? 0 : items.length;
    if (!reset && !hasMore) return;
    const rows = type === 'favorites'
      ? (await getItemsByIds([...favorites])).filter(item => !search.trim() || `${item.name} ${item.group}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).slice(offset, offset + PAGE_SIZE)
      : await getItems({ type: effectiveType, group: group === 'Todos' ? null : group, search, limit: PAGE_SIZE, offset });

    if (reset) setItems(rows);
    else setItems(prev => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
  }, [mediaType, category, query, items.length, hasMore, favorites]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCategories(mediaType);
        if (!cancelled) {
          setItems([]);
          setHasMore(true);
          setItemFocus(0);
        }
      } catch (error) {
        if (!cancelled) notify(error.message || 'Erro ao carregar categorias.');
      }
    })();
    return () => { cancelled = true; };
  }, [mediaType, loadCategories, notify]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setItems([]);
        setHasMore(true);
        setItemFocus(0);
        const type = mediaType;
        const rows = type === 'favorites'
          ? (await getItemsByIds([...favorites])).filter(item => !query.trim() || `${item.name} ${item.group}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).slice(0, PAGE_SIZE)
          : await getItems({ type, group: category === 'Todos' ? null : category, search: query, limit: PAGE_SIZE, offset: 0 });
        if (!cancelled) {
          setItems(rows);
          setHasMore(rows.length === PAGE_SIZE);
        }
      } catch (error) {
        if (!cancelled) notify(error.message || 'Erro ao carregar conteúdos.');
      }
    })();
    return () => { cancelled = true; };
  }, [mediaType, category, query, favorites, notify]);

  const categoryButtons = useMemo(() => [
    { key: 'Todos', name: 'Todos', count: null },
    ...categories.map(c => ({ key: c.name, name: c.name, count: c.count }))
  ], [categories]);

  const currentTypeLabel = TYPES.find(t => t.id === mediaType)?.label || 'TV ao vivo';

  async function refreshCategories(type = mediaType) {
    await loadCategories(type);
    setItems([]);
    setHasMore(true);
    setItemFocus(0);
  }

  async function handleM3UUrl() {
    if (!m3uUrl.trim()) return notify('Informe a URL da lista M3U.');
    setLoading(true);
    try {
      const { items: parsed, categories: parsedCategories } = await loadM3U(m3uUrl.trim());
      await replaceLibrary(parsed, parsedCategories, { mode: 'm3u', source: m3uUrl.trim(), updatedAt: Date.now() });
      setMode('m3u');
      setSourceLoaded(true);
      setSourceOpen(false);
      await refreshCategories('live');
      notify(`${parsed.length.toLocaleString('pt-BR')} itens carregados.`);
    } catch (error) {
      notify(error.message || 'Falha ao carregar M3U.');
    } finally {
      setLoading(false);
    }
  }

  async function handleM3UFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const { items: parsed, categories: parsedCategories } = await (await import('./services/m3u')).parseM3U(text);
      await replaceLibrary(parsed, parsedCategories, { mode: 'm3u', source: file.name, updatedAt: Date.now() });
      setMode('m3u');
      setSourceLoaded(true);
      setSourceOpen(false);
      await refreshCategories('live');
      notify(`${parsed.length.toLocaleString('pt-BR')} itens carregados.`);
    } catch (error) {
      notify(error.message || 'Falha ao processar M3U.');
    } finally {
      setLoading(false);
    }
  }

  async function handleXtream() {
    if (!xtream.server || !xtream.username || !xtream.password) return notify('Preencha servidor, usuário e senha.');
    setLoading(true);
    try {
      await loginXtream(xtream.server, xtream.username, xtream.password);
      const results = await Promise.allSettled([
        getXtreamLiveCategories(xtream.server, xtream.username, xtream.password),
        getXtreamLiveStreams(xtream.server, xtream.username, xtream.password),
        getXtreamVodCategories(xtream.server, xtream.username, xtream.password),
        getXtreamVod(xtream.server, xtream.username, xtream.password),
        getXtreamSeriesCategories(xtream.server, xtream.username, xtream.password),
        getXtreamSeries(xtream.server, xtream.username, xtream.password)
      ]);
      const value = index => results[index].status === 'fulfilled' ? results[index].value : [];
      const [liveCats, live, vodCats, vod, seriesCats, series] = [0, 1, 2, 3, 4, 5].map(value);

      const liveMap = Object.fromEntries((liveCats || []).map(c => [String(c.category_id), c.category_name]));
      const vodMap = Object.fromEntries((vodCats || []).map(c => [String(c.category_id), c.category_name]));
      const seriesMap = Object.fromEntries((seriesCats || []).map(c => [String(c.category_id), c.category_name]));

      const normalized = [
        ...(live || []).map(x => ({ id: `live-${x.stream_id}`, type: 'live', name: x.name || 'Sem nome', url: xtreamLiveUrl(xtream.server, xtream.username, xtream.password, x.stream_id, x.container_extension || 'm3u8'), logo: x.stream_icon || '', group: liveMap[String(x.category_id)] || 'Sem categoria' })),
        ...(vod || []).map(x => ({ id: `vod-${x.stream_id}`, type: 'vod', name: x.name || 'Sem nome', url: xtreamVodUrl(xtream.server, xtream.username, xtream.password, x.stream_id, x.container_extension || 'mp4'), logo: x.stream_icon || '', group: vodMap[String(x.category_id)] || 'Sem categoria' })),
        ...(series || []).map(x => ({ id: `series-${x.series_id}`, type: 'series', name: x.name || 'Sem nome', url: '', logo: x.cover || x.cover_big || '', group: seriesMap[String(x.category_id)] || 'Sem categoria', seriesId: x.series_id }))
      ];

      const grouped = new Map();
      for (const item of normalized) {
        const key = `${item.type}::${item.group}`;
        grouped.set(key, { key, type: item.type, name: item.group, count: (grouped.get(key)?.count || 0) + 1 });
      }

      await replaceLibrary(normalized, [...grouped.values()], { mode: 'xtream', source: xtream.server, updatedAt: Date.now() });
      setMode('xtream');
      setSourceLoaded(true);
      setSourceOpen(false);
      await refreshCategories('live');
      notify(`${normalized.length.toLocaleString('pt-BR')} itens carregados.`);
    } catch (error) {
      notify(error.message || 'Falha ao conectar ao Xtream.');
    } finally {
      setLoading(false);
    }
  }

  function toggleFavorite(item) {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
  }

  function selectItem(item) {
    if (item.type === 'series') {
      notify('Série selecionada. O próximo passo pode abrir temporadas e episódios sob demanda.');
      return;
    }
    setSelected(item);
  }

  function moveCategory(direction) {
    const next = direction === 'down' ? Math.min(categoryFocus + 1, categoryButtons.length - 1) : Math.max(categoryFocus - 1, 0);
    setCategoryFocus(next);
    document.querySelectorAll('.category-item')[next]?.focus({ preventScroll: false });
  }

  function moveType(direction) {
    const currentIndex = TYPES.findIndex(x => x.id === mediaType);
    const next = direction === 'down'
      ? Math.min(TYPES.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);

    setMediaType(TYPES[next].id);
    setFocusArea('type');

    requestAnimationFrame(() => {
      document.querySelectorAll('.type-item')[next]?.focus({ preventScroll: false });
    });
  }

  useEffect(() => {
    function onKeyDown(event) {
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if (typing) return;
      if (settingsOpen || sourceOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        setFocusArea('category');
        document.querySelector('.category-item.selected')?.focus({ preventScroll: false });
        return;
      }

      // Os itens de conteúdo possuem navegação própria para cima/baixo/esquerda
      // e Enter/OK. Não deixe o handler global processar a mesma tecla novamente.
      if (active?.classList?.contains('content-item')) return;

      if (event.key === 'ArrowLeft' && focusArea === 'content') {
        event.preventDefault();
        setFocusArea('category');
        document.querySelector('.category-item.selected')?.focus({ preventScroll: false });
      } else if (event.key === 'ArrowRight' && focusArea === 'category') {
        event.preventDefault();
        setFocusArea('content');
        document.querySelector(`[data-content-index="${itemFocus}"]`)?.focus({ preventScroll: false });
      } else if (event.key === 'ArrowLeft' && focusArea === 'category') {
        event.preventDefault();
        setFocusArea('type');
        document.querySelectorAll('.type-item')[TYPES.findIndex(x => x.id === mediaType)]?.focus({ preventScroll: false });
      } else if (event.key === 'ArrowRight' && focusArea === 'type') {
        event.preventDefault();
        setFocusArea('category');
        document.querySelector('.category-item.selected')?.focus({ preventScroll: false });
      } else if (event.key === 'ArrowUp' && focusArea === 'category') {
        event.preventDefault();
        moveCategory('up');
      } else if (event.key === 'ArrowDown' && focusArea === 'category') {
        event.preventDefault();
        moveCategory('down');
      } else if (event.key === 'ArrowUp' && focusArea === 'type') {
        event.preventDefault();
        moveType('up');
      } else if (event.key === 'ArrowDown' && focusArea === 'type') {
        event.preventDefault();
        moveType('down');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusArea, categoryFocus, mediaType, itemFocus, settingsOpen, sourceOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><Tv size={21} /><span>IPTV <b>Player</b></span></div>
        <div className="top-actions">
          <span className="source-badge">{mode === 'xtream' ? 'Xtream' : mode === 'm3u' ? 'M3U' : 'Sem lista'}</span>
          <button onClick={() => setSettingsOpen(true)} aria-label="Configurações"><Settings size={18} /></button>
          <button onClick={() => setSourceOpen(true)} aria-label="Adicionar lista"><Link size={18} /><span>Lista</span></button>
        </div>
      </header>

      <main className="tv-shell">
        <aside className="type-pane">
          <div className="pane-title">BIBLIOTECA</div>
          <div className="type-scroll">
            {TYPES.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`type-item ${mediaType === id ? 'selected' : ''}`} onFocus={() => setFocusArea('type')} onClick={() => setMediaType(id)}>
                <Icon size={17} fill={id === 'favorites' && mediaType === id ? 'currentColor' : 'none'} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </aside>

        <aside className="content-pane">
          <div className="category-header"><div><small>{currentTypeLabel}</small><strong>Categorias</strong></div></div>
          <div className="search compact-search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar..." /></div>
          <div className="category-scroll">
            <button className={`category-item ${category === 'Todos' ? 'selected' : ''}`} onFocus={() => { setFocusArea('category'); setCategoryFocus(0); }} onClick={() => setCategory('Todos')}>
              <List size={16} /><span>Todos</span>
            </button>
            {categoryButtons.slice(1).map((item, index) => (
              <button key={item.key} className={`category-item ${category === item.key ? 'selected' : ''}`} onFocus={() => { setFocusArea('category'); setCategoryFocus(index + 1); }} onClick={() => setCategory(item.key)}>
                <List size={16} /><span>{item.name}</span><small>{item.count}</small>
              </button>
            ))}
            {!categoryButtons.length && <div className="empty">Nenhuma categoria.</div>}
          </div>
        </aside>

        <section className="content-pane">
          <div className="content-header"><div><small>{category}</small><h2>{currentTypeLabel}</h2></div><span>{items.length}{hasMore ? '+' : ''}</span></div>
          <VirtualList
            items={items}
            focusedIndex={itemFocus}
            onEndReached={async () => {
              if (!hasMore) return;
              const rows = mediaType === 'favorites'
                ? (await getItemsByIds([...favorites])).filter(item => !query.trim() || `${item.name} ${item.group}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).slice(items.length, items.length + PAGE_SIZE)
                : await getItems({ type: mediaType, group: category === 'Todos' ? null : category, search: query, limit: PAGE_SIZE, offset: items.length });
              setItems(prev => [...prev, ...rows]);
              setHasMore(rows.length === PAGE_SIZE);
            }}
            renderItem={(item, index) => (
              <button
                key={item.id}
                data-content-index={index}
                className={`content-item ${selected?.id === item.id ? 'active' : ''}`}
                tabIndex={itemFocus === index ? 0 : -1}
                onFocus={() => { setItemFocus(index); setFocusArea('content'); }}
                onClick={() => selectItem(item)}
                onKeyDown={e => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                    setFocusArea('category');
                    document.querySelector('.category-item.selected')?.focus({ preventScroll: false });
                    return;
                  }

                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();

                    const nextIndex = e.key === 'ArrowDown'
                      ? Math.min(index + 1, items.length - 1)
                      : Math.max(index - 1, 0);

                    setItemFocus(nextIndex);

                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        document
                          .querySelector(`[data-content-index="${nextIndex}"]`)
                          ?.focus({ preventScroll: false });
                      });
                    });
                    return;
                  }

                  // Enter/OK: se o canal já estiver reproduzindo, entra em fullscreen.
                  // Caso contrário, mantém o comportamento original de selecionar o canal.
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();

                    if (selected?.id === item.id) {
                      playerRef.current?.fullscreen();
                    } else {
                      selectItem(item);
                    }
                  }
                }}
              >
                <span className="content-poster">{item.logo ? <img src={item.logo} alt="" loading="lazy" decoding="async" /> : <Tv size={19} />}</span>
                <span className="content-name"><span>{item.name}</span><small>{item.group}</small></span>
                <span className={`inline-favorite ${favorites.has(item.id) ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggleFavorite(item); }} role="button" tabIndex={-1} aria-label="Favorito"><Heart size={14} fill={favorites.has(item.id) ? 'currentColor' : 'none'} /></span>
              </button>
            )}
          />
          {!items.length && <div className="empty">Nenhum conteúdo encontrado.</div>}
        </section>

        <section className="player-pane">
          <div className="player-stage">
            <VideoPlayer
              ref={playerRef}
              channel={selected}
              bufferSeconds={bufferSeconds}
            />
          </div>
          <div className="player-info">
            <div className="player-title"><small>REPRODUZINDO AGORA</small><h1>{selected?.name || 'Nenhum conteúdo selecionado'}</h1></div>
            {selected && <button className="favorite-player" onClick={() => toggleFavorite(selected)} aria-label="Favorito"><Heart size={18} fill={favorites.has(selected.id) ? 'currentColor' : 'none'} /></button>}
          </div>
        </section>
      </main>

      {loading && <div className="global-loading"><LoaderCircle className="spin" size={34} /><span>Processando lista...</span></div>}
      {status && <div className="toast">{status}</div>}

      {sourceOpen && <div className="modal-backdrop" onClick={() => setSourceOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Adicionar lista</h2><button onClick={() => setSourceOpen(false)}><X size={19} /></button></div>
        <div className="tabs">
          <button className={sourceType === 'm3u-url' ? 'active' : ''} onClick={() => setSourceType('m3u-url')}>M3U URL</button>
          <button className={sourceType === 'm3u-file' ? 'active' : ''} onClick={() => setSourceType('m3u-file')}>Arquivo</button>
          <button className={sourceType === 'xtream' ? 'active' : ''} onClick={() => setSourceType('xtream')}>Xtream</button>
        </div>
        {sourceType === 'm3u-url' && <div className="form"><label>URL da playlist</label><input value={m3uUrl} onChange={e => setM3uUrl(e.target.value)} placeholder="https://servidor/playlist.m3u" /><button className="primary" onClick={handleM3UUrl} disabled={loading}><Link size={17} />Carregar M3U</button></div>}
        {sourceType === 'm3u-file' && <div className="form"><label>Arquivo M3U / M3U8</label><label className="file-picker"><Upload size={22} /><span>Selecionar arquivo</span><input type="file" accept=".m3u,.m3u8,.txt" onChange={handleM3UFile} /></label></div>}
        {sourceType === 'xtream' && <div className="form"><label>Servidor</label><input value={xtream.server} onChange={e => setXtream({ ...xtream, server: e.target.value })} placeholder="http://servidor:8080" /><label>Usuário</label><input value={xtream.username} onChange={e => setXtream({ ...xtream, username: e.target.value })} /><label>Senha</label><input type="password" value={xtream.password} onChange={e => setXtream({ ...xtream, password: e.target.value })} /><button className="primary" onClick={handleXtream} disabled={loading}><LogIn size={17} />Conectar Xtream</button></div>}
      </div></div>}

      {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="modal small" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Configurações</h2><button onClick={() => setSettingsOpen(false)}><X size={19} /></button></div>
        <div className="setting-section"><div className="setting-title-row"><div><strong>Buffer do vídeo</strong><span>Maior = mais tolerância a oscilações.</span></div><strong>{bufferSeconds}s</strong></div><input type="range" min="2" max="30" step="1" value={bufferSeconds} onChange={e => setBufferSeconds(Number(e.target.value))} /><div className="buffer-presets">{[5, 8, 12, 20, 30].map(v => <button key={v} className={bufferSeconds === v ? 'selected' : ''} onClick={() => setBufferSeconds(v)}>{v}s</button>)}</div></div>
        <div className="settings-note">A lista fica armazenada no IndexedDB para abrir sem reprocessar tudo a cada inicialização.</div>
        <button className="danger" onClick={() => { localStorage.removeItem(FAVORITES_KEY); setFavorites(new Set()); notify('Favoritos apagados.'); }}>Limpar favoritos</button>
      </div></div>}
    </div>
  );
}
