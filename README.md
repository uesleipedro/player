# IPTV React Player — versão otimizada para TV Box

Aplicação React/Vite para navegador de Android TV/TV Box com hardware limitado.

## Principais otimizações

- IndexedDB para persistir a biblioteca sem manter tudo no React state.
- Web Worker para fazer o parsing de playlists M3U fora da thread principal.
- Listas virtualizadas: somente os itens próximos da área visível são renderizados.
- Paginação por categoria para evitar milhares de elementos no DOM.
- Lazy loading e decoding assíncrono das logos.
- Player HLS com buffer configurável e recuperação de erros de rede/mídia.
- Navegação D-pad/teclado com foco visual.
- Suporte a M3U por URL e arquivo.
- Suporte a Xtream Live, VOD e Séries na biblioteca.
- Interface sem scroll global; apenas painéis de conteúdo possuem rolagem.

## Instalação

```bash
npm install
npm run dev
```

Para produção:

```bash
npm run build
npm run preview
```

## Observação

A reprodução depende do suporte do navegador ao formato do stream e da capacidade de decodificação de vídeo do TV Box. A aplicação não faz transcodificação.
