export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export class ObjectUrlPool {
  private readonly urls = new Set<string>();
  private readonly api: ObjectUrlApi;
  constructor(api: ObjectUrlApi = URL) {
    this.api = api;
  }
  create(blob: Blob) {
    const url = this.api.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }
  revokeAll() {
    this.urls.forEach((url) => this.api.revokeObjectURL(url));
    this.urls.clear();
  }
  get size() { return this.urls.size; }
}
