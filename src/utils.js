const globby = require('globby');
const fs = require('fs');
const ignore = require('ignore');
const path = require('path');
const execSync = require('child_process').execSync;

function transformOpts(result, item, key) {
  result.push(`--${key}`);
  if (typeof item[key] !== 'boolean') {
    result.push(item[key]);
  }
}

// 获取其他需要忽略的规则
function getIgnores(cwd) {
  let ignores = [];
  // 获取 eslintignore 忽略规则
  globby
    .sync('**/.eslintignore', {
      ignore: ['**/node_modules/**'],
      cwd,
    })
    .forEach((file) => {
      const result = fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) => line.charAt(0) !== '#');
      ignores = ignores.concat(result);
    });
  return ignores;
}

// 获取交集，以及各自的补集
function getMixedExtAndRest(eslintExt, prettierExt) {
  const mixed = [];

  eslintExt.forEach((e1) => {
    if (prettierExt.includes(e1)) {
      mixed.push(e1);
    }
  });

  const eslintRstExt = eslintExt.filter((e) => !mixed.includes(e));
  const prettierRstExt = prettierExt.filter((e) => !mixed.includes(e));

  return {
    mixed,
    eslintRstExt,
    prettierRstExt,
  };
}

function getBranchDiffFiles(branchSource, branchTarget, cwd) {
  const GITDIFF = `git diff ${branchTarget}...${branchSource}  --diff-filter=ACMR --name-only`;

  console.log('execute git diff command:', GITDIFF);
  const diff = execSync(GITDIFF).toString();

  const changedPaths = diff.split('\n').filter((path) => path.length > 0);

  return ignore().add(getIgnores(cwd)).filter(changedPaths);
}

module.exports = {
  // like /.js$|.jsx$/.test('aaa.js')
  endsWithArray: (str, arr) => new RegExp(`${arr.join('$|')}$`).test(str),
  getFiles: (patterns, cwd) => {
    const result = globby
      .sync(patterns, {
        gitignore: true,
        ignore: ['**/node_modules/**', '.git'],
        onlyFiles: true,
        dot: true,
      })
      .map((item) => path.relative(cwd, item)); // ignore 包必须使用相对路径

    return ignore().add(getIgnores(cwd)).filter(result);
  },
  getBranchDiffFiles,
  /**
   * support sub option like: --eslint.debug --eslint.no-ignore
   * @param {(object|array)} option { debug: true } | [ true, { debug: true } ]
   * @return {array} []
   */
  parseSubOptions: (option) => {
    if (Array.isArray(option)) {
      return option
        .filter((item) => typeof item === 'object')
        .reduce((result, item) => {
          const key = Object.keys(item)[0];
          transformOpts(result, item, key);
          return result;
        }, []);
    }
    if (typeof option === 'object') {
      const result = [];
      Object.keys(option).forEach((key) => {
        transformOpts(result, option, key);
      });
      return result;
    }
    return [];
  },
  getEslintExtensions: (options) => {
    const index = options.indexOf('--ext');
    if (index !== -1) {
      return options[index + 1].split(',');
    }
    return ['.js', '.jsx', '.ts', '.tsx', '.vue'];
  },
  getPrettierExtensions: (options) => {
    const index = options.indexOf('--ext');
    if (index !== -1) {
      return options[index + 1].split(',');
    }
    return ['.js', '.jsx', '.ts', '.tsx', '.vue', '.css', '.less', '.scss', '.sass'];
  },
  getMixedExtAndRest,
};
