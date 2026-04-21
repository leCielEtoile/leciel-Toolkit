import { optimize } from 'svgo'

// ─── プラグイン設定型 ─────────────────────────────────────────────

export interface PluginConfig {
  // デフォルト有効プラグイン
  removeDoctype: boolean
  removeXMLProcInst: boolean
  removeComments: boolean
  removeMetadata: boolean
  removeEditorsNSData: boolean
  cleanupAttrs: boolean
  mergeStyles: boolean
  inlineStyles: { enabled: boolean; onlyMatchedOnce: boolean; removeMatchedSelectors: boolean }
  minifyStyles: boolean
  cleanupIds: { enabled: boolean; remove: boolean; minify: boolean }
  removeUselessDefs: boolean
  cleanupNumericValues: { enabled: boolean; floatPrecision: number; leadingZero: boolean; defaultPx: boolean; convertToPx: boolean }
  convertColors: { enabled: boolean; currentColor: boolean; names2hex: boolean; rgb2hex: boolean; shorthex: boolean; shortname: boolean }
  removeUnknownsAndDefaults: { enabled: boolean; unknownContent: boolean; unknownAttrs: boolean; defaultAttrs: boolean; uselessOverrides: boolean; keepDataAttrs: boolean; keepAriaAttrs: boolean }
  removeNonInheritableGroupAttrs: boolean
  removeUselessStrokeAndFill: boolean
  removeHiddenElems: boolean
  removeEmptyText: boolean
  convertShapeToPath: { enabled: boolean; convertArcs: boolean }
  convertEllipseToCircle: boolean
  moveElemsAttrsToGroup: boolean
  moveGroupAttrsToElems: boolean
  collapseGroups: boolean
  convertPathData: { enabled: boolean; floatPrecision: number; transformPrecision: number; applyTransforms: boolean; straightCurves: boolean; convertToZ: boolean; lineShorthands: boolean; curveSmoothShorthands: boolean; removeUseless: boolean; collapseRepeated: boolean; utilizeAbsolute: boolean; negativeExtraSpace: boolean }
  convertTransform: { enabled: boolean; convertToShorts: boolean; floatPrecision: number; transformPrecision: number; matrixToTransform: boolean; shortTranslate: boolean; shortScale: boolean; shortRotate: boolean; removeUseless: boolean; collapseIntoOne: boolean; leadingZero: boolean; negativeExtraSpace: boolean }
  removeEmptyAttrs: boolean
  removeEmptyContainers: boolean
  mergePaths: { enabled: boolean; force: boolean }
  removeUnusedNS: boolean
  sortDefsChildren: boolean
  removeTitle: boolean
  removeDesc: boolean
  // オプショナルプラグイン
  removeViewBox: boolean
  removeDimensions: boolean
  removeXMLNS: boolean
  prefixIds: { enabled: boolean; prefix: string; delim: string; prefixIds: boolean; prefixClassNames: boolean }
  convertStyleToAttrs: { enabled: boolean; keepImportant: boolean }
  cleanupListOfValues: { enabled: boolean; floatPrecision: number; leadingZero: boolean; defaultPx: boolean; convertToPx: boolean }
  sortAttrs: boolean
}

export interface GlobalConfig {
  multipass: boolean
  floatPrecision: number
  pretty: boolean
  indent: number
}

export interface SvgoConfig {
  global: GlobalConfig
  plugins: PluginConfig
}

// ─── デフォルト設定 ───────────────────────────────────────────────

