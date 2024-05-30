const Command = require('common-bin');
const { sync: resolveBin } = require('./resolve-bin');
const { join } = require('path');
let { writeFileSync } = require('fs');
const debug = require('debug')('magic-lint');
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

      return process.exit(-1);
    }

    const commonOpts = [...(fix ? ['--fix'] : []), ...(quiet ? ['--quiet'] : [])];

    const allFiles = getFiles(_, cwd);

    try {
      const jobs = [];

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
            this.helper.forkNode(this.eslint, [...commonOpts, ...eslintOptions, ...files], {
              cwd,
            }),
          );
        }
      }

      if (stylelint) {
        const files = allFiles.filter((item) => endsWithArray(item, ['.css', '.less', '.scss', '.sass']));

        if (files.length > 0) {
          jobs.push(
            this.helper.forkNode(this.stylelint, [...commonOpts, ...parseSubOptions(stylelint), ...files], {
              cwd,
            }),
          );
        }
      }

      if (prettier) {
        const prettierOptions = parseSubOptions(prettier);

        const prettierExtensions = getPrettierExtensions(prettierOptions);

        const files = allFiles.filter((item) => endsWithArray(item, prettierExtensions));
        if (files.length > 0) {
          if (harmony) {
            jobs.unshift(this.helper.forkNode(this.prettier, [...parseSubOptions(prettier), ...files], { cwd }));
          } else {
            jobs.push(this.helper.forkNode(this.prettier, [...parseSubOptions(prettier), ...files], { cwd }));
          }
        }
      }
      yield Promise.allSettled(jobs);
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

    try {
      const jobs = [];

      if (eslint) {
        const eslintOptions = parseSubOptions(eslint);

        const eslintExtensions = getEslintExtensions(eslintOptions);

        const formatOpt = ['--format', require.resolve('eslint-formatter-pretty')];

        if (eslintOptions.indexOf('--format') >= 0) {
          eslintOptions.push(...formatOpt);
        }

        const files = diffFiles.filter((item) => endsWithArray(item, eslintExtensions));

        if (files.length > 0) {
          jobs.push(
            this.helper.forkNode(this.eslint, [...commonOpts, ...eslintOptions, ...files], {
              cwd,
            }),
          );
        }
      }

      if (prettier) {
        const prettierOptions = parseSubOptions(prettier);

        const prettierExtensions = getPrettierExtensions(prettierOptions);

        const files = diffFiles.filter((item) => endsWithArray(item, prettierExtensions));
        if (files.length > 0) {
          if (harmony) {
            jobs.unshift(this.helper.forkNode(this.prettier, [...parseSubOptions(prettier), ...files], { cwd }));
          } else {
            jobs.push(this.helper.forkNode(this.prettier, [...parseSubOptions(prettier), ...files], { cwd }));
          }
        }
      }
      const result = yield Promise.allSettled(jobs);

      const rejectItem = result.find((item) => {
        return item.status === 'rejected';
      });

      if (rejectItem) {
        debug(rejectItem);
        process.exit(-1);
      }
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }
}

module.exports = MainCommand;
