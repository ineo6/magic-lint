'use strict';

const Command = require('common-bin');
const { sync: resolveBin } = require('resolve-bin');
const { join } = require('path');
const { writeFileSync } = require('fs');
const debug = require('debug')('magic-lint');
const { endsWithArray, getFiles, parseSubOptions, getEslintExtensions } = require('./utils');

class MainCommand extends Command {
  constructor(rawArgv) {
    super(rawArgv);

    this.options = require('./options');
    this.eslint = resolveBin('eslint');
    this.stylelint = resolveBin('stylelint');
    this.prettier = resolveBin('prettier');

    this.usage = `
      Usage: magic-lint [options] file.js [file.js] [dir]
        magic-lint --commit
        magic-lint --prettier --stylelint src/
        magic-lint --staged --prettier --stylelint
        magic-lint --eslint.debug --tslint.force -s.formatter=json -p.no-semi src/ test/
    `;
  }

  *run(context) {
    const { staged, commit } = context.argv;

    if (commit) {
      // commit-msg
      yield this.commitlint(context.argv);
    } else {
      if (!staged) {
        yield this.lint(context.argv);
      } else {
        yield this.lintStaged(context.argv);
      }
    }
  }

  *commitlint({ cwd }) {
    const commitlint = resolveBin('@commitlint/cli', { executable: 'commitlint' });

    try {
      yield this.helper.forkNode(
        commitlint,
        ['-E', 'HUSKY_GIT_PARAMS', '-g', join(__dirname, '../config', 'commitlint.config.js')],
        { cwd },
      );
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }

  *lint({ _, eslint, stylelint, prettier, fix, quiet, cwd }) {
    if (_.length === 0) {
      console.log('please specify a path to lint');
      return;
    }

    const commonOpts = [...(fix ? ['--fix'] : []), ...(quiet ? ['--quiet'] : [])];

    const allFiles = getFiles(_, cwd);

    try {
      const jobs = [];
      // eslint can be disable
      if (eslint) {
        const eslintOptions = parseSubOptions(eslint);

        const eslintExtensions = getEslintExtensions(eslintOptions);

        const formatOpt = ['--format', require.resolve('eslint-formatter-friendly')];

        if (eslintOptions.indexOf('--format') === -1) {
          eslintOptions.push(...formatOpt)
        }

        // TODO, 效率可能不高, 先实现再验证
        const files = allFiles.filter(item => endsWithArray(item, eslintExtensions));
        if (files.length > 0) {
          jobs.push(
            this.helper.forkNode(
              this.eslint,
              [...commonOpts, ...eslintOptions, ...files],
              {
                cwd,
              },
            ),
          );
        }
      }

      if (stylelint) {
        const files = allFiles.filter(item =>
          endsWithArray(item, ['.css', '.less', '.scss', '.sass']),
        );

        if (files.length > 0) {
          jobs.push(
            this.helper.forkNode(
              this.stylelint,
              [...commonOpts, ...parseSubOptions(stylelint), ...files],
              {
                cwd,
              },
            ),
          );
        }
      }

      if (prettier) {
        const files = allFiles.filter(item =>
          endsWithArray(item, ['.js', '.jsx', '.ts', '.tsx', '.css', '.less', '.scss', '.sass']),
        );
        if (files.length > 0) {
          jobs.push(
            this.helper.forkNode(this.prettier, [...parseSubOptions(prettier), ...files], { cwd }),
          );
        }
      }
      yield Promise.all(jobs);
    } catch (error) {
      debug(error);
      process.exit(error.code);
    }
  }

  *lintStaged({ prettier, eslint, stylelint, fix, quiet, cwd }) {
    const lintStaged = resolveBin('lint-staged');
    const commonOpts = `${fix ? '--fix' : ''} ${quiet ? '--quiet' : ''}`;

    const eslintOptions = parseSubOptions(eslint);
    const eslintExtensions = getEslintExtensions(eslintOptions);

    const formatOpt = ['--format', require.resolve('eslint-formatter-friendly')];

    if (eslintOptions.indexOf('--format') === -1) {
      eslintOptions.push(...formatOpt)
    }

    // generate dynamic configuration
    const lintstagedrc = {
      ...(prettier && {
        '*.{js,jsx,ts,tsx,less,scss,sass,css}': [
          `${this.prettier} --write ${parseSubOptions(prettier).join(' ')}`,
        ],
      }),
      ...(eslint && {
        [`*{${eslintExtensions.join(',')}}`]: [
          `${this.eslint} ${commonOpts} ${eslintOptions.join(' ')}`,
        ],
      }),
      ...(stylelint && {
        '*.{less,scss,sass,css}': [
          `${this.stylelint} ${commonOpts} ${parseSubOptions(stylelint).join(' ')}`,
        ],
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
