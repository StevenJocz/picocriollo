// Estado del canal en vivo (SSE) en el navegador: con el canal conectado, el sondeo pasa a ser solo un respaldo lento.
let connected = false;
export const isLive = () => connected;
export const setLive = (value: boolean) => { connected = value; };
