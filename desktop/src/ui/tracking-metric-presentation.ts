// Planned UI labels only. This is not a metric source or runtime capability registry.
type MetricLabel = Readonly<{ key: string; label: string }>;
export type TrackingMetricPresentation = Readonly<{
  availability: 'UNAVAILABLE';
  reason: 'NO_ADMITTED_PERMITTED_SOURCE' | 'NETWORK_IMPLEMENTATION_DEFERRED' | 'UNKNOWN_NETWORK';
  detail: string;
  catalogNotice: string;
  metrics: readonly MetricLabel[];
  growthDetail: string;
  recommendationDetail: string;
}>;

const catalogNotice = 'Nhãn hiển thị dự kiến · chưa phải định nghĩa chỉ số được hỗ trợ';
const growthDetail =
  'Tăng trưởng chưa khả dụng: chưa có các snapshot chỉ số được nhận và có thể so sánh.';
const recommendationDetail =
  'Đề xuất chưa khả dụng: chưa có nguồn phân phối được phép và định nghĩa đã duyệt. Like/follow đơn lẻ không đủ để kết luận.';
function presentation(
  reason: TrackingMetricPresentation['reason'],
  detail: string,
  labels: readonly (readonly [string, string])[],
): TrackingMetricPresentation {
  return Object.freeze({
    availability: 'UNAVAILABLE',
    reason,
    detail,
    catalogNotice,
    metrics: Object.freeze(labels.map(([key, label]) => Object.freeze({ key, label }))),
    growthDetail,
    recommendationDetail,
  });
}
const deferredDetail =
  'Mạng này đang hoãn triển khai theo phạm vi Facebook trước; chỉ số chưa khả dụng.';
const facebook = presentation(
  'NO_ADMITTED_PERMITTED_SOURCE',
  'Ứng dụng chưa có nguồn chỉ số Facebook được phép và đã được nhận.',
  [
    ['followers', 'Người theo dõi'],
    ['likes', 'Lượt thích'],
    ['comments', 'Bình luận'],
    ['shares', 'Chia sẻ'],
    ['views', 'Lượt xem'],
    ['reach', 'Tiếp cận'],
  ],
);
const threads = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['followers', 'Followers'],
  ['likes', 'Lượt thích'],
  ['replies', 'Trả lời'],
  ['reposts', 'Repost'],
  ['views', 'Lượt xem'],
]);
const instagram = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['followers', 'Followers'],
  ['likes', 'Lượt thích'],
  ['comments', 'Bình luận'],
  ['shares', 'Chia sẻ'],
  ['saves', 'Lưu bài'],
  ['reach', 'Tiếp cận'],
]);
const x = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['followers', 'Followers'],
  ['likes', 'Lượt thích'],
  ['replies', 'Trả lời'],
  ['reposts', 'Repost'],
  ['impressions', 'Impressions'],
]);
const shopee = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['followers', 'Followers shop'],
  ['productViews', 'Lượt xem sản phẩm'],
  ['favorites', 'Yêu thích'],
  ['likes', 'Lượt thích'],
]);
const zalo = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['followers', 'Quan tâm / theo dõi'],
  ['views', 'Lượt xem'],
  ['likes', 'Quan tâm'],
  ['shares', 'Chia sẻ'],
  ['comments', 'Bình luận'],
]);
const youtube = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['subscribers', 'Người đăng ký'],
  ['views', 'Lượt xem'],
  ['likes', 'Lượt thích'],
  ['comments', 'Bình luận'],
  ['shares', 'Chia sẻ'],
  ['watchHours', 'Giờ xem'],
]);
const telegram = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['members', 'Thành viên'],
  ['views', 'Lượt xem'],
  ['reactions', 'Reaction'],
  ['forwards', 'Forward'],
  ['comments', 'Bình luận'],
]);
const tiktok = presentation('NETWORK_IMPLEMENTATION_DEFERRED', deferredDetail, [
  ['followers', 'Followers'],
  ['likes', 'Lượt thích'],
  ['views', 'Lượt xem video'],
  ['comments', 'Bình luận'],
  ['shares', 'Chia sẻ'],
]);
const unknown = presentation(
  'UNKNOWN_NETWORK',
  'Mạng chưa được nhận diện; chỉ số chưa khả dụng.',
  [],
);

// Strict comparisons do not read properties or coerce hostile caller objects.
export function trackingMetricPresentation(network: unknown): TrackingMetricPresentation {
  switch (network) {
    case 'facebook':
      return facebook;
    case 'threads':
      return threads;
    case 'instagram':
      return instagram;
    case 'x':
      return x;
    case 'shopee':
      return shopee;
    case 'zalo':
      return zalo;
    case 'youtube':
      return youtube;
    case 'telegram':
      return telegram;
    case 'tiktok':
      return tiktok;
    default:
      return unknown;
  }
}
