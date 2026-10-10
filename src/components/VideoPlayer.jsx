import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';

import Hls from 'hls.js';

import { AlertCircle, LoaderCircle } from 'lucide-react';

const VideoPlayer = forwardRef(function VideoPlayer(
  { channel, bufferSeconds = 8 },
  ref
) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const watchdogRef = useRef(null);
  const recoveryTimeoutRef = useRef(null);

  const recoveryAttemptsRef = useRef(0);
  const lastTimeRef = useRef(0);
  const stuckSinceRef = useRef(null);

  const destroyedRef = useRef(false);
  const recoveringRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [buffering, setBuffering] = useState(false);

  useImperativeHandle(ref, () => ({
    fullscreen: async () => {
      const video = videoRef.current;

      if (!video) return;

      try {
        if (document.fullscreenElement) {
          return;
        }

        if (video.requestFullscreen) {
          await video.requestFullscreen();
          return;
        }

        if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
          return;
        }

        if (video.webkitRequestFullscreen) {
          await video.webkitRequestFullscreen();
          return;
        }

        console.warn(
          'Fullscreen não suportado neste dispositivo.'
        );
      } catch (error) {
        console.warn(
          'Não foi possível entrar em fullscreen:',
          error
        );
      }
    }
  }));

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !channel?.url) {
      return undefined;
    }

    destroyedRef.current = false;
    recoveringRef.current = false;
    recoveryAttemptsRef.current = 0;
    lastTimeRef.current = 0;
    stuckSinceRef.current = null;

    setLoading(true);
    setBuffering(false);
    setError('');

    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = null;
    }

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (_) { }

      hlsRef.current = null;
    }

    const url = channel.url;

    let cleanupNative = () => { };

    const createHls = () => {
      if (destroyedRef.current) return null;

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,

        backBufferLength: Math.min(
          Math.max(bufferSeconds * 1.5, 10),
          30
        ),

        maxBufferLength: Math.max(bufferSeconds, 12),

        maxMaxBufferLength: Math.min(
          Math.max(bufferSeconds * 2.5, 20),
          45
        ),

        maxBufferSize: 60 * 1000 * 1000,

        startFragPrefetch: false,
        capLevelToPlayerSize: true,
        progressive: true,

        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        manifestLoadingMaxRetryTimeout: 5000,

        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 1000,
        levelLoadingMaxRetryTimeout: 5000,

        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 5000
      });

      return hls;
    };

    const recoverPlayer = (reason = 'unknown') => {
      if (destroyedRef.current) return;
      if (recoveringRef.current) return;

      recoveringRef.current = true;
      recoveryAttemptsRef.current += 1;

      const attempt = recoveryAttemptsRef.current;

      console.log(
        `[VideoPlayer] Tentativa de recuperação ${attempt}. Motivo: ${reason}`
      );

      setBuffering(true);
      setError('');

      const hls = hlsRef.current;

      if (hls && attempt <= 2) {
        console.log('[VideoPlayer] Tentando hls.startLoad()');

        try {
          hls.startLoad();
        } catch (e) {
          console.warn(
            '[VideoPlayer] Erro em startLoad():',
            e
          );
        }

        recoveryTimeoutRef.current = setTimeout(() => {
          recoveringRef.current = false;

          if (destroyedRef.current) return;

          if (
            video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
            video.paused
          ) {
            recoverPlayer('startLoad não recuperou');
          }
        }, 4000);

        return;
      }

      if (hls && attempt <= 4) {
        console.log(
          '[VideoPlayer] Tentando recoverMediaError()'
        );

        try {
          hls.recoverMediaError();
        } catch (e) {
          console.warn(
            '[VideoPlayer] Erro em recoverMediaError():',
            e
          );
        }

        recoveryTimeoutRef.current = setTimeout(() => {
          recoveringRef.current = false;

          if (destroyedRef.current) return;

          if (
            video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
            video.paused
          ) {
            recoverPlayer(
              'recoverMediaError não recuperou'
            );
          }
        }, 5000);

        return;
      }

      console.log(
        '[VideoPlayer] Reinicializando completamente o HLS'
      );

      try {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      } catch (_) { }

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (_) { }

      setTimeout(() => {
        if (destroyedRef.current) return;

        try {
          const newHls = createHls();

          if (!newHls) {
            recoveringRef.current = false;
            return;
          }

          hlsRef.current = newHls;

          newHls.on(
            Hls.Events.MANIFEST_PARSED,
            () => {
              if (destroyedRef.current) return;

              setLoading(false);

              video
                .play()
                .catch(() => { });
            }
          );

          newHls.on(
            Hls.Events.FRAG_BUFFERED,
            () => { }
          );

          newHls.on(
            Hls.Events.ERROR,
            (_, data) => {
              if (destroyedRef.current) return;

              console.warn(
                '[VideoPlayer] HLS error:',
                data
              );

              if (
                data?.details ===
                'bufferStalledError'
              ) {
                setBuffering(true);

                if (!recoveringRef.current) {
                  recoverPlayer(
                    'bufferStalledError'
                  );
                }

                return;
              }

              if (!data?.fatal) {
                return;
              }

              setLoading(false);

              if (
                data.type ===
                Hls.ErrorTypes.NETWORK_ERROR
              ) {
                recoverPlayer(
                  'NETWORK_ERROR'
                );
              } else if (
                data.type ===
                Hls.ErrorTypes.MEDIA_ERROR
              ) {
                recoverPlayer(
                  'MEDIA_ERROR'
                );
              } else {
                recoverPlayer(
                  'ERRO_FATAL'
                );
              }
            }
          );

          newHls.loadSource(url);
          newHls.attachMedia(video);

          recoveringRef.current = false;
        } catch (e) {
          console.error(
            '[VideoPlayer] Falha ao recriar HLS:',
            e
          );

          recoveringRef.current = false;

          setError(
            'Não foi possível recuperar este canal.'
          );
        }
      }, 500);

      setTimeout(() => {
        if (!destroyedRef.current) {
          recoveryAttemptsRef.current = 0;
        }
      }, 10000);
    };

    if (
      Hls.isSupported() &&
      /\.m3u8(?:\?.*)?$/i.test(url)
    ) {
      const hls = createHls();

      hlsRef.current = hls;

      hls.on(
        Hls.Events.MANIFEST_PARSED,
        () => {
          if (destroyedRef.current) return;

          setLoading(false);
          setError('');

          video
            .play()
            .catch(() => { });
        }
      );

      hls.on(
        Hls.Events.FRAG_BUFFERED,
        () => { }
      );

      hls.on(
        Hls.Events.ERROR,
        (_, data) => {
          if (destroyedRef.current) return;

          console.warn(
            '[VideoPlayer] HLS ERROR:',
            data
          );

          if (
            data?.details ===
            'bufferStalledError'
          ) {
            setBuffering(true);

            if (!recoveringRef.current) {
              recoverPlayer(
                'bufferStalledError'
              );
            }

            return;
          }

          if (!data?.fatal) {
            return;
          }

          setLoading(false);

          if (
            data.type ===
            Hls.ErrorTypes.NETWORK_ERROR
          ) {
            recoverPlayer(
              'NETWORK_ERROR'
            );

            return;
          }

          if (
            data.type ===
            Hls.ErrorTypes.MEDIA_ERROR
          ) {
            recoverPlayer(
              'MEDIA_ERROR'
            );

            return;
          }

          recoverPlayer(
            'ERRO_FATAL'
          );
        }
      );

      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
      video.load();

      const onLoaded = () => {
        if (destroyedRef.current) return;

        setLoading(false);
        setError('');

        video
          .play()
          .catch(() => { });
      };

      const onError = () => {
        if (destroyedRef.current) return;

        setLoading(false);
        setBuffering(false);

        setError(
          'Não foi possível reproduzir este canal.'
        );
      };

      video.addEventListener(
        'loadedmetadata',
        onLoaded,
        { once: true }
      );

      video.addEventListener(
        'error',
        onError
      );

      cleanupNative = () => {
        video.removeEventListener(
          'loadedmetadata',
          onLoaded
        );

        video.removeEventListener(
          'error',
          onError
        );
      };
    }

    const onWaiting = () => {
      if (destroyedRef.current) return;

      setBuffering(true);
    };

    const onPlaying = () => {
      if (destroyedRef.current) return;

      setLoading(false);
      setBuffering(false);
      setError('');

      recoveryAttemptsRef.current = 0;
      recoveringRef.current = false;
      stuckSinceRef.current = null;

      lastTimeRef.current = video.currentTime;
    };

    const onCanPlay = () => {
      if (destroyedRef.current) return;

      setLoading(false);
    };

    const onEnded = () => {
      if (destroyedRef.current) return;

      setBuffering(true);

      recoverPlayer('VIDEO_ENDED');
    };

    video.addEventListener(
      'waiting',
      onWaiting
    );

    video.addEventListener(
      'stalled',
      onWaiting
    );

    video.addEventListener(
      'playing',
      onPlaying
    );

    video.addEventListener(
      'canplay',
      onCanPlay
    );

    video.addEventListener(
      'ended',
      onEnded
    );

    watchdogRef.current = setInterval(() => {
      if (destroyedRef.current) return;

      if (
        video.paused ||
        video.ended ||
        video.seeking
      ) {
        stuckSinceRef.current = null;
        return;
      }

      const currentTime = video.currentTime;

      if (
        Math.abs(
          currentTime -
          lastTimeRef.current
        ) < 0.05
      ) {
        if (!stuckSinceRef.current) {
          stuckSinceRef.current =
            Date.now();
        }

        const stuckFor =
          Date.now() -
          stuckSinceRef.current;

        if (
          stuckFor >= 5000 &&
          !recoveringRef.current
        ) {
          console.warn(
            '[VideoPlayer] Watchdog detectou vídeo travado.'
          );

          setBuffering(true);

          recoverPlayer(
            'WATCHDOG'
          );

          stuckSinceRef.current = null;
        }
      } else {
        stuckSinceRef.current = null;

        if (recoveringRef.current) {
          recoveringRef.current = false;
          recoveryAttemptsRef.current = 0;

          setBuffering(false);
          setLoading(false);
        }
      }

      lastTimeRef.current = currentTime;
    }, 2000);

    return () => {
      destroyedRef.current = true;

      cleanupNative();

      video.removeEventListener(
        'waiting',
        onWaiting
      );

      video.removeEventListener(
        'stalled',
        onWaiting
      );

      video.removeEventListener(
        'playing',
        onPlaying
      );

      video.removeEventListener(
        'canplay',
        onCanPlay
      );

      video.removeEventListener(
        'ended',
        onEnded
      );

      if (watchdogRef.current) {
        clearInterval(
          watchdogRef.current
        );

        watchdogRef.current = null;
      }

      if (recoveryTimeoutRef.current) {
        clearTimeout(
          recoveryTimeoutRef.current
        );

        recoveryTimeoutRef.current = null;
      }

      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch (_) { }

        hlsRef.current = null;
      }

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (_) { }

      recoveringRef.current = false;
      stuckSinceRef.current = null;
      recoveryAttemptsRef.current = 0;
    };
  }, [channel?.id, channel?.url]);

  useEffect(() => {
    const hls = hlsRef.current;

    if (!hls) return;

    hls.config.maxBufferLength =
      Math.max(bufferSeconds, 12);

    hls.config.maxMaxBufferLength =
      Math.min(
        Math.max(bufferSeconds * 2.5, 20),
        45
      );

    hls.config.backBufferLength =
      Math.min(
        Math.max(bufferSeconds * 1.5, 10),
        30
      );
  }, [bufferSeconds]);

  if (!channel) {
    return (
      <div className="player-empty">
        Selecione um conteúdo para começar
      </div>
    );
  }

  return (
    <div className="player">
      <video
        ref={videoRef}
        controls
        preload="metadata"
        playsInline
        autoPlay
        poster={channel.logo || undefined}
      />

      {(loading || buffering) && (
        <div className="player-status">
          <LoaderCircle
            className="spin"
            size={28}
          />
          <span>
            {buffering
              ? 'Bufferizando...'
              : 'Carregando...'}
          </span>
        </div>
      )}

      {error && (
        <div className="player-status error">
          <AlertCircle size={28} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
