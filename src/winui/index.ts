/**
 * WinUIonWeb 桥接入口
 *
 * 组件源码 vendor 自 https://github.com/Furry-Xiyi/WinUIonWeb
 * 上游 commit 见 ./UPSTREAM_COMMIT.txt
 * 许可：GPL-3.0（见 ./LICENSE-GPL-3.0.txt），本项目整体按 AGPL-3.0 发布
 *
 * 只做两件事：
 *  1) 按上游 main.ts 的方式把「布局类」控件注册到应用边界（模板里可用 XAML 类型名）
 *  2) 提供 i18n，使控件内建文案跟随站点语言
 */
import type { App, Component } from 'vue'
import { createI18n, i18nKey, type Locale } from './components/i18n/index'

/* ── 布局与基础元素（上游以 XAML 类型名注册） ── */
import Grid from './components/Grid.vue'
import StackPanel from './components/StackPanel.vue'
import Canvas from './components/Canvas.vue'
import RelativePanel from './components/RelativePanel.vue'
import VariableSizedWrapGrid from './components/VariableSizedWrapGrid.vue'
import Border from './components/Border.vue'
import Rectangle from './components/Rectangle.vue'
import Image from './components/Image.vue'
import ColumnDefinition from './components/ColumnDefinition.vue'
import RowDefinition from './components/RowDefinition.vue'
import GridColumnDefinitions from './components/GridColumnDefinitions.vue'
import GridRowDefinitions from './components/GridRowDefinitions.vue'

/* ── 图标 ── */
import FontIcon from './components/FontIcon.vue'
import SymbolIcon from './components/SymbolIcon.vue'

/* ── 浮出层与对话框 ── */
import Flyout from './components/Flyout.vue'
import ContentDialog from './components/ContentDialog.vue'
import Popup from './components/Popup.vue'
import TeachingTip from './components/TeachingTip.vue'
import ToolTip from './components/ToolTip.vue'
import { ToolTipServiceToolTip } from './components/ToolTipServiceProperties'

/* ── Expander 复合结构 ── */
import Expander from './components/Expander.vue'
import {
  ExpanderHeader,
  ExpanderContent,
  ExpanderDescription,
  ExpanderHeaderIcon,
  ExpanderHeaderControls
} from './components/ExpanderProperties'

/* ── 按钮 + 菜单浮出 ── */
import { ButtonFlyout } from './components/Button.vue'
import { SplitButtonFlyout } from './components/SplitButton.vue'
import { ToggleSplitButtonFlyout } from './components/ToggleSplitButton.vue'
import {
  DropDownButtonFlyout,
  DropDownButtonContent,
  MenuFlyout,
  MenuFlyoutItem,
  MenuFlyoutItemIcon
} from './components/DropDownButtonProperties'

/* 常用控件：模板里以 PascalCase 类型名书写，因此一并全局注册。
   上游是在每个页面里按需 import，但本站页面多、控件用得密，
   统一注册可避免漏 import 时被 Vue 当成未知 HTML 元素渲染。 */
import TextBlock from './components/TextBlock.vue'
import Button from './components/Button.vue'
import NavigationView from './components/NavigationView.vue'
import ListView from './components/ListView.vue'
import GridView from './components/GridView.vue'
import ItemsRepeater from './components/ItemsRepeater.vue'
import SelectorBar from './components/SelectorBar.vue'
import SelectorBarItem from './components/SelectorBarItem.vue'
import AutoSuggestBox from './components/AutoSuggestBox.vue'
import TextBox from './components/TextBox.vue'
import PasswordBox from './components/PasswordBox.vue'
import ComboBox from './components/ComboBox.vue'
import CheckBox from './components/CheckBox.vue'
import RadioButton from './components/RadioButton.vue'
import RadioButtons from './components/RadioButtons.vue'
import ToggleSwitch from './components/ToggleSwitch.vue'
import ToggleButton from './components/ToggleButton.vue'
import DropDownButton from './components/DropDownButton.vue'
import SplitButton from './components/SplitButton.vue'
import HyperlinkButton from './components/HyperlinkButton.vue'
import NumberBox from './components/NumberBox.vue'
import ProgressBar from './components/ProgressBar.vue'
import ProgressRing from './components/ProgressRing.vue'
import InfoBar from './components/InfoBar.vue'
import InfoBadge from './components/InfoBadge.vue'
import BreadcrumbBar from './components/BreadcrumbBar.vue'
import PageHeader from './components/PageHeader.vue'
import ScrollViewer from './components/ScrollViewer.vue'
import ScrollView from './components/ScrollView.vue'
import PersonPicture from './components/PersonPicture.vue'
import SettingsCard from './components/SettingsCard.vue'
import TitleBar from './components/TitleBar.vue'
import Pivot from './components/Pivot.vue'
import PivotItem from './components/PivotItem.vue'
import Rating from './components/Rating.vue'
import AppBarButton from './components/AppBarButton.vue'
import TreeView from './components/TreeView.vue'

