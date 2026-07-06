import { useState } from 'react';

import { BRAND_ASSETS } from './brandAssets';

type BrandMarkVariant = 'on-dark' | 'on-light';

type BrandMarkProps = {
  /** 背景色调，仅影响资源缺失时占位框的颜色。 */
  variant?: BrandMarkVariant;
  className?: string;
};

/**
 * Quantum Design 品牌 Logo。
 *
 * 引用 BRAND_ASSETS.logo（public/brand/quantum-design-logo.png，由运营手动放入）。
 * Logo 缺失时显示一个中性占位框，仅用于开发与资源缺失提示，
 * 绝不伪装成真实 Quantum Design Logo。资源放入后 <img> 正常加载即可。
 */
export function BrandMark({ variant = 'on-light', className }: BrandMarkProps) {
  const [missing, setMissing] = useState(false);

  const rootClass = [
    'brand-mark',
    variant === 'on-dark' ? 'brand-mark--on-dark' : 'brand-mark--on-light',
    missing ? 'brand-mark--placeholder' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (missing) {
    return (
      <span className={rootClass} role="img" aria-label="品牌标识占位（待放入 Logo）">
        BRAND LOGO
      </span>
    );
  }

  return (
    <span className={rootClass}>
      <img
        className="brand-logo"
        src={BRAND_ASSETS.logo}
        alt="Quantum Design"
        draggable={false}
        onError={() => setMissing(true)}
      />
    </span>
  );
}
