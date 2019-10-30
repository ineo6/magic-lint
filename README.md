# magic-lint

提供代码规范，同时支持代码美化，commit检查功能。

内部集成了 eslint，stylelint，prettier，lint-staged，husky，commitlint等，简化项目初始化配置流程。

注意！！！需要自己在项目中配置`.eslintrc`、`.stylelintrc`、`.prettierrc`，`commitlint`配置已内置。

## 安装

```bash
npm install magic-lint --save-dev
```

## 使用

搭配`husky`食用，在 `package.json` 添加

```diff
+ "husky": {
+   "hooks": {
+     "pre-commit": "magic-lint --staged --eslint --stylelint --prettier --fix"",
+     "commit-msg": "magic-lint --commit"
+   }
+ }
```

## 参数

```bash

Usage: magic-lint [options] file.js [file.js] [dir]

# 提交commit触发校验
magic-lint --commit

# 指定路径 lint
magic-lint --prettier --eslint --stylelint src/

# 只对提交的代码进行 lint
magic-lint --staged --prettier --eslint --stylelint

# 给eslint、prettier添加执行参数
magic-lint --eslint.debug  -s.formatter=json -p.no-semi

Options:
--commit, -C              check commit msg                                    [boolean] [default: false]
--staged, -S              only lint git staged files                          [boolean] [default: false]
--prettier, -p            format code with prettier                           [boolean] [default: false]
--eslint, -e              enable lint javascript                              [boolean] [default: false]
--stylelint, --style, -s  enable lint style                                   [boolean] [default: false]
--fix, -f                 fix all eslint and stylelint auto-fixable problems  [boolean] [default: false]
--quiet, -q               report errors only                                  [boolean] [default: false]
--cwd                     current working directory                           [default: process.cwd()]
```
