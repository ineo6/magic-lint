# magic-lint

提供代码规范，同时支持代码美化，`commit`检查功能。

内部集成了 `eslint`，`stylelint`，`prettier`，`lint-staged`，`commitlint`等，简化项目初始化配置流程。

注意！！！需要自己在项目中配置`.eslintrc`、`.stylelintrc`、`.prettierrc`、`commitlint.config.js`。

## 安装

```bash
npm install magic-lint --save-dev
```

## 参数

```bash

Usage: magic-lint [options] file.js [file.js] [dir]

# 提交commit触发校验
magic-lint --commit --commit.config=./../commitlint.config.js

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
--harmony                 work as prettier-eslint                             [boolean] [default: true]
```

### 参数说明

#### harmony

和谐模式，目的是处理`prettier`和`eslint`的冲突问题，会和`prettier-eslint`一样，先用`prettier`处理，再用`eslint`处理。

默认开启。

## 使用教程

以`husky`最新版（v7及以上）为例：

### 1. 初始化`husky`

```bash
npx husky-init && npm install       # npm
npx husky-init && yarn              # Yarn 1
yarn dlx husky-init --yarn2 && yarn # Yarn 2
```

脚本执行会在`package.json`添加一个示例`pre-commit`钩子，默认会执行`npm test`命令。

如果要修改的话打开`.husky/pre-commit`移除`npm test`。

### 2. 新增钩子

```bash
// 比如在commit-msg时执行命令
npx husky add .husky/commit-msg '你要执行的命令'
```

注意：如果是`Windows`用户使用`npx husky add ...`可能会遇到注意，请使用`node node_modules/.bin/husky add ...`命令替代。

`husky`现在采用了`Shell`脚本的方式，实现是更自由了，但是也没法和之前无缝使用了，请仔细阅读。

- `$(dirname "$0")`指代的是`hook`所在的目录

#### 检查`commit`

编辑`.husky/commit-msg`文件，添加：

```
npx --no-install magic-lint --commit --commit.config "$(dirname "$0")/../commitlint.config.js" --commit.edit "$1"
```

#### eslint格式化

编辑`.husky/pre-msg`文件，添加：

```
npx --no-install magic-lint --staged --eslint --stylelint --prettier --fix"
```

### husky 旧版本

搭配`husky`食用，在 `package.json` 添加

```bash
"husky": {
  "hooks": {
    "pre-commit": "magic-lint --staged --eslint --stylelint --prettier --fix",
    "commit-msg": "magic-lint --commit"
  }
}
```

另外迁移指南请看[Migrate from v4 to v7](https://typicode.github.io/husky/#/?id=migrate-from-v4-to-v7)
