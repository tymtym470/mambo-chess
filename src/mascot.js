/**
 * 素材基础路径。
 *
 * Vite 的 `base` 只重写它自己生成的引用（index.html、打包后的 JS/CSS），
 * 手写在代码里的 `/mambo/...` 这类绝对路径它管不到 —— 部署到子目录
 * （例如 GitHub Pages 项目站 /mambo-chess/）时会直接 404。
 *
 * `import.meta.env.BASE_URL` 由 Vite 注入：
 *   开发与本地服务 → '/'
 *   构建时 base: './' → './'
 * 这里统一规范成「带结尾斜杠的前缀」，两种取值都能拼出正确地址：
 *   './'  → './mambo/mambo-01.png'      （相对当前页面，子目录下正确）
 *   '/'   → '/mambo/mambo-01.png'
 *
 * 非 Vite 环境（例如被 Node 直接 import 跑测试）没有 import.meta.env，
 * 此时退回 '/'，行为与本地服务一致。
 */
export const ASSET_BASE = (() => {
  const raw = import.meta.env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : raw + '/';
})();

/** 把素材相对路径拼成可用的 URL。 */
export const assetUrl = (relativePath) => ASSET_BASE + relativePath.replace(/^\/+/, '');

// User-provided local meme assets. The app does not generate or redraw the character.
export const MAMBO_CAT_VARIANTS = {
  open: assetUrl('mambo/mambo-01.png'),
  think: assetUrl('mambo/mambo-02.png'),
  idle: assetUrl('mambo/mambo-03.png'),
  avatar: assetUrl('mambo/mambo-04.png'),
  laugh: assetUrl('mambo/mambo-05.png'),
  comfort: assetUrl('mambo/mambo-06.png'),
  lose: assetUrl('mambo/mambo-07.png'),
  capture: assetUrl('mambo/mambo-08.png'),
  taunt: assetUrl('mambo/mambo-09.png'),
  move: assetUrl('mambo/mambo-10.png'),
  angry: assetUrl('mambo/mambo-11.png'),
  check: assetUrl('mambo/mambo-12.png'),
  dance: assetUrl('mambo/mambo-13.png'),
  draw: assetUrl('mambo/mambo-14.png'),
  local: assetUrl('mambo/mambo-03.png'),
};
export const MAMBO_CAT_URL = MAMBO_CAT_VARIANTS.local;
export const MAMBO_CAT_FALLBACK_URL = assetUrl('mambo-icon.svg');
export const MAMBO_CAT_SOURCE = '用户提供的哈基米猫原图素材';
