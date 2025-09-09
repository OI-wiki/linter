import 'log-timestamp';
import { Octokit } from "@octokit/core";
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
const asyncExec = promisify(exec);

// 颜色池 - 不同PR用不同颜色
const colorPool = [
  '\x1b[91m',  // 亮红
  '\x1b[92m',  // 亮绿  
  '\x1b[93m',  // 亮黄
  '\x1b[94m',  // 亮蓝
  '\x1b[95m',  // 亮紫
  '\x1b[96m',  // 亮青
  '\x1b[31m',  // 红色
  '\x1b[32m',  // 绿色
  '\x1b[33m',  // 黄色
  '\x1b[34m',  // 蓝色
  '\x1b[35m',  // 紫色
  '\x1b[36m'   // 青色
];

const prColors = new Map(); // PR颜色映射

const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
});

const runningLints = new Map();


import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET
})

webhooks.onError((error) => {
  console.log(`Error occured in "${error.event.name} handler: ${error.stack}"`)
})

async function approveWithComment(owner, repo, number, comment) {
  await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
    owner: owner,
    repo: repo,
    pull_number: number,
    body: comment,
    event: 'APPROVE'
  })
}

async function postReactions(owner, repo, comment_id, content) {
  await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
    owner: owner,
    repo: repo,
    comment_id: comment_id,
    content: content
  })
}

// 根据PR number获取颜色
function getPrColor(prKey) {
  if (!prColors.has(prKey)) {
    // 基于PR number哈希选择颜色
    const prNumber = parseInt(prKey.split('#')[1]) || 0;
    const colorIndex = prNumber % colorPool.length;
    prColors.set(prKey, colorPool[colorIndex]);
  }
  return prColors.get(prKey);
}

// 根据commit hash获取颜色
function getCommitColor(commitHash) {
  if (!commitHash) return '\x1b[90m'; // 灰色用于空hash
  // 基于commit hash前6字符的哈希选择颜色
  let hashValue = 0;
  for (let i = 0; i < Math.min(6, commitHash.length); i++) {
    hashValue = (hashValue << 5) - hashValue + commitHash.charCodeAt(i);
    hashValue |= 0; // 转换为32位整数
  }
  const colorIndex = Math.abs(hashValue) % colorPool.length;
  return colorPool[colorIndex];
}

