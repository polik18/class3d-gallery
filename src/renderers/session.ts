import type { MountedRenderer, RendererFactory } from './types.ts';

export class RendererSession {
  private active: MountedRenderer | null = null;
  private generation = 0;
  private focused = true;
  async show(factory: RendererFactory) {
    const requestId = ++this.generation;
    this.active?.destroy();
    this.active = null;
    const renderer = await factory();
    if (requestId !== this.generation) {
      renderer.destroy();
      return false;
    }
    this.active = renderer;
    if (!this.focused) renderer.pause();
    return true;
  }
  setFocused(focused: boolean) {
    if (this.focused === focused) return;
    this.focused = focused;
    if (focused) this.active?.resume();
    else this.active?.pause();
  }
  clear() {
    this.generation += 1;
    this.active?.destroy();
    this.active = null;
  }
}
