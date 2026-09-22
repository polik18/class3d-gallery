import type { ExhibitionSettings } from '../exhibition/types.ts';
import { exportCommentsCsv, exportEngagementJson } from './export.ts';
import type { EngagementController } from './controller.ts';

interface EngagementViewOptions {
  dialog: HTMLDialogElement;
  controller: EngagementController;
  getVisitorId(): string;
  startNewVisitor(): string;
  getSettings(): ExhibitionSettings;
  onChange(assetId?: string): void;
}

function downloadText(fileName: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function mountEngagementView(options: EngagementViewOptions) {
  const { dialog, controller } = options;
  dialog.innerHTML = `
    <div class="engagement-panel">
      <div class="engagement-heading"><div><p>LOCAL VISITOR BOOK</p><h2 data-role="title">作品互動</h2></div><button data-action="close" type="button" aria-label="關閉互動視窗">×</button></div>
      <div class="engagement-summary"><button class="like-large" data-action="like" type="button" aria-pressed="false">♡ 0</button><span data-role="comment-count">0 則公開留言</span><button data-action="new-visitor" type="button">下一位訪客</button></div>
      <form class="comment-form"><label>暱稱（選填）<input name="displayName" maxlength="50" /></label><label>留言<textarea name="body" maxlength="500" rows="3" required></textarea></label><button class="primary-button" type="submit">送出留言</button></form>
      <p class="comment-status" data-role="status" aria-live="polite"></p>
      <section><h3>訪客留言</h3><div class="comment-list" data-role="approved"></div></section>
      <section class="moderation-section"><h3>待審留言</h3><div class="comment-list" data-role="pending"></div></section>
      <div class="engagement-tools"><button data-action="json" type="button">匯出 JSON</button><button data-action="csv" type="button">匯出留言 CSV</button><button class="danger-button" data-action="clear" type="button">清除全部互動</button></div>
      <p class="local-only-note">按讚與留言只保存在這台展覽電腦，不會上傳或跨裝置同步。</p>
    </div>
  `;
  const title = dialog.querySelector<HTMLElement>('[data-role="title"]');
  const count = dialog.querySelector<HTMLElement>('[data-role="comment-count"]');
  const status = dialog.querySelector<HTMLElement>('[data-role="status"]');
  const approvedList = dialog.querySelector<HTMLElement>('[data-role="approved"]');
  const pendingList = dialog.querySelector<HTMLElement>('[data-role="pending"]');
  const form = dialog.querySelector<HTMLFormElement>('form');
  const likeButton = dialog.querySelector<HTMLButtonElement>('[data-action="like"]');
  if (!title || !count || !status || !approvedList || !pendingList || !form || !likeButton) throw new Error('互動視窗建立失敗');

  let activeAssetId: string | null = null;

  const commentElement = (assetId: string, comment: ReturnType<EngagementController['getAsset']>['comments'][number], pending: boolean) => {
    const article = document.createElement('article');
    article.className = 'comment-item';
    const heading = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = comment.displayName || '匿名訪客';
    const time = document.createElement('time');
    time.dateTime = new Date(comment.createdAt).toISOString();
    time.textContent = new Date(comment.createdAt).toLocaleString('zh-TW');
    heading.append(name, time);
    const body = document.createElement('p');
    body.textContent = comment.body;
    article.append(heading, body);
    if (pending) {
      const actions = document.createElement('div');
      actions.className = 'comment-actions';
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.textContent = '核准';
      approve.addEventListener('click', () => {
        controller.approveComment(assetId, comment.id);
        options.onChange(assetId);
        render();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '刪除';
      remove.addEventListener('click', () => {
        controller.deleteComment(assetId, comment.id);
        options.onChange(assetId);
        render();
      });
      actions.append(approve, remove);
      article.append(actions);
    }
    return article;
  };

  const render = () => {
    if (!activeAssetId) return;
    const settings = options.getSettings();
    const engagement = controller.getAsset(activeAssetId);
    const approved = engagement.comments.filter((comment) => comment.approved);
    const pending = engagement.comments.filter((comment) => !comment.approved);
    const liked = engagement.likedBy.includes(options.getVisitorId());
    likeButton.textContent = `${liked ? '♥' : '♡'} ${engagement.likedBy.length}`;
    likeButton.setAttribute('aria-pressed', String(liked));
    likeButton.disabled = !settings.engagement.likesEnabled;
    form.hidden = !settings.engagement.commentsEnabled;
    count.textContent = `${approved.length} 則公開留言`;
    approvedList.replaceChildren(...approved.map((comment) => commentElement(activeAssetId as string, comment, false)));
    if (approved.length === 0) approvedList.textContent = '還沒有公開留言。';
    pendingList.replaceChildren(...pending.map((comment) => commentElement(activeAssetId as string, comment, true)));
    if (pending.length === 0) pendingList.textContent = '沒有待審留言。';
  };

  likeButton.addEventListener('click', () => {
    if (!activeAssetId) return;
    controller.toggleLike(activeAssetId, options.getVisitorId());
    options.onChange(activeAssetId);
    render();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!activeAssetId) return;
    const data = new FormData(form);
    try {
      const settings = options.getSettings();
      const comment = controller.addComment({
        exhibitionId: settings.id,
        assetId: activeAssetId,
        displayName: String(data.get('displayName') ?? ''),
        body: String(data.get('body') ?? ''),
        moderate: settings.engagement.commentModeration
      });
      form.reset();
      status.textContent = comment.approved ? '留言已公開。' : '留言已送出，等待教師核准。';
      options.onChange(activeAssetId);
      render();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '留言送出失敗';
    }
  });
  dialog.querySelector('[data-action="close"]')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-action="new-visitor"]')?.addEventListener('click', () => {
    options.startNewVisitor();
    status.textContent = '已開始新的本機訪客 session。';
    render();
  });
  dialog.querySelector('[data-action="json"]')?.addEventListener('click', () => downloadText('class3d-engagement.json', exportEngagementJson(controller.getAll()), 'application/json'));
  dialog.querySelector('[data-action="csv"]')?.addEventListener('click', () => downloadText('class3d-comments.csv', exportCommentsCsv(controller.getAll()), 'text/csv;charset=utf-8'));
  dialog.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
    if (!window.confirm('確定清除這台電腦上的全部按讚與留言？此動作無法復原。')) return;
    controller.clearAll();
    status.textContent = '全部本機互動已清除。';
    options.onChange();
    render();
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  return {
    open(assetId: string, assetTitle: string) {
      activeAssetId = assetId;
      title.textContent = assetTitle;
      status.textContent = '';
      render();
      dialog.showModal();
    },
    refresh: render
  };
}