export {
  TextBlock,
  Button,
  NavigationView,
  ListView,
  GridView,
  ItemsRepeater,
  SelectorBar,
  SelectorBarItem,
  AutoSuggestBox,
  TextBox,
  PasswordBox,
  ComboBox,
  CheckBox,
  RadioButton,
  ToggleSwitch,
  ToggleButton,
  DropDownButton,
  SplitButton,
  HyperlinkButton,
  NumberBox,
  ProgressBar,
  ProgressRing,
  InfoBar,
  InfoBadge,
  BreadcrumbBar,
  PageHeader,
  ScrollViewer,
  ScrollView,
  PersonPicture,
  SettingsCard,
  TitleBar,
  Pivot,
  PivotItem,
  Rating,
  AppBarButton,
  TreeView,
  Expander,
  ContentDialog,
  ToolTip,
  Flyout,
  SymbolIcon,
  FontIcon
}

const globalComponents: Record<string, Component> = {
  Grid,
  StackPanel,
  Canvas,
  RelativePanel,
  VariableSizedWrapGrid,
  Border,
  Rectangle,
  Image,
  ColumnDefinition,
  RowDefinition,
  'Grid.ColumnDefinitions': GridColumnDefinitions,
  'Grid.RowDefinitions': GridRowDefinitions,
  FontIcon,
  SymbolIcon,
  SymbolIconSource: SymbolIcon,
  Flyout,
  ContentDialog,
  Popup,
  TeachingTip,
  ToolTip,
  'ToolTipService.ToolTip': ToolTipServiceToolTip,
  Expander,
  'Expander.Header': ExpanderHeader,
  'Expander.Content': ExpanderContent,
  'Expander.Description': ExpanderDescription,
  'Expander.HeaderIcon': ExpanderHeaderIcon,
  'Expander.HeaderControls': ExpanderHeaderControls,
  'Button.Flyout': ButtonFlyout,
  'SplitButton.Flyout': SplitButtonFlyout,
  'ToggleSplitButton.Flyout': ToggleSplitButtonFlyout,
  'DropDownButton.Flyout': DropDownButtonFlyout,
  'DropDownButton.Content': DropDownButtonContent,
  MenuFlyout,
  MenuFlyoutItem,
  'MenuFlyoutItem.Icon': MenuFlyoutItemIcon,
  /* 常用控件 */
  TextBlock,
  Button,
  NavigationView,
  ListView,
  GridView,
  ItemsRepeater,
  SelectorBar,
  SelectorBarItem,
  AutoSuggestBox,
  TextBox,
  PasswordBox,
  ComboBox,
  CheckBox,
  RadioButton,
  RadioButtons,
  ToggleSwitch,
  ToggleButton,
  DropDownButton,
  SplitButton,
  HyperlinkButton,
  NumberBox,
  ProgressBar,
  ProgressRing,
  InfoBar,
  InfoBadge,
  BreadcrumbBar,
  PageHeader,
  ScrollViewer,
  ScrollView,
  PersonPicture,
  SettingsCard,
  TitleBar,
  Pivot,
  PivotItem,
  Rating,
  AppBarButton,
  TreeView
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
    const i18n = createI18n(
      options.locale ?? navigator.language,
      options.resources as never
    )

    for (const [name, component] of Object.entries(globalComponents)) {
      app.component(name, component)
    }

    app.provide(i18nKey, i18n)
    app.config.globalProperties.$t = i18n.t
  }
}

export default WinUIonWeb
