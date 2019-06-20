# magic-lint

代码质量检查、美化，commit检查工具，封装了 eslint，stylelint，prettier，lint-staged，husky，commitlint等，无门槛使用。

注意！！！需要自己在项目中配置`.eslintrc`、`.stylelintrc`、`.prettierrc`，`commitlint`配置已内置。

## 安装

```bash
npm install magic-lint --save-dev
```

## 使用

在 `package.json` 添加

```diff
+ "husky": {
+   "hooks": {
+     "pre-commit": "magic-lint --staged --eslint --stylelint --prettier --fix"",
+     "commit-msg": "magic-lint --commit"
+   }
+ }
```

## 参数说明

```bash

Usage: magic-lint [options] file.js [file.js] [dir]

# 提交commit触发校验
magic-lint --commit

# 对指定路径 lint
magic-lint --prettier --eslint --stylelint src/

# 只对提交的代码进行 lint
magic-lint --staged --prettier --eslint --stylelint

# 对于某些场景需要指定 lint 工具的子参数
magic-lint --eslint.debug  -s.formatter=json -p.no-semi

Options:
--commit, -C              only check commit msg                               [boolean] [default: false]
--staged, -S              only lint git staged files                          [boolean] [default: false]
--prettier, -p            format code with prettier                           [boolean] [default: false]
--eslint, -e              enable lint javascript                              [boolean] [default: false]
--stylelint, --style, -s  enable lint style                                   [boolean] [default: false]
--fix, -f                 fix all eslint and stylelint auto-fixable problems  [boolean] [default: false]
--quiet, -q               report errors only                                  [boolean] [default: false]
--cwd                     current working directory                           [default: process.cwd()]
```
