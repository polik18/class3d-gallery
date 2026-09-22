import type { NumberType } from './types.ts';

export interface ParsedFileName {
  originalFileName: string;
  displayNumber?: number;
  numberType?: NumberType;
  title: string;
  author?: string;
  description: string;
}

function withoutExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

function cleanDisplayText(value: string) {
  return value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseArtworkFileName(fileName: string): ParsedFileName {
  const baseName = withoutExtension(fileName);
  let remainder = baseName;
  let displayNumber: number | undefined;
  let numberType: NumberType | undefined;

  const seatMatch = remainder.match(/^座號\s*([０-９\d]+)[_\-\s]*/u);
  const numberedMatch = remainder.match(/^(?:no\.?\s*)?([０-９\d]+)[_\-\s]+/iu);
  const prefix = seatMatch ?? numberedMatch;
  if (prefix) {
    const normalizedNumber = prefix[1].replace(/[０-９]/g, (character) => String(character.charCodeAt(0) - 0xff10));
    displayNumber = Number(normalizedNumber);
    numberType = seatMatch ? 'seat' : 'sequence';
    remainder = remainder.slice(prefix[0].length);
  }

  const fields = remainder.split('__').map(cleanDisplayText).filter(Boolean);
  const title = fields[0] || '未命名作品';
  const author = fields[1] || undefined;
  const description = fields.slice(2).join('；') || title;
  return {
    originalFileName: fileName,
    displayNumber,
    numberType,
    title,
    author,
    description
  };
}
