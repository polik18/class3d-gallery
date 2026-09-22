import type { PopularityStats } from '../assets/types.ts';
import type { LocalComment } from '../exhibition/types.ts';
import { EngagementStore } from '../storage/engagement.ts';
import { createEmptyEngagement, type AssetEngagement, type EngagementSource } from './types.ts';

export class EngagementController {
  private readonly store: EngagementStore;
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(store = new EngagementStore(), now: () => number = Date.now, uuid: () => string = () => crypto.randomUUID()) {
    this.store = store;
    this.now = now;
    this.uuid = uuid;
  }

  private updateAsset(assetId: string, mutate: (engagement: AssetEngagement) => void) {
    let result: AssetEngagement | undefined;
    this.store.update((database) => {
      const engagement = database.assets[assetId] ?? createEmptyEngagement(assetId, this.now());
      mutate(engagement);
      engagement.updatedAt = this.now();
      database.assets[assetId] = engagement;
      result = engagement;
    });
    return result as AssetEngagement;
  }

  getAsset(assetId: string) {
    return this.store.load().assets[assetId] ?? createEmptyEngagement(assetId, this.now());
  }

  getAll() {
    return this.store.load();
  }

  hasLiked(assetId: string, visitorId: string) {
    return this.getAsset(assetId).likedBy.includes(visitorId);
  }

  toggleLike(assetId: string, visitorId: string) {
    if (!visitorId) throw new Error('缺少本機訪客識別');
    return this.updateAsset(assetId, (engagement) => {
      const index = engagement.likedBy.indexOf(visitorId);
      if (index >= 0) engagement.likedBy.splice(index, 1);
      else engagement.likedBy.push(visitorId);
      engagement.interactions += 1;
    });
  }

  addComment(input: { exhibitionId: string; assetId: string; body: string; displayName?: string; moderate: boolean }) {
    const body = input.body.trim();
    if (!body) throw new Error('留言不可空白');
    if (body.length > 500) throw new Error('留言不可超過 500 字');
    let created: LocalComment | undefined;
    this.updateAsset(input.assetId, (engagement) => {
      created = {
        schema: 'class3d-comment-v1',
        id: this.uuid(),
        exhibitionId: input.exhibitionId,
        assetId: input.assetId,
        displayName: input.displayName?.trim().slice(0, 50) || undefined,
        body,
        approved: !input.moderate,
        createdAt: this.now()
      };
      engagement.comments.push(created);
      engagement.interactions += 1;
    });
    return created as LocalComment;
  }

  approveComment(assetId: string, commentId: string, approved = true) {
    return this.updateAsset(assetId, (engagement) => {
      const comment = engagement.comments.find((item) => item.id === commentId);
      if (!comment) throw new Error('找不到留言');
      comment.approved = approved;
    });
  }

  deleteComment(assetId: string, commentId: string) {
    return this.updateAsset(assetId, (engagement) => {
      const index = engagement.comments.findIndex((item) => item.id === commentId);
      if (index < 0) throw new Error('找不到留言');
      engagement.comments.splice(index, 1);
    });
  }

  recordView(assetId: string, source: EngagementSource) {
    if (source === 'automatic') return this.getAsset(assetId);
    return this.updateAsset(assetId, (engagement) => { engagement.humanViews += 1; });
  }

  recordDwell(assetId: string, durationMs: number, source: EngagementSource) {
    if (source === 'automatic') return this.getAsset(assetId);
    const safeDuration = Math.max(0, Math.min(durationMs, 30 * 60_000));
    return this.updateAsset(assetId, (engagement) => { engagement.dwellTimeMs += safeDuration; });
  }

  popularity(assetId: string): PopularityStats {
    const engagement = this.getAsset(assetId);
    const popularity: PopularityStats = {
      humanViews: engagement.humanViews,
      likes: engagement.likedBy.length,
      approvedComments: engagement.comments.filter((comment) => comment.approved).length,
      interactions: engagement.interactions,
      dwellTimeMs: engagement.dwellTimeMs
    };
    if (popularity.humanViews || popularity.likes || popularity.approvedComments || popularity.interactions || popularity.dwellTimeMs) {
      popularity.lastHumanInteractionAt = engagement.updatedAt;
    }
    return popularity;
  }

  clearAll() {
    this.store.clear();
  }
}
