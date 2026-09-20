/**
 * 控件依赖闭包分析
 *
 * src/winui/index.ts 里 import 了全部上游控件，Rollup 会因此把它们全部打进包里 ——
 * 「全局注册」本身不影响打包，影响打包的是 import。
 *
 * 本脚本：从「页面模板实际用到的控件」出发，沿组件之间的内部 import 做传递闭包，
 * 得到最小必要集合，并报告可裁掉多少。
 *
 * 用法：node scripts/analyze-components.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const componentsDir = resolve(root, 'src/winui/components')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|ts)$/.test(name)) out.push(p)
  }
  return out
}

/** 组件文件 → 它 import 的其它组件文件（限组件目录内） */
function buildGraph() {
  const files = walk(componentsDir)
  const graph = new Map()
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const deps = new Set()
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const spec = m[1]
      const base = resolve(dirname(f), spec)
      for (const cand of [base, `${base}.vue`, `${base}.ts`, join(base, 'index.ts')]) {
        if (files.includes(cand)) {
          deps.add(cand)
          break
        }
      }
    }
    graph.set(f, deps)
  }
  return { files, graph }
}

/** 页面/公共组件模板里用到的标签名 */
function tagsUsedInTemplates() {
  const targets = [resolve(root, 'src/pages'), resolve(root, 'src/components')]
  const tags = new Set()
  for (const dir of targets) {
    for (const f of walk(dir).filter((p) => p.endsWith('.vue'))) {
      const src = readFileSync(f, 'utf8')
      const tpl = src.match(/<template>([\s\S]*)<\/template>/)
      if (!tpl) continue
      for (const m of tpl[1].matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) tags.add(m[1])
    }
  }
  return tags
}

/** 把注册表标签名映射回组件文件 */
function registryToFiles() {
  return {
    Grid: 'Grid.vue',
    StackPanel: 'StackPanel.vue',
    Canvas: 'Canvas.vue',
    RelativePanel: 'RelativePanel.vue',
    VariableSizedWrapGrid: 'VariableSizedWrapGrid.vue',
    Border: 'Border.vue',
    Rectangle: 'Rectangle.vue',
    Image: 'Image.vue',
    ColumnDefinition: 'ColumnDefinition.vue',
    RowDefinition: 'RowDefinition.vue',
    FontIcon: 'FontIcon.vue',
    SymbolIcon: 'SymbolIcon.vue',
    Flyout: 'Flyout.vue',
    ContentDialog: 'ContentDialog.vue',
    Popup: 'Popup.vue',
    TeachingTip: 'TeachingTip.vue',
    ToolTip: 'ToolTip.vue',
    Expander: 'Expander.vue',
    Button: 'Button.vue',
    DropDownButton: 'DropDownButton.vue',
    SplitButton: 'SplitButton.vue',
    ToggleButton: 'ToggleButton.vue',
    RepeatButton: 'RepeatButton.vue',
    HyperlinkButton: 'HyperlinkButton.vue',
    AppBarButton: 'AppBarButton.vue',
    MenuBar: 'MenuBar.vue',
    CommandBar: 'CommandBar.vue',
    TextBox: 'TextBox.vue',
    PasswordBox: 'PasswordBox.vue',
    NumberBox: 'NumberBox.vue',
    CheckBox: 'CheckBox.vue',
    RadioButton: 'RadioButton.vue',
    RadioButtons: 'RadioButtons.vue',
    ToggleSwitch: 'ToggleSwitch.vue',
    ComboBox: 'ComboBox.vue',
    AutoSuggestBox: 'AutoSuggestBox.vue',
    Slider: 'Slider.vue',
    RichEditBox: 'RichEditBox.vue',
    RichTextBlock: 'RichTextBlock.vue',
    ListView: 'ListView.vue',
    GridView: 'GridView.vue',
    ItemsRepeater: 'ItemsRepeater.vue',
    SelectorBar: 'SelectorBar.vue',
    SelectorBarItem: 'SelectorBarItem.vue',
    TreeView: 'TreeView.vue',
    PipsPager: 'PipsPager.vue',
    HorizontalScrollContainer: 'HorizontalScrollContainer.vue',
    CalendarView: 'CalendarView.vue',
    CalendarDatePicker: 'CalendarDatePicker.vue',
    DatePicker: 'DatePicker.vue',
    TimePicker: 'TimePicker.vue',
    ProgressBar: 'ProgressBar.vue',
    ProgressRing: 'ProgressRing.vue',
    InfoBar: 'InfoBar.vue',
    InfoBadge: 'InfoBadge.vue',
    Rating: 'Rating.vue',
    TextBlock: 'TextBlock.vue',
    NavigationView: 'NavigationView.vue',
    BreadcrumbBar: 'BreadcrumbBar.vue',
    PageHeader: 'PageHeader.vue',
    ScrollViewer: 'ScrollViewer.vue',
    ScrollView: 'ScrollView.vue',
    PersonPicture: 'PersonPicture.vue',
    SettingsCard: 'SettingsCard.vue',
    TitleBar: 'TitleBar.vue',
    Pivot: 'Pivot.vue',
    PivotItem: 'PivotItem.vue'
  }
}

const { files, graph } = buildGraph()
const tags = tagsUsedInTemplates()
const map = registryToFiles()

/* 起始集合：模板用到的标签 → 组件文件；连字符标签（如 Expander.Header）归到宿主组件 */
const seeds = new Set()
const unresolved = []
for (const tag of tags) {
  const host = tag.split('.')[0]
  const file = map[host]
  if (file) seeds.add(join(componentsDir, file))
  else if (!['App', 'YaliShell', 'ErrorPage', 'ServicesApp'].includes(tag)) unresolved.push(tag)
}

/* 传递闭包 */
const keep = new Set()
const queue = [...seeds]
while (queue.length) {
  const f = queue.pop()
  if (keep.has(f)) continue
  keep.add(f)
  for (const dep of graph.get(f) ?? []) if (!keep.has(dep)) queue.push(dep)
}

const all = files
const dropped = all.filter((f) => !keep.has(f))

console.log(`组件文件总数: ${all.length}`)
console.log(`模板直接用到的标签: ${tags.size}`)
console.log(`闭包后需保留: ${keep.size}`)
console.log(`可裁掉: ${dropped.length}`)
if (unresolved.length) console.log(`未映射到文件的标签（请检查）: ${unresolved.join(', ')}`)
console.log('\n保留清单:')
console.log(
  [...keep]
    .map((f) => relative(componentsDir, f))
    .sort()
    .join(', ')
)
