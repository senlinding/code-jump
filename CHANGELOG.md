# Change Log

All notable changes to the "code-jump" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.2.8]

- 兼容新版 VSCode：修复 "provided an invalid tree item" 报错（iconPath 不再赋 null、label 字符串兜底），用 workspaceFolders 替换已废弃的 rootPath。
- 视图 UI 优化：
  - 视图标题栏新增「全部展开/全部折叠」按钮，当所有结果折叠时自动切换为「全部展开」图标。

## [Unreleased]

- Initial release