import 'log-timestamp';
import { Octokit } from "@octokit/core";
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
const asyncExec = promisify(exec);

const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
});


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

async function execLint(owner, repo, branch, number) {
  try {
    const { stdout, stderr } = await asyncExec(`bash ./lint.sh ${owner} ${repo} ${branch} ${number}`, {
      env: {
        'GH_TOKEN': process.env.GH_TOKEN,
        ...process.env
      }, uid: 0, maxBuffer: 1024 * 500
    });
    console.log(`lint finishes for ${owner}/${repo}#${number}`);
    console.log(stdout);
    console.error(stderr);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

let env_variables = 'PATH=' + process.env.PATH;

webhooks.on(['push', 'pull_request.opened', 'pull_request.synchronize', 'pull_request.review_requested'], async ({ id, name, payload }) => {
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
    console.log(`lint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
    await execLint(pr_owner, pr_repo, head_branch, pr_number)
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
  async ({ id, name, payload }) => {
    console.log(name, "issue event received");
    const comment_body = payload.comment.body;
    if (comment_body.includes("@24OI-bot") && comment_body.includes("please")) {
      const api_url = payload.issue.pull_request.url;
      try {
        await postReactions('OI-wiki', 'OI-wiki', payload.comment.id, 'eyes');
      } catch (err) {
        console.error(err)
      }
      const text = await fetch(api_url).then((res) => res.text());
      const json = JSON.parse(text);
      const pr_owner = json.head.user.login;
      const pr_repo = json.head.repo.name;
      const head_branch = json.head.ref;
      const pr_number = json.number;
      console.log(
        `manual relint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`
      );
      const success = await execLint(pr_owner, pr_repo, head_branch, pr_number);
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

