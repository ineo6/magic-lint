'use strict';

const path = require('path');
const coffee = require('coffee');

describe('test lint command', () => {
  const magicLint = path.resolve('./bin/magic-lint');
  const cwd = path.join(__dirname, 'fixture/lint/');

  it('lint js', done => {
    coffee
      .fork(magicLint, ['./js', '--eslint'], { cwd })
      .expect('stdout', /no-unused-vars/)
      .expect('stdout', /1 error/)
      .expect('code', 1)
      .end(done);
  });

  it('lint js with sub options', done => {
    coffee
      .fork(magicLint, ['./js', '--eslint.quiet'], { cwd })
      .expect('stdout', /✖ 1 problem \(1 error, 0 warnings\)/)
      .expect('code', 1)
      .end(done);
  });

  it('lint ts with eslint', done => {
    coffee
      .fork(magicLint, ['./ts', '--eslint.ext', '.ts,.tsx'], { cwd })
      .expect('stdout', /An empty interface is equivalent to /)
      .expect('stdout', /Prefer using an optional chain expression instead, /)
      .expect('stdout', /✖ 2 problems \(2 errors, 0 warnings\)/)
      .expect('code', 1)
      .end(done);
  });

  it('lint style', done => {
    coffee
      .fork(magicLint, ['./style', '--stylelint'], { cwd })
      .expect(
        'stdout',
        /✖  Unexpected missing generic font family  font-family-no-missing-generic-family-keyword/
      )
      .expect('code', 2)
      .end(done);
  });

  it('lint style with sub options', done => {
    coffee
      .fork(magicLint, ['./style', '--stylelint', '-s.formatter', 'json'], { cwd })
      .expect('stdout', /"text":"Unexpected missing generic font family/)
      .expect('code', 2)
      .end(done);
  });

  it('use prettier', done => {
    coffee
      .fork(magicLint, ['./prettier', '--prettier', '--eslint', false], {
        cwd,
        env: { FROM_TEST: true }
      })
      .expect('stdout', /const hello = 'aaa';/)
      .expect('code', 0)
      .end(done);
  });

  it('use prettier with sub options', done => {
    coffee
      .fork(magicLint, ['./prettier', '--prettier', '--eslint', false, '-p.no-semi'], {
        cwd,
        env: { FROM_TEST: true }
      })
      .expect('stdout', /const hello = 'aaa'/)
      .expect('code', 0)
      .end(done);
  });
});
