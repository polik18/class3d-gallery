export type DisplayMode =
 'gallery' |
 'fullscreen' |
 'presentation';

export function setDisplayMode(mode:DisplayMode){
 document.body.dataset.mode=mode;
}
