/**
 * 品牌资源统一配置。
 *
 * Logo 由运营人员手动放入 public/brand/logo.png（当前实际文件名）。
 * 代码中只通过这里的常量引用，避免在多个组件里硬编码路径。
 * 详见 README「配置 Quantum Design Logo」一节。
 *
 * 替换 Logo 时：把文件放到该路径即可；若改了文件名，只需同步修改下面的 logo 字段。
 */
export const BRAND_ASSETS = {
  logo: '/brand/logo.png',
} as const;
