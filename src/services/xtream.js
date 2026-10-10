function cleanServer(server) {
  return server.replace(/\/+$/, '');
}

async function request(server, username, password, action = '') {
  const base = cleanServer(server);
  const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${action ? `&action=${encodeURIComponent(action)}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  const data = await response.json();
  if (data?.user_info?.auth === 0) throw new Error('Usuário ou senha Xtream inválidos.');
  return data;
}

export const loginXtream = (server, username, password) => request(server, username, password);
export const getXtreamLiveCategories = (server, username, password) => request(server, username, password, 'get_live_categories');
export const getXtreamLiveStreams = (server, username, password) => request(server, username, password, 'get_live_streams');
export const getXtreamVodCategories = (server, username, password) => request(server, username, password, 'get_vod_categories');
export const getXtreamVod = (server, username, password) => request(server, username, password, 'get_vod_streams');
export const getXtreamSeriesCategories = (server, username, password) => request(server, username, password, 'get_series_categories');
export const getXtreamSeries = (server, username, password) => request(server, username, password, 'get_series');
export const getXtreamSeriesInfo = (server, username, password, seriesId) => request(server, username, password, 'get_series_info').then(data => ({ ...data, series_id: seriesId }));

export function xtreamLiveUrl(server, username, password, streamId, extension = 'm3u8') {
  return `${cleanServer(server)}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`;
}
export function xtreamVodUrl(server, username, password, streamId, extension = 'mp4') {
  return `${cleanServer(server)}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`;
}
export function xtreamSeriesUrl(server, username, password, streamId, extension = 'mp4') {
  return `${cleanServer(server)}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`;
}
