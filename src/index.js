const Command = require('common-bin');
const { sync: resolveBin } = require('./resolve-bin');
const { join } = require('path');
let { writeFileSync } = require('fs');
const debug = require('debug')('magic-lint');
const { forkNodeWithOutput, runJobsWithSequentialOutput } = require('./fork-helper');
const {
  getPrettierExtensions,
  getMixedExtAndRest,
  endsWithArray,
  getFiles,
  parseSubOptions,
  getEslintExtensions,
  getBranchDiffFiles,
} = require('./utils');

class MainCommand extends Command {
  constructor(rawArgv) {
    super(rawArgv);

    this.options = require('./options');

    this.usage = `
      Usage: magic-lint [options] file.js [file.js] [dir]
        magic-lint --commit
        magic-lint --prettier --stylelint src/
        magic-lint --staged --prettier --stylelint
        magic-lint --merge-diff --source-sha=79697969644b1b73d10eb1bdd4b954f1260735ff  --target-sha=master --eslint --prettier --harmony --prettier.check
        magic-lint --eslint.debug -s.formatter=json -p.no-semi src/ test/
    `;
  }

  initBind(cwd) {
    this.eslint = resolveBin('eslint', { primaryPath: cwd });
    this.stylelint = resolveBin('stylelint', { primaryPath: cwd });
    this.prettier = resolveBin('prettier', { primaryPath: cwd });
    this.commitlintBin = resolveBin('@commitlint/cli', { executable: 'commitlint' });
    this.lintStagedBin = resolveBin('lint-staged', { primaryPath: cwd });

    debug('eslint: %s', this.eslint);
    debug('stylelint: %s', this.stylelint);
    debug('prettier: %s', this.prettier);
    debug('commitlintBin: %s', this.commitlintBin);
    debug('lintStaged: %s', this.lintStagedBin);
  }

  *run(context) {
    const { staged, commit, mergeDiff, cwd } = context.argv;
    this.initBind(cwd);

    if (commit) {
      yield this.commitlint(context.argv);
    } else if (mergeDiff) {
      yield this.lintBranch(context.argv);
    } else if (!staged) {
      yield this.lint(context.argv);
    } else {
      yield this.lintStaged(context.argv);
    }
  }