async function execLint(owner, repo, branch, number, commitHash = '') {
  const prKey = `${owner}/${repo}#${number}`;
  const prColor = getPrColor(prKey);
  const commitColor = getCommitColor(commitHash);
  const commitDisplay = commitHash ? `@${commitHash.substring(0, 7)}` : '@unknown';
  
  // Cancel existing lint operation for the same PR if running
  if (runningLints.has(prKey)) {
    console.log(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[33m[CANCEL]\x1b[0m Cancelling existing lint operation`);
    const existingProcess = runningLints.get(prKey);
    try {
      existingProcess.kill('SIGTERM');
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!existingProcess.killed) {
        existingProcess.kill('SIGKILL');
      }
    } catch (err) {
      console.error(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[31m[ERROR]\x1b[0m Error killing existing process:`, err);
    }
    runningLints.delete(prKey);
  }

  try {
    console.log(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[36m[START]\x1b[0m Starting lint process`);
    
    // Create new process with improved tracking
    const childProcess = exec(`bash ./lint.sh ${owner} ${repo} ${branch} ${number} ${commitHash}`, {
      env: {
        'GH_TOKEN': process.env.GH_TOKEN,
        ...process.env
      }, uid: 0, maxBuffer: 1024 * 500
    });
    
    // Track the running process
    runningLints.set(prKey, childProcess);
    
    // Handle process completion
    childProcess.on('exit', (code, signal) => {
      if (code === 0) {
        console.log(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[32m[DONE]\x1b[0m Lint process completed successfully`);
      } else {
        console.log(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[31m[FAILED]\x1b[0m Lint process exited with code ${code}, signal ${signal}`);
      }
      runningLints.delete(prKey);
    });
    
    childProcess.on('error', (err) => {
      console.error(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[31m[ERROR]\x1b[0m Lint process error:`, err);
      runningLints.delete(prKey);
    });
    
    // Wait for process to complete
    await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data;
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            console.log(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m ${line}`);
          }
        });
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data;
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            console.error(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m ${line}`);
          }
        });
      });
      
      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
      
      childProcess.on('error', reject);
    });
    
    console.log(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[32m[FINISH]\x1b[0m Lint completed successfully`);
    return true;
  } catch (err) {
    console.error(`${prColor}[${prKey}]\x1b[0m${commitColor}[${commitDisplay}]\x1b[0m \x1b[31m[ERROR]\x1b[0m Lint failed:`, err);
    runningLints.delete(prKey);
    return false;
  }
}

webhooks.on(['push', 'pull_request.opened', 'pull_request.synchronize', 'pull_request.review_requested'], async ({ name, payload }) => {
  const push = payload;
  const skipInTitle = push.pull_request.title.indexOf('[lint skip]') >= 0;
  const skipSelf = push.sender.login == "24OI-bot";
  if (push.pull_request && !skipInTitle && !skipSelf) {
    console.log(name, 'pr event received', push.pull_request.html_url);
    if (push.pull_request.review_requested && push.pull_request.requested_reviewers && !push.pull_request.requested_reviewers.includes("24OI-bot")) {
      return;
    }
    const pr_owner = push.pull_request.head.user.login;
    const pr_repo = push.pull_request.head.repo.name;
    const head_branch = push.pull_request.head.ref;
    const pr_number = push.number;
    const commit_hash = push.pull_request.head.sha || '';
    const commitColor = getCommitColor(commit_hash);
    const commitDisplay = commit_hash ? `@${commit_hash.substring(0, 7)}` : '@unknown';
    console.log(`${commitColor}[${commitDisplay}]\x1b[0m lint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
    await execLint(pr_owner, pr_repo, head_branch, pr_number, commit_hash)
  } else {
    console.log(`lint skipped`);
  }
})

webhooks.on(
  [
    "issue_comment.created",
    "issue_comment.deleted",
    "issue_comment.edited",
  ],
  async ({ name, payload }) => {
    console.log(name, "issue event received");
    const comment_body = payload.comment.body;
    if (comment_body.includes("@24OI-bot") && comment_body.includes("please")) {
      const api_url = payload.issue.pull_request.url;
      try {
        await postReactions('OI-wiki', 'OI-wiki', payload.comment.id, 'eyes');
      } catch (err) {
        console.error(err)
      }
      const text = await fetch(api_url, {
        headers: {
          'Authorization': `token ${process.env.GH_TOKEN}`,
          'User-Agent': '24OI-bot'
        }
      }).then((res) => res.text());
      const json = JSON.parse(text);
      const pr_owner = json.head.user.login;
      const pr_repo = json.head.repo.name;
      const head_branch = json.head.ref;
      const pr_number = json.number;
      const commit_hash = json.head.sha || '';
      const commitColor = getCommitColor(commit_hash);
      const commitDisplay = commit_hash ? `@${commit_hash.substring(0, 7)}` : '@unknown';
      console.log(
        `${commitColor}[${commitDisplay}]\x1b[0m manual relint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`
      );
      const success = await execLint(pr_owner, pr_repo, head_branch, pr_number, commit_hash);
      if (success) {
        try {
          postReactions('OI-wiki', 'OI-wiki', payload.comment.id, '+1');
        } catch (err) {
          console.error(err)
        }
      }
    } else {
      console.log('issue event skipped')
    }
  }
);

const port = 3000;

const middleware = createNodeMiddleware(webhooks, { path: "/" });
createServer()
  .on("error", (err) => {
    console.error(err);
  })
  .on("listening", () => {
    console.log(`Listening on port ${port}`);
  })
  .on("request", async (req, res) => {
    console.log(req.method, req.url);
    if (req.url === "/health") {
      res.statusCode = 200;
      res.end("Hello, world!");
    } else if (req.url === "/") {
      // log each request with timestamp
      await middleware(req, res);
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  })
  .on("close", () => {
    console.log("Server closed");
  })
  .listen(port);

