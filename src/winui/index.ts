/**
 * WinUIonWeb 桥接入口
 *
 * 组件源码 vendor 自 https://github.com/Furry-Xiyi/WinUIonWeb
 * 上游 commit 见 ./UPSTREAM_COMMIT.txt
 * 许可：GPL-3.0（见 ./LICENSE-GPL-3.0.txt），本项目整体按 AGPL-3.0 发布
 *
 * 做两件事：
 *  1) 把控件按 XAML 类型名注册到应用边界，页面模板里直接用 PascalCase 书写
 *  2) 提供 i18n，使控件内建文案跟随站点语言
 *
 * ⚠️ 注册是「全量」的：Vue 对未注册的 PascalCase 标签**不会报错**，
 *    而是当成未知 HTML 元素原样输出（页面看着正常但控件没渲染）。
 *    因此新增控件务必登记到下面的 COMPONENTS；
 *    scripts/check-components.mjs 会在构建前扫描模板并校验，漏登记会被拦下。
 */
import { createI18n, i18nKey, type Locale } from './components/i18n/index'
import FontIcon from './components/FontIcon.vue'
import ContentDialog from './components/ContentDialog.vue'
import ToolTip from './components/ToolTip.vue'
import Expander from './components/Expander.vue'
import Button from './components/Button.vue'
import { ButtonFlyout } from './components/Button.vue'
import TextBox from './components/TextBox.vue'
import PasswordBox from './components/PasswordBox.vue'
import NumberBox from './components/NumberBox.vue'
import CheckBox from './components/CheckBox.vue'
import RadioButton from './components/RadioButton.vue'
import RadioButtons from './components/RadioButtons.vue'
import ToggleSwitch from './components/ToggleSwitch.vue'
import ComboBox from './components/ComboBox.vue'
import AutoSuggestBox from './components/AutoSuggestBox.vue'
import Slider from './components/Slider.vue'
import ListView from './components/ListView.vue'
import SelectorBar from './components/SelectorBar.vue'
import ProgressBar from './components/ProgressBar.vue'
import ProgressRing from './components/ProgressRing.vue'
import InfoBadge from './components/InfoBadge.vue'
import TextBlock from './components/TextBlock.vue'
import NavigationView from './components/NavigationView.vue'
import ScrollViewer from './components/ScrollViewer.vue'
import PersonPicture from './components/PersonPicture.vue'
import { createI18n, i18nKey, type Locale } from './components/i18n/index'

/** 注册表：键即模板中使用的标签名。条目按依赖闭包裁剪，详见 scripts/trim-components.mjs */
export const COMPONENTS: Record<string, Component> = {
  FontIcon,
  ContentDialog,
  ToolTip,
  Expander,
  Button,
  'Button.Flyout': ButtonFlyout,
  TextBox,
  PasswordBox,
  NumberBox,
  CheckBox,
  RadioButton,
  RadioButtons,
  ToggleSwitch,
  ComboBox,
  AutoSuggestBox,
  Slider,
  ListView,
  SelectorBar,
  ProgressBar,
  ProgressRing,
  InfoBadge,
  TextBlock,
  NavigationView,
  ScrollViewer,
  PersonPicture,
}

/* 具名导出，供页面按需直接 import */
export {
  FontIcon,
  TextBlock,
  TextBox,
  PasswordBox,
  NumberBox,
  Button,
  CheckBox,
  RadioButton,
  RadioButtons,
  ToggleSwitch,
  ComboBox,
  AutoSuggestBox,
  Slider,
  ListView,
  SelectorBar,
  NavigationView,
  ContentDialog,
  Expander,
  InfoBadge,
  ProgressBar,
  ProgressRing,
  PersonPicture,
  ScrollViewer
}

export interface WinUIOptions {
  /** 界面语言，默认跟随浏览器（'zh-CN' / 'en-US'） */
  locale?: Locale
  /** 追加/覆盖控件内建文案 */
  resources?: Record<string, Record<string, string>>
}

/** 以 Vue 插件形式挂载 WinUIonWeb */
export const WinUIonWeb = {
  install(app: App, options: WinUIOptions = {}) {
    const i18n = createI18n(options.locale ?? navigator.language, options.resources as never)

    for (const [name, component] of Object.entries(COMPONENTS)) {
      app.component(name, component)
    }

    app.provide(i18nKey, i18n)
    app.config.globalProperties.$t = i18n.t
  }
}

export default WinUIonWeb