  *commitlint({ commit, cwd }) {
    try {
      const commitlintOptions = parseSubOptions(commit);

      yield this.helper.forkNode(this.commitlintBin, [...commitlintOptions], { cwd });
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }

  *lint({ _, eslint, stylelint, prettier, fix, quiet, cwd, harmony }) {
    if (_.length === 0) {
      console.error('please specify a path to lint');

      return process.exit(1);
    }

    const commonOpts = [...(fix ? ['--fix'] : []), ...(quiet ? ['--quiet'] : [])];

    const allFiles = getFiles(_, cwd);

    try {
      const jobs = [];
      const labels = [];

      if (eslint) {
        const eslintOptions = parseSubOptions(eslint);

        const eslintExtensions = getEslintExtensions(eslintOptions);

        const formatOpt = ['--format', require.resolve('eslint-formatter-pretty')];

        if (eslintOptions.indexOf('--format') >= 0) {
          eslintOptions.push(...formatOpt);
        }

        const files = allFiles.filter((item) => endsWithArray(item, eslintExtensions));
        if (files.length > 0) {
          jobs.push(
            forkNodeWithOutput(this.eslint, [...commonOpts, ...eslintOptions, ...files], {
              cwd,
            }),
          );
          labels.push('ESLint');
        }
      }

      if (stylelint) {
        const files = allFiles.filter((item) => endsWithArray(item, ['.css', '.less', '.scss', '.sass']));

        if (files.length > 0) {
          jobs.push(
            forkNodeWithOutput(this.stylelint, [...commonOpts, ...parseSubOptions(stylelint), ...files], {
              cwd,
            }),
          );
          labels.push('Stylelint');
        }
      }

      if (prettier) {
        const prettierOptions = parseSubOptions(prettier);

        const prettierExtensions = getPrettierExtensions(prettierOptions);

        const files = allFiles.filter((item) => endsWithArray(item, prettierExtensions));
        if (files.length > 0) {
          if (harmony) {
            jobs.unshift(forkNodeWithOutput(this.prettier, [...prettierOptions, ...files], { cwd }));
            labels.unshift('Prettier');
          } else {
            jobs.push(forkNodeWithOutput(this.prettier, [...prettierOptions, ...files], { cwd }));
            labels.push('Prettier');
          }
        }
      }

      // 使用新的函数处理并行任务,按顺序输出,显示分隔符
      const result = yield runJobsWithSequentialOutput(jobs, {
        labels,
        withSeparator: jobs.length > 1, // 只有多个工具时才显示分隔符
      });

      const rejectItem = result.find((item) => {
        return item.status === 'rejected';
      });

      if (rejectItem) {
        debug(rejectItem);
        process.exit(1);
      }
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }

  *lintStaged({ prettier, eslint, stylelint, fix, quiet, cwd, harmony }) {
    const commonOpts = `${fix ? '--fix' : ''} ${quiet ? '--quiet' : ''}`;

    const eslintOptions = parseSubOptions(eslint);
    const eslintExtensions = getEslintExtensions(eslintOptions);

    const prettierOptions = parseSubOptions(prettier);
    const prettierExtensions = getPrettierExtensions(prettierOptions);

    const formatOpt = ['--format', require.resolve('eslint-formatter-pretty')];

    if (eslintOptions.indexOf('--format') >= 0) {
      eslintOptions.push(...formatOpt);
    }

    const eslintProcessor = `${this.eslint} ${commonOpts} ${eslintOptions.join(' ')}`;
    const prettierProcessor = `${this.prettier} --write ${prettierOptions.join(' ')}`;

    const { mixed, eslintRstExt, prettierRstExt } = getMixedExtAndRest(eslintExtensions, prettierExtensions);

    const mixedProcessor = [eslintProcessor];

    if (harmony) {
      mixedProcessor.unshift(prettierProcessor);
    } else {
      mixedProcessor.push(prettierProcessor);
    }

    const lintstagedrc = {
      ...(prettier &&
        eslint && {
          [`*{${mixed.join(',')}}`]: mixedProcessor,
        }),
      ...(prettier &&
        prettierRstExt.length && {
          [`*{${prettierRstExt.join(',')}}`]: [prettierProcessor],
        }),
      ...(eslint &&
        eslintRstExt.length && {
          [`*{${eslintRstExt.join(',')}}`]: [eslintProcessor],
        }),
      ...(stylelint && {
        '*.{less,scss,sass,css}': [`${this.stylelint} ${commonOpts} ${parseSubOptions(stylelint).join(' ')}`],
      }),
    };

    const rcPath = join(__dirname, '.lintstagedrc.json');
    writeFileSync(rcPath, JSON.stringify(lintstagedrc));

    try {
      yield this.helper.forkNode(this.lintStagedBin, ['--config', rcPath, '--quiet'], { cwd });
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }
  *lintBranch({ _, prettier, eslint, quiet, cwd, harmony, sourceSha, targetSha }) {
    const commonOpts = `${quiet ? '--quiet' : ''}`;

    console.log(sourceSha, targetSha);
    const diffFiles = getBranchDiffFiles(sourceSha, targetSha, cwd);

    console.log('diff files', diffFiles);

    // 保存各工具对应的文件列表，用于生成修复脚本
    let eslintFiles = [];
    let prettierFiles = [];

    try {
      const jobs = [];
      const labels = [];

      if (eslint) {
        const eslintOptions = parseSubOptions(eslint);

        const eslintExtensions = getEslintExtensions(eslintOptions);

        const formatOpt = ['--format', require.resolve('eslint-formatter-pretty')];

        if (eslintOptions.indexOf('--format') >= 0) {
          eslintOptions.push(...formatOpt);
        }

        eslintFiles = diffFiles.filter((item) => endsWithArray(item, eslintExtensions));

        if (eslintFiles.length > 0) {
          jobs.push(
            forkNodeWithOutput(this.eslint, [...commonOpts, ...eslintOptions, ...eslintFiles], {
              cwd,
            }),
          );
          labels.push('ESLint');
        }
      }

      if (prettier) {
        const prettierOptions = parseSubOptions(prettier);

        const prettierExtensions = getPrettierExtensions(prettierOptions);

        prettierFiles = diffFiles.filter((item) => endsWithArray(item, prettierExtensions));
        if (prettierFiles.length > 0) {
          if (harmony) {
            jobs.unshift(forkNodeWithOutput(this.prettier, [...prettierOptions, ...prettierFiles], { cwd }));
            labels.unshift('Prettier');
          } else {
            jobs.push(forkNodeWithOutput(this.prettier, [...prettierOptions, ...prettierFiles], { cwd }));
            labels.push('Prettier');
          }
        }
      }

      // 使用新的函数处理并行任务,按顺序输出,显示分隔符
      const result = yield runJobsWithSequentialOutput(jobs, {
        labels,
        withSeparator: jobs.length > 1, // 只有多个工具时才显示分隔符
      });

      const rejectItem = result.find((item) => {
        return item.status === 'rejected';
      });

      if (rejectItem) {
        debug(rejectItem);
        // 输出修复脚本
        this.printFixScript({ eslintFiles, prettierFiles });
        process.exit(1);
      }
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }

  /**
   * 输出可直接执行的修复脚本
   */
  printFixScript({ eslintFiles, prettierFiles }) {
    const hasEslint = eslintFiles.length > 0;
    const hasPrettier = prettierFiles.length > 0;

    if (!hasEslint && !hasPrettier) {
      return;
    }

    console.log('\n' + '═'.repeat(66));
    console.log('  可执行以下命令进行修复：');
    console.log('═'.repeat(66) + '\n');

    if (hasEslint) {
      const filesStr = eslintFiles.join(' \\\n  ');
      console.log('# ESLint 修复');
      console.log(`npx eslint --fix \\\n  ${filesStr}\n`);
    }

    if (hasPrettier) {
      const filesStr = prettierFiles.join(' \\\n  ');
      console.log('# Prettier 修复');
      console.log(`npx prettier --write \\\n  ${filesStr}\n`);
    }
  }
}

module.exports = MainCommand;