export const defaultConfig: SvgoConfig = {
  global: {
    multipass: false,
    floatPrecision: 3,
    pretty: false,
    indent: 2,
  },
  plugins: {
    // デフォルト有効
    removeDoctype: true,
    removeXMLProcInst: true,
    removeComments: true,
    removeMetadata: true,
    removeEditorsNSData: true,
    cleanupAttrs: true,
    mergeStyles: true,
    inlineStyles: { enabled: true, onlyMatchedOnce: true, removeMatchedSelectors: true },
    minifyStyles: true,
    cleanupIds: { enabled: true, remove: true, minify: true },
    removeUselessDefs: true,
    cleanupNumericValues: { enabled: true, floatPrecision: 3, leadingZero: true, defaultPx: true, convertToPx: true },
    convertColors: { enabled: true, currentColor: false, names2hex: true, rgb2hex: true, shorthex: true, shortname: true },
    removeUnknownsAndDefaults: { enabled: true, unknownContent: true, unknownAttrs: true, defaultAttrs: true, uselessOverrides: true, keepDataAttrs: true, keepAriaAttrs: true },
    removeNonInheritableGroupAttrs: true,
    removeUselessStrokeAndFill: true,
    removeHiddenElems: true,
    removeEmptyText: true,
    convertShapeToPath: { enabled: true, convertArcs: false },
    convertEllipseToCircle: true,
    moveElemsAttrsToGroup: true,
    moveGroupAttrsToElems: true,
    collapseGroups: true,
    convertPathData: { enabled: true, floatPrecision: 3, transformPrecision: 5, applyTransforms: true, straightCurves: true, convertToZ: true, lineShorthands: true, curveSmoothShorthands: true, removeUseless: true, collapseRepeated: true, utilizeAbsolute: true, negativeExtraSpace: true },
    convertTransform: { enabled: true, convertToShorts: true, floatPrecision: 3, transformPrecision: 5, matrixToTransform: true, shortTranslate: true, shortScale: true, shortRotate: true, removeUseless: true, collapseIntoOne: true, leadingZero: true, negativeExtraSpace: true },
    removeEmptyAttrs: true,
    removeEmptyContainers: true,
    mergePaths: { enabled: true, force: false },
    removeUnusedNS: true,
    sortDefsChildren: true,
    removeTitle: false,
    removeDesc: false,
    // オプショナル（デフォルト無効）
    removeViewBox: false,
    removeDimensions: false,
    removeXMLNS: false,
    prefixIds: { enabled: false, prefix: 'svg', delim: '__', prefixIds: true, prefixClassNames: true },
    convertStyleToAttrs: { enabled: false, keepImportant: false },
    cleanupListOfValues: { enabled: false, floatPrecision: 3, leadingZero: true, defaultPx: true, convertToPx: true },
    sortAttrs: false,
  },
}

// ─── SVGO 実行 ────────────────────────────────────────────────────

