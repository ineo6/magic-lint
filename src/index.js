const Command = require('common-bin');
const { sync: resolveBin } = require('resolve-bin');
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
} = require('./utils');

class MainCommand extends Command {
  constructor(rawArgv) {
    super(rawArgv);

    this.options = require('./options');
    this.eslint = resolveBin('eslint');
    this.stylelint = resolveBin('stylelint');
    this.prettier = resolveBin('prettier');
    this.commitlintBin = resolveBin('@commitlint/cli', { executable: 'commitlint' });

    this.usage = `
      Usage: magic-lint [options] file.js [file.js] [dir]
        magic-lint --commit
        magic-lint --prettier --stylelint src/
        magic-lint --staged --prettier --stylelint
        magic-lint --eslint.debug -s.formatter=json -p.no-semi src/ test/
    `;
  }

  *run(context) {
    const { staged, commit } = context.argv;

    if (commit) {
      yield this.commitlint(context.argv);
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
      console.log('please specify a path to lint');
      return;
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
      yield Promise.all(jobs);
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }

  *lintStaged({ prettier, eslint, stylelint, fix, quiet, cwd, harmony }) {
    const lintStaged = resolveBin('lint-staged');
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
      yield this.helper.forkNode(lintStaged, ['--config', rcPath, '--quiet'], { cwd });
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }
}

module.exports = MainCommand;
