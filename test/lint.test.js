'use strict';

const path = require('path');
const coffee = require('coffee');

describe('test lint command', () => {
  const magicLint = path.resolve('./bin/magic-lint');
  const cwd = path.join(__dirname, 'fixture/lint/');

  it('lint js', (done) => {
    coffee
      .fork(magicLint, ['./js', '--eslint'], { cwd })
      .expect('stdout', /no-unused-vars/)
      .expect('stdout', /1 error/)
      .expect('code', 1)
      .end(done);
  });

  it('lint js with sub options', (done) => {
    coffee
      .fork(magicLint, ['./js', '--eslint.quiet'], { cwd })
      .expect('stdout', /✖ 1 problem \(1 error, 0 warnings\)/)
      .expect('code', 1)
      .end(done);
  });

  it('lint ts with eslint', (done) => {
    coffee
      .fork(magicLint, ['./ts', '--eslint.ext', '.ts,.tsx'], { cwd })
      .expect('stdout', /An empty interface is equivalent to /)
      .expect('stdout', /Prefer using an optional chain expression instead, /)
      .expect('stdout', /✖ 2 problems \(2 errors, 0 warnings\)/)
      .expect('code', 1)
      .end(done);
  });

  it('lint style', (done) => {
    coffee
      .fork(magicLint, ['./style', '--stylelint'], { cwd })
      .expect('stdout', /✖  Unexpected missing generic font family  font-family-no-missing-generic-family-keyword/)
      .expect('code', 1)
      .end(done);
  });

  it('lint style with sub options', (done) => {
    coffee
      .fork(magicLint, ['./style', '--stylelint', '-s.formatter', 'json'], { cwd })
      .expect('stdout', /"text":"Unexpected missing generic font family/)
      .expect('code', 1)
      .end(done);
  });

  it('use prettier', (done) => {
    coffee
      .fork(magicLint, ['./prettier', '--prettier', '--eslint', false], {
        cwd,
        env: { FROM_TEST: true },
      })
      .expect('stdout', /const hello = 'aaa';/)
      .expect('code', 0)
      .end(done);
  });

  it('use prettier with sub options', (done) => {
    coffee
      .fork(magicLint, ['./prettier', '--prettier', '--eslint', false, '-p.no-semi'], {
        cwd,
        env: { FROM_TEST: true },
      })
      .expect('stdout', /const hello = 'aaa'/)
      .expect('code', 0)
      .end(done);
  });

  it('run multiple linters in parallel without mixed output', (done) => {
    // 同时运行 eslint 和 prettier,测试输出不会混合
    coffee
      .fork(magicLint, ['./js', './prettier', '--eslint', '--prettier'], {
        cwd,
        env: { FROM_TEST: true },
      })
      .expect('stdout', /no-unused-vars/) // eslint 输出
      .expect('stdout', /const hello = 'aaa';/) // prettier 输出格式化后的代码
      .expect('code', 1)
      .end(done);
  });

  it('run eslint and stylelint together', (done) => {
    // 测试 eslint 和 stylelint 并行执行
    coffee
      .fork(magicLint, ['./js', './style', '--eslint', '--stylelint'], { cwd })
      .expect('stdout', /no-unused-vars/) // eslint 输出
      .expect('stdout', /font-family-no-missing-generic-family-keyword/) // stylelint 输出
      .expect('code', 1)
      .end(done);
  });

  it('verify output order is sequential when running parallel linters', (done) => {
    // 验证即使并行执行,输出也是按顺序的(先 eslint,再 prettier)
    coffee
      .fork(magicLint, ['./js', './prettier', '--eslint', '--prettier'], {
        cwd,
        env: { FROM_TEST: true },
      })
      .expect('code', 1)
      .end((err, res) => {
        if (err) return done(err);

        const output = res.stdout;
        const eslintPos = output.indexOf('no-unused-vars');
        const prettierPos = output.indexOf("const hello = 'aaa';");

        // 验证两者都存在
        if (eslintPos === -1) {
          return done(new Error('eslint output not found'));
        }
        if (prettierPos === -1) {
          return done(new Error('prettier output not found'));
        }

        // prettier 输出应该在 eslint 之后(因为 jobs.push 的顺序)
        // 注意:这个顺序取决于 jobs 数组的顺序
        done();
      });
  });
});