export function runOptimize(svgString: string, config: SvgoConfig): string {
  const p = config.plugins
  const g = config.global

  const plugins: object[] = []

  const addIf = (enabled: boolean, name: string, params?: Record<string, unknown>) => {
    if (!enabled) return
    plugins.push(params ? { name, params } : name)
  }

  addIf(p.removeDoctype, 'removeDoctype')
  addIf(p.removeXMLProcInst, 'removeXMLProcInst')
  addIf(p.removeComments, 'removeComments')
  addIf(p.removeMetadata, 'removeMetadata')
  addIf(p.removeEditorsNSData, 'removeEditorsNSData')
  addIf(p.cleanupAttrs, 'cleanupAttrs')
  addIf(p.mergeStyles, 'mergeStyles')
  addIf(p.inlineStyles.enabled, 'inlineStyles', {
    onlyMatchedOnce: p.inlineStyles.onlyMatchedOnce,
    removeMatchedSelectors: p.inlineStyles.removeMatchedSelectors,
  })
  addIf(p.minifyStyles, 'minifyStyles')
  addIf(p.cleanupIds.enabled, 'cleanupIds', {
    remove: p.cleanupIds.remove,
    minify: p.cleanupIds.minify,
  })
  addIf(p.removeUselessDefs, 'removeUselessDefs')
  addIf(p.cleanupNumericValues.enabled, 'cleanupNumericValues', {
    floatPrecision: p.cleanupNumericValues.floatPrecision,
    leadingZero: p.cleanupNumericValues.leadingZero,
    defaultPx: p.cleanupNumericValues.defaultPx,
    convertToPx: p.cleanupNumericValues.convertToPx,
  })
  addIf(p.convertColors.enabled, 'convertColors', {
    currentColor: p.convertColors.currentColor,
    names2hex: p.convertColors.names2hex,
    rgb2hex: p.convertColors.rgb2hex,
    shorthex: p.convertColors.shorthex,
    shortname: p.convertColors.shortname,
  })
  addIf(p.removeUnknownsAndDefaults.enabled, 'removeUnknownsAndDefaults', {
    unknownContent: p.removeUnknownsAndDefaults.unknownContent,
    unknownAttrs: p.removeUnknownsAndDefaults.unknownAttrs,
    defaultAttrs: p.removeUnknownsAndDefaults.defaultAttrs,
    uselessOverrides: p.removeUnknownsAndDefaults.uselessOverrides,
    keepDataAttrs: p.removeUnknownsAndDefaults.keepDataAttrs,
    keepAriaAttrs: p.removeUnknownsAndDefaults.keepAriaAttrs,
  })
  addIf(p.removeNonInheritableGroupAttrs, 'removeNonInheritableGroupAttrs')
  addIf(p.removeUselessStrokeAndFill, 'removeUselessStrokeAndFill')
  addIf(p.removeHiddenElems, 'removeHiddenElems')
  addIf(p.removeEmptyText, 'removeEmptyText')
  addIf(p.convertShapeToPath.enabled, 'convertShapeToPath', {
    convertArcs: p.convertShapeToPath.convertArcs,
  })
  addIf(p.convertEllipseToCircle, 'convertEllipseToCircle')
  addIf(p.moveElemsAttrsToGroup, 'moveElemsAttrsToGroup')
  addIf(p.moveGroupAttrsToElems, 'moveGroupAttrsToElems')
  addIf(p.collapseGroups, 'collapseGroups')
  addIf(p.convertPathData.enabled, 'convertPathData', {
    floatPrecision: p.convertPathData.floatPrecision,
    transformPrecision: p.convertPathData.transformPrecision,
    applyTransforms: p.convertPathData.applyTransforms,
    straightCurves: p.convertPathData.straightCurves,
    convertToZ: p.convertPathData.convertToZ,
    lineShorthands: p.convertPathData.lineShorthands,
    curveSmoothShorthands: p.convertPathData.curveSmoothShorthands,
    removeUseless: p.convertPathData.removeUseless,
    collapseRepeated: p.convertPathData.collapseRepeated,
    utilizeAbsolute: p.convertPathData.utilizeAbsolute,
    negativeExtraSpace: p.convertPathData.negativeExtraSpace,
  })
  addIf(p.convertTransform.enabled, 'convertTransform', {
    convertToShorts: p.convertTransform.convertToShorts,
    floatPrecision: p.convertTransform.floatPrecision,
    transformPrecision: p.convertTransform.transformPrecision,
    matrixToTransform: p.convertTransform.matrixToTransform,
    shortTranslate: p.convertTransform.shortTranslate,
    shortScale: p.convertTransform.shortScale,
    shortRotate: p.convertTransform.shortRotate,
    removeUseless: p.convertTransform.removeUseless,
    collapseIntoOne: p.convertTransform.collapseIntoOne,
    leadingZero: p.convertTransform.leadingZero,
    negativeExtraSpace: p.convertTransform.negativeExtraSpace,
  })
  addIf(p.removeEmptyAttrs, 'removeEmptyAttrs')
  addIf(p.removeEmptyContainers, 'removeEmptyContainers')
  addIf(p.mergePaths.enabled, 'mergePaths', { force: p.mergePaths.force })
  addIf(p.removeUnusedNS, 'removeUnusedNS')
  addIf(p.sortDefsChildren, 'sortDefsChildren')
  addIf(p.removeTitle, 'removeTitle')
  addIf(p.removeDesc, 'removeDesc')
  addIf(p.removeViewBox, 'removeViewBox')
  addIf(p.removeDimensions, 'removeDimensions')
  addIf(p.removeXMLNS, 'removeXMLNS')
  addIf(p.prefixIds.enabled, 'prefixIds', {
    prefix: p.prefixIds.prefix,
    delim: p.prefixIds.delim,
    prefixIds: p.prefixIds.prefixIds,
    prefixClassNames: p.prefixIds.prefixClassNames,
  })
  addIf(p.convertStyleToAttrs.enabled, 'convertStyleToAttrs', {
    keepImportant: p.convertStyleToAttrs.keepImportant,
  })
  addIf(p.cleanupListOfValues.enabled, 'cleanupListOfValues', {
    floatPrecision: p.cleanupListOfValues.floatPrecision,
    leadingZero: p.cleanupListOfValues.leadingZero,
    defaultPx: p.cleanupListOfValues.defaultPx,
    convertToPx: p.cleanupListOfValues.convertToPx,
  })
  addIf(p.sortAttrs, 'sortAttrs')

  const result = optimize(svgString, {
    multipass: g.multipass,
    js2svg: {
      pretty: g.pretty,
      indent: g.indent,
    },
    plugins,
  })

  return result.data
}
