import test from 'node:test';
import assert from 'node:assert/strict';
import { trackingMetricPresentation } from '../src/ui/tracking-metric-presentation.ts';

const networks = [
  'facebook',
  'threads',
  'instagram',
  'x',
  'shopee',
  'zalo',
  'youtube',
  'telegram',
  'tiktok',
];
const expectedLabels = [
  ['Người theo dõi', 'Lượt thích', 'Bình luận', 'Chia sẻ', 'Lượt xem', 'Tiếp cận'],
  ['Followers', 'Lượt thích', 'Trả lời', 'Repost', 'Lượt xem'],
  ['Followers', 'Lượt thích', 'Bình luận', 'Chia sẻ', 'Lưu bài', 'Tiếp cận'],
  ['Followers', 'Lượt thích', 'Trả lời', 'Repost', 'Impressions'],
  ['Followers shop', 'Lượt xem sản phẩm', 'Yêu thích', 'Lượt thích'],
  ['Quan tâm / theo dõi', 'Lượt xem', 'Quan tâm', 'Chia sẻ', 'Bình luận'],
  ['Người đăng ký', 'Lượt xem', 'Lượt thích', 'Bình luận', 'Chia sẻ', 'Giờ xem'],
  ['Thành viên', 'Lượt xem', 'Reaction', 'Forward', 'Bình luận'],
  ['Followers', 'Lượt thích', 'Lượt xem video', 'Bình luận', 'Chia sẻ'],
];

test('the exact nine catalogs retain planned labels and never claim source availability', () => {
  for (const [i, network] of networks.entries()) {
    const result = trackingMetricPresentation(network);
    assert.equal(result.availability, 'UNAVAILABLE');
    assert.equal(
      result.reason,
      i === 0 ? 'NO_ADMITTED_PERMITTED_SOURCE' : 'NETWORK_IMPLEMENTATION_DEFERRED',
    );
    assert.deepEqual(
      result.metrics.map((metric) => metric.label),
      expectedLabels[i],
    );
    assert.equal(new Set(result.metrics.map((metric) => metric.key)).size, result.metrics.length);
    assert.match(result.catalogNotice, /Nhãn hiển thị dự kiến/);
    assert.match(result.catalogNotice, /chưa phải định nghĩa chỉ số được hỗ trợ/);
    assert.equal(trackingMetricPresentation(network), result);
  }
  assert.match(
    trackingMetricPresentation('facebook').detail,
    /Ứng dụng chưa có nguồn chỉ số Facebook/,
  );
  for (const network of networks.slice(1))
    assert.match(trackingMetricPresentation(network).detail, /hoãn triển khai/);
});

test('all result and nested label objects are immutable without source, identity or value fields', () => {
  for (const network of [...networks, null]) {
    const result = trackingMetricPresentation(network);
    assert.deepEqual(
      Object.keys(result).sort(),
      [
        'availability',
        'catalogNotice',
        'detail',
        'growthDetail',
        'metrics',
        'reason',
        'recommendationDetail',
      ].sort(),
    );
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.metrics));
    assert.throws(() => {
      result.availability = 'READY';
    }, TypeError);
    assert.throws(() => result.metrics.push({ key: 'invented', label: 'Invented' }), TypeError);
    for (const metric of result.metrics) {
      assert.ok(Object.isFrozen(metric));
      assert.deepEqual(Object.keys(metric), ['key', 'label']);
      assert.throws(() => {
        metric.label = 'Changed';
      }, TypeError);
      assert.equal(typeof metric.key, 'string');
      assert.equal(typeof metric.label, 'string');
    }
    assert.equal(trackingMetricPresentation(network), result);
  }
});

test('unknown and hostile inputs use one empty fallback without property access or coercion', () => {
  let calls = 0;
  const trap = () => {
    calls++;
    throw Error('MUST_NOT_INSPECT');
  };
  const proxy = new Proxy(
    {},
    {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap,
    },
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = Object.defineProperties(
    {},
    {
      toString: { get: trap },
      valueOf: { get: trap },
      [Symbol.toPrimitive]: { get: trap },
    },
  );
  const fallback = trackingMetricPresentation(null);
  for (const value of [
    undefined,
    null,
    true,
    false,
    0,
    1,
    NaN,
    Infinity,
    1n,
    Symbol('facebook'),
    '',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'Facebook',
    'FACEBOOK',
    'facebook ',
    ' facebook',
    'facebook\0',
    'https://facebook.com',
    'youtube\n',
    new String('facebook'),
    ['facebook'],
    { network: 'facebook' },
    () => 'facebook',
    proxy,
    revoked.proxy,
    hostile,
  ])
    assert.equal(trackingMetricPresentation(value), fallback);
  assert.equal(calls, 0);
  assert.equal(fallback.availability, 'UNAVAILABLE');
  assert.equal(fallback.reason, 'UNKNOWN_NETWORK');
  assert.deepEqual(fallback.metrics, []);
  assert.ok(Object.isFrozen(fallback));
});

test('growth and recommendation use distinct explanatory prerequisites, never observations or formulas', () => {
  const values = [...networks, null].map(trackingMetricPresentation);
  for (const result of values) {
    assert.match(result.growthDetail, /snapshot/);
    assert.match(result.growthDetail, /so sánh/);
    assert.match(result.recommendationDetail, /nguồn phân phối được phép/);
    assert.match(result.recommendationDetail, /định nghĩa đã duyệt/);
    assert.match(result.recommendationDetail, /Like\/follow đơn lẻ không đủ/);
    assert.notEqual(result.growthDetail, result.recommendationDetail);
    assert.doesNotMatch(result.growthDetail + result.recommendationDetail, /\d|%/);
  }
});

test('repeated cross-network selection cannot inherit or mutate another presentation', () => {
  const facebook = trackingMetricPresentation('facebook');
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const network of networks.slice(1)) {
      const other = trackingMetricPresentation(network);
      assert.notEqual(other, facebook);
      assert.notEqual(other.metrics, facebook.metrics);
      assert.equal(other.availability, 'UNAVAILABLE');
      assert.equal(other.reason, 'NETWORK_IMPLEMENTATION_DEFERRED');
    }
    assert.equal(trackingMetricPresentation('facebook'), facebook);
    assert.equal(facebook.reason, 'NO_ADMITTED_PERMITTED_SOURCE');
  }
});
