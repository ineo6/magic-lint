const cp = require('child_process');
const debug = require('debug')('magic-lint:fork');

// 管理所有子进程,用于优雅退出
const childs = new Set();
let hadHook = false;

function gracefull(proc) {
  childs.add(proc);

  if (!hadHook) {
    hadHook = true;
    let signal;
    ['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach((event) => {
      process.once(event, () => {
        signal = event;
        process.exit(0);
      });
    });

    process.once('exit', () => {
      for (const child of childs) {
        debug('kill child %s with %s', child.pid, signal);
        child.kill(signal);
      }
    });
  }
}

/**
 * fork 子进程并捕获输出,避免并行执行时输出混合
 * @param {String} modulePath - bin 路径
 * @param {Array} args - 参数
 * @param {Object} options - 选项
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function forkNodeWithOutput(modulePath, args = [], options = {}) {
  const spawnOptions = { ...options };

  // 使用 spawn 代替 fork,这样可以正确捕获 stdout 和 stderr
  // fork 使用 IPC 通道,不会有 stdio 流
  spawnOptions.stdio = spawnOptions.stdio || ['inherit', 'pipe', 'pipe'];

  debug('Run spawn `%s %s %s`', process.execPath, modulePath, args.join(' '));

  // 使用 spawn 执行 node 进程
  const proc = cp.spawn(process.execPath, [modulePath, ...args], spawnOptions);
  gracefull(proc);

  let stdout = '';
  let stderr = '';

  // 收集 stdout
  if (proc.stdout) {
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
  }

  // 收集 stderr
  if (proc.stderr) {
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
  }

  const promise = new Promise((resolve, reject) => {
    proc.once('exit', (code) => {
      childs.delete(proc);

      if (code !== 0) {
        const err = new Error(`${modulePath} ${args.join(' ')} exit with code ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ code, stdout, stderr });
      }
    });
  });

  promise.proc = proc;
  return promise;
}

/**
 * 并行执行多个 fork 任务,按顺序输出结果
 * @param {Array<Promise>} jobs - forkNodeWithOutput 返回的 Promise 数组
 * @param {Object} options - 选项
 * @param {Array<string>} options.labels - 每个任务的标签(可选)
 * @param {boolean} options.withSeparator - 是否显示分隔符(默认: false)
 * @returns {Promise<Array>}
 */
async function runJobsWithSequentialOutput(jobs, options = {}) {
  const { labels = [], withSeparator = false } = options;

  debug('Running %d jobs', jobs.length);

  if (jobs.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(jobs);

  // 按顺序输出每个任务的结果
  results.forEach((result, index) => {
    debug('Job %d result:', index, result.status);

    let stdout = '';
    let stderr = '';
    let hasOutput = false;

    // 提取输出内容
    if (result.status === 'fulfilled') {
      stdout = result.value.stdout;
      stderr = result.value.stderr;
      hasOutput = !!(stdout || stderr);
    } else {
      const error = result.reason;
      stdout = error.stdout || '';
      stderr = error.stderr || '';
      hasOutput = !!(stdout || stderr);
    }

    // 如果有输出且需要分隔符,在任务输出前显示
    if (withSeparator && hasOutput) {
      const label = labels[index] || `Task ${index + 1}`;
      const separator = '─'.repeat(80);

      // 添加上方分隔
      if (index === 0) {
        process.stdout.write(`\n`);
      }

      // 显示工具标签
      process.stdout.write(`\n${separator}\n`);
      process.stdout.write(`\x1b[1m\x1b[36m▶ ${label}\x1b[0m`);

      // 添加工具特定的提示信息
      const toolName = label.toLowerCase();
      if (toolName.includes('prettier')) {
        process.stdout.write(`\x1b[2m (所有问题都需要修复)\x1b[0m`);
      } else if (toolName.includes('eslint')) {
        process.stdout.write(`\x1b[2m (只有 error 需要修复, warnings 可选)\x1b[0m`);
      } else if (toolName.includes('stylelint')) {
        process.stdout.write(`\x1b[2m (所有问题都需要修复)\x1b[0m`);
      }

      process.stdout.write(`\n${separator}\n\n`);
    }

    // 输出结果
    if (result.status === 'fulfilled') {
      debug('stdout length:', stdout.length, 'stderr length:', stderr.length);
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    } else {
      const error = result.reason;
      debug('error:', error.message);
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
  });

  return results;
}

module.exports = {
  forkNodeWithOutput,
  runJobsWithSequentialOutput,
};
