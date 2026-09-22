import type { AssetRecord, AssetSort } from '../assets/types.ts';

const textCollator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });

export function popularityScore(asset: AssetRecord) {
  const popularity = asset.popularity;
  return popularity.likes * 5
    + popularity.approvedComments * 3
    + popularity.humanViews
    + popularity.interactions
    + Math.min(popularity.dwellTimeMs / 10_000, 100);
}

function numberRank(asset: AssetRecord, sort: AssetSort) {
  const typeRank = !sort.numberType || asset.numberType === sort.numberType ? 0 : 1;
  return [typeRank, asset.displayNumber ?? Number.POSITIVE_INFINITY] as const;
}

function compareAscending(left: AssetRecord, right: AssetRecord, sort: AssetSort) {
  switch (sort.key) {
    case 'number': {
      const [leftType, leftNumber] = numberRank(left, sort);
      const [rightType, rightNumber] = numberRank(right, sort);
      return leftType - rightType || leftNumber - rightNumber;
    }
    case 'category':
      return textCollator.compare(left.category, right.category) || textCollator.compare(left.title, right.title);
    case 'importedAt':
      return left.importedAt - right.importedAt;
    case 'popularity':
      return popularityScore(left) - popularityScore(right);
    case 'title':
      return textCollator.compare(left.title, right.title);
    case 'manual':
      return (left.manualOrder ?? Number.POSITIVE_INFINITY) - (right.manualOrder ?? Number.POSITIVE_INFINITY);
  }
}

export function sortAssets(assets: readonly AssetRecord[], sort: AssetSort) {
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      let compared: number;
      if (sort.key === 'number') {
        const [leftType, leftNumber] = numberRank(left.asset, sort);
        const [rightType, rightNumber] = numberRank(right.asset, sort);
        compared = leftType - rightType;
        if (!compared) {
          const leftMissing = !Number.isFinite(leftNumber);
          const rightMissing = !Number.isFinite(rightNumber);
          compared = Number(leftMissing) - Number(rightMissing);
          if (!compared && !leftMissing) compared = (leftNumber - rightNumber) * direction;
        }
      } else if (sort.key === 'manual') {
        const leftMissing = left.asset.manualOrder === undefined;
        const rightMissing = right.asset.manualOrder === undefined;
        compared = Number(leftMissing) - Number(rightMissing);
        if (!compared && !leftMissing) compared = ((left.asset.manualOrder ?? 0) - (right.asset.manualOrder ?? 0)) * direction;
      } else {
        compared = compareAscending(left.asset, right.asset, sort) * direction;
      }
      return compared || left.asset.importOrder - right.asset.importOrder || left.index - right.index;
    })
    .map(({ asset }) => asset);
}
