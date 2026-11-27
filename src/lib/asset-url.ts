import type { MediaKind, StockId } from '@/types/stock';

export const SHUTTERSTOCK_PUBLIC_ORIGIN = 'https://www.shutterstock.com';
export const ADOBE_PUBLIC_ORIGIN = 'https://stock.adobe.com';

export const stockAssetUrl = (
  stock: StockId,
  id: string,
  mediaType: MediaKind
): string => {
  if (!id) return '';
  if (stock === 'adobe') {
    return `${ADOBE_PUBLIC_ORIGIN}/stock-photo/id/${id}`;
  }
  if (stock === 'shutterstock') {
    return mediaType === 'video'
      ? `${SHUTTERSTOCK_PUBLIC_ORIGIN}/video/clip-${id}`
      : `${SHUTTERSTOCK_PUBLIC_ORIGIN}/image/${id}`;
  }
  if (stock === 'istock') {
    return `https://www.istockphoto.com/search/2/image?phrase=${id}`;
  }
  return '';
};
