import { useEffect, useRef } from "react";
import { Heart, Radio } from "lucide-react";

export default function ChannelList({
  channels,
  selected,
  favorites,
  onSelect,
  onFavorite,
  focusedIndex,
  setFocusedIndex
}) {
  const refs = useRef([]);

  useEffect(() => {
    refs.current = refs.current.slice(0, channels.length);
  }, [channels.length]);

  useEffect(() => {
    if (focusedIndex >= 0 && refs.current[focusedIndex]) {
      refs.current[focusedIndex].focus({ preventScroll: true });
    }
  }, [focusedIndex]);

  function moveSpatially(index, direction) {
    const current = refs.current[index];
    if (!current) return;

    const currentRect = current.getBoundingClientRect();
    const cx = currentRect.left + currentRect.width / 2;
    const cy = currentRect.top + currentRect.height / 2;

    const candidates = refs.current
      .map((el, i) => {
        if (!el || i === index) return null;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const dx = x - cx;
        const dy = y - cy;

        if (direction === "left" && dx >= -5) return null;
        if (direction === "right" && dx <= 5) return null;
        if (direction === "up" && dy >= -5) return null;
        if (direction === "down" && dy <= 5) return null;

        const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
        const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);

        return { i, score: primary + secondary * 1.8 };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);

    if (candidates[0]) {
      setFocusedIndex(candidates[0].i);
    }
  }

  function handleKeyDown(event, index) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveSpatially(index, event.key.replace("Arrow", "").toLowerCase());
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(channels[index]);
    }
  }

  return (
    <div className="channel-list" role="grid" aria-label="Canais">
      {channels.map((channel, index) => {
        const active = selected?.id === channel.id;
        const favorite = favorites.has(channel.id);

        return (
          <button
            ref={el => (refs.current[index] = el)}
            key={channel.id}
            className={`channel ${active ? "active" : ""}`}
            tabIndex={focusedIndex === index ? 0 : -1}
            onFocus={() => setFocusedIndex(index)}
            onClick={() => onSelect(channel)}
            onKeyDown={e => handleKeyDown(e, index)}
            aria-label={`Canal ${channel.name}`}
          >
            <div className="channel-logo">
              {channel.logo ? (
                <img src={channel.logo} alt="" loading="lazy" />
              ) : (
                <Radio size={18} /> 
              )}
            </div>

            <div className="channel-info">
              <strong>{channel.name}</strong>
              <small>{channel.group}</small>
            </div>

            <span
              className={`favorite ${favorite ? "on" : ""}`}
              onClick={e => {
                e.stopPropagation();
                onFavorite(channel);
              }}
              onKeyDown={e => e.stopPropagation()}
              title="Favorito"
              role="button"
              tabIndex={-1}
            >
              <Heart size={17} fill={favorite ? "currentColor" : "none"} />
            </span>
          </button>
        );
      })}

      {!channels.length && (
        <div className="empty-list">Nenhum canal encontrado.</div>
      )}
    </div>
  );
}