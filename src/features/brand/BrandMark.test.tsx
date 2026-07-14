import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BRAND_ASSETS, createBrandAssetPath } from './brandAssets';
import { BrandMark } from './BrandMark';

describe('BrandMark', () => {
  it('keeps the logo relative for packaged file URLs and rooted for browser development', () => {
    expect(createBrandAssetPath('./')).toBe('./brand/quantum-design-logo.png');
    expect(createBrandAssetPath('/')).toBe('/brand/quantum-design-logo.png');
  });

  it('renders the configured logo image', () => {
    render(<BrandMark variant="on-light" />);

    const img = screen.getByAltText('Quantum Design');
    expect(img).toHaveAttribute('src', BRAND_ASSETS.logo);
    expect(img).toHaveClass('brand-logo');
  });

  it('shows a neutral placeholder (not a fake logo) when the asset fails to load', () => {
    render(<BrandMark variant="on-light" />);

    fireEvent.error(screen.getByAltText('Quantum Design'));

    // 中性占位，明确标注「占位」，绝不伪装成真实 Logo
    expect(screen.getByLabelText(/品牌标识占位/)).toBeInTheDocument();
    expect(screen.getByText('BRAND LOGO')).toBeInTheDocument();
    expect(screen.queryByAltText('Quantum Design')).not.toBeInTheDocument();
  });
});
