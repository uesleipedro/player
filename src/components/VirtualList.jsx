import { useEffect, useMemo, useRef, useState } from 'react';

const ROW_HEIGHT = 58;
const OVERSCAN = 8;

export default function VirtualList({ items, renderItem, onEndReached, focusedIndex = 0, className = '' }) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(500);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleCount = Math.ceil(height / ROW_HEIGHT) + OVERSCAN * 2;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(items.length, start + visibleCount);
  const visible = useMemo(() => items.slice(start, end), [items, start, end]);

  // Mantém o item focado dentro da área renderizada/visível da lista virtual.
  // Isso é importante para navegação por teclado/controle remoto.
  useEffect(() => {
    const el = ref.current;
    if (!el || !items.length) return;

    const top = Math.max(0, focusedIndex) * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;

    if (top < el.scrollTop) {
      el.scrollTop = top;
    } else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight;
    }
  }, [focusedIndex, items.length, height]);

  function handleScroll(e) {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    if (onEndReached && el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) onEndReached();
  }

  return (
    <div ref={ref} className={`virtual-list ${className}`} onScroll={handleScroll}>
      <div style={{ height: items.length * ROW_HEIGHT, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: start * ROW_HEIGHT }}>
          {visible.map((item, index) => renderItem(item, start + index))}
        </div>
      </div>
    </div>
  );
}
