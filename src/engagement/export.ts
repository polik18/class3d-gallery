import type { EngagementDatabase } from './types.ts';

function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportEngagementJson(database: EngagementDatabase) {
  return JSON.stringify(database, null, 2);
}

export function exportCommentsCsv(database: EngagementDatabase) {
  const rows: unknown[][] = [['assetId', 'commentId', 'displayName', 'body', 'approved', 'createdAt']];
  Object.values(database.assets).forEach((engagement) => {
    engagement.comments.forEach((comment) => rows.push([
      engagement.assetId,
      comment.id,
      comment.displayName ?? '',
      comment.body,
      comment.approved,
      new Date(comment.createdAt).toISOString()
    ]));
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
