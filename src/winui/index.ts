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
import type { App, Component } from 'vue'
import { createI18n, i18nKey, type Locale } from './components/i18n/index'

/* ── 布局与基础元素 ── */
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

/* ── 按钮与菜单 ── */
import Button from './components/Button.vue'
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
import DropDownButton from './components/DropDownButton.vue'
import SplitButton from './components/SplitButton.vue'
import ToggleButton from './components/ToggleButton.vue'
import RepeatButton from './components/RepeatButton.vue'
import HyperlinkButton from './components/HyperlinkButton.vue'
import AppBarButton from './components/AppBarButton.vue'
import MenuBar from './components/MenuBar.vue'
import CommandBar from './components/CommandBar.vue'

/* ── 输入类 ── */
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
import RichEditBox from './components/RichEditBox.vue'
import RichTextBlock from './components/RichTextBlock.vue'

/* ── 集合类 ── */
import ListView from './components/ListView.vue'
import GridView from './components/GridView.vue'
import ItemsRepeater from './components/ItemsRepeater.vue'
import SelectorBar from './components/SelectorBar.vue'
import SelectorBarItem from './components/SelectorBarItem.vue'
import TreeView from './components/TreeView.vue'
import PipsPager from './components/PipsPager.vue'
import HorizontalScrollContainer from './components/HorizontalScrollContainer.vue'

/* ── 日期时间 ── */
import CalendarView from './components/CalendarView.vue'
import CalendarDatePicker from './components/CalendarDatePicker.vue'
import DatePicker from './components/DatePicker.vue'
import TimePicker from './components/TimePicker.vue'

/* ── 状态与信息 ── */
import ProgressBar from './components/ProgressBar.vue'
import ProgressRing from './components/ProgressRing.vue'
import InfoBar from './components/InfoBar.vue'
import InfoBadge from './components/InfoBadge.vue'
import Rating from './components/Rating.vue'

/* ── 容器与其他 ── */
import TextBlock from './components/TextBlock.vue'
import NavigationView from './components/NavigationView.vue'
import BreadcrumbBar from './components/BreadcrumbBar.vue'
import PageHeader from './components/PageHeader.vue'
import ScrollViewer from './components/ScrollViewer.vue'
import ScrollView from './components/ScrollView.vue'
import PersonPicture from './components/PersonPicture.vue'
import SettingsCard from './components/SettingsCard.vue'
import TitleBar from './components/TitleBar.vue'
import Pivot from './components/Pivot.vue'
import PivotItem from './components/PivotItem.vue'

/** 注册表：键即模板中使用的标签名 */
export const COMPONENTS: Record<string, Component> = {
  /* 布局 */
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
  /* 图标 */
  FontIcon,
  SymbolIcon,
  SymbolIconSource: SymbolIcon,
  /* 浮出层 */
  Flyout,
  ContentDialog,
  Popup,
  TeachingTip,
  ToolTip,
  'ToolTipService.ToolTip': ToolTipServiceToolTip,
  /* Expander */
  Expander,
  'Expander.Header': ExpanderHeader,
  'Expander.Content': ExpanderContent,
  'Expander.Description': ExpanderDescription,
  'Expander.HeaderIcon': ExpanderHeaderIcon,
  'Expander.HeaderControls': ExpanderHeaderControls,
  /* 按钮与菜单 */
  Button,
  'Button.Flyout': ButtonFlyout,
  DropDownButton,
  'DropDownButton.Flyout': DropDownButtonFlyout,
  'DropDownButton.Content': DropDownButtonContent,
  SplitButton,
  'SplitButton.Flyout': SplitButtonFlyout,
  'ToggleSplitButton.Flyout': ToggleSplitButtonFlyout,
  ToggleButton,
  RepeatButton,
  HyperlinkButton,
  AppBarButton,
  MenuBar,
  CommandBar,
  MenuFlyout,
  MenuFlyoutItem,
  'MenuFlyoutItem.Icon': MenuFlyoutItemIcon,
  /* 输入 */
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
  RichEditBox,
  RichTextBlock,
  /* 集合 */
  ListView,
  GridView,
  ItemsRepeater,
  SelectorBar,
  SelectorBarItem,
  TreeView,
  PipsPager,
  HorizontalScrollContainer,
  /* 日期时间 */
  CalendarView,
  CalendarDatePicker,
  DatePicker,
  TimePicker,
  /* 状态 */
  ProgressBar,
  ProgressRing,
  InfoBar,
  InfoBadge,
  Rating,
  /* 容器与其他 */
  TextBlock,
  NavigationView,
  BreadcrumbBar,
  PageHeader,
  ScrollViewer,
  ScrollView,
  PersonPicture,
  SettingsCard,
  TitleBar,
  Pivot,
  PivotItem
}

/* 具名导出，供页面按需直接 import */
export {
  Grid,
  StackPanel,
  Border,
  Image,
  FontIcon,
  SymbolIcon,
  TextBlock,
  TextBox,
  PasswordBox,
  NumberBox,
  Button,
  CheckBox,
  RadioButton,
  RadioButtons,
  ToggleSwitch,
  ToggleButton,
  ComboBox,
  AutoSuggestBox,
  Slider,
  ListView,
  GridView,
  ItemsRepeater,
  SelectorBar,
  SelectorBarItem,
  NavigationView,
  ContentDialog,
  Expander,
  InfoBar,
  InfoBadge,
  ProgressBar,
  ProgressRing,
  PersonPicture,
  ScrollViewer,
  ScrollView,
  Rating,
  BreadcrumbBar,
  PageHeader,
  SettingsCard,
  TitleBar,
  Pivot,
  PivotItem
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
