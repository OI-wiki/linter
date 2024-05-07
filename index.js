require('log-timestamp');
// const Octokit = require('@octokit/rest')()
const { Octokit } = require("@octokit/core");
const fetch = require('node-fetch');
const remark = require('remark');

// Octokit.authenticate({
//   type: 'token',
//   token: process.env.GH_TOKEN
// })

const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
});


const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
// const { Webhooks } = require('@octokit/webhooks')
const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET
})

// webhooks.on('error', (error) => {
//  console.log(`Error occured in "${error.event.name} handler: ${error.stack}"`)
// })

webhooks.onError((error) => {
  console.log(`Error occured in "${error.event.name} handler: ${error.stack}"`)
})


const { exec } = require('child_process');

let env_variables = 'PATH=' + process.env.PATH;

webhooks.on(['push', 'pull_request.opened', 'pull_request.synchronize', 'pull_request.review_requested'], async ({ id, name, payload }) => {
  const push = payload;
  if (push.pull_request && push.pull_request.title.indexOf('[lint skip]') < 0 && push.sender.login != "24OI-bot") {
    console.log(name, 'pr event received', push.pull_request.html_url);
    if (push.pull_request.review_requested && push.pull_request.requested_reviewers && !push.pull_request.requested_reviewers.includes("24OI-bot")) {
      return;
    }
    const pr_owner = push.pull_request.head.user.login;
    const pr_repo = push.pull_request.head.repo.name;
    const head_branch = push.pull_request.head.ref;
    const pr_number = push.number;
    console.log(`lint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
    exec(env_variables + `bash ./lint.sh ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`, { env: { 'GH_TOKEN': process.env.GH_TOKEN }, uid: 0, maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`lint finishes ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
    });
    try {
      await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
        owner: 'OI-wiki',
        repo: 'OI-wiki',
        pull_number: pr_number,
        body: 'Lint finished, ready for review :)',
        event : 'APPROVE'
      })
    } catch (err) {
      console.error(err)
    }
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
        await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
          owner: 'OI-wiki',
          repo: 'OI-wiki',
          comment_id: payload.comment.id,
          content: 'eyes'
        })
      } catch (err) {
        console.error(err)
      }
      fetch(api_url)
        .then((res) => res.text())
        .then((text) => {
          const json = JSON.parse(text);
          const pr_owner = json.head.user.login;
          const pr_repo = json.head.repo.name;
          const head_branch = json.head.ref;
          const pr_number = json.number;
          console.log(
            `manual relint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`
          );
          exec(
            env_variables +
            `bash ./lint.sh ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`,
            {
              env: { GH_TOKEN: process.env.GH_TOKEN },
              uid: 0,
              maxBuffer: 1024 * 500,
            },
            async (error, stdout, stderr) => {
              if (error) {
                console.error(`exec error: ${error}`);
                try {
                  await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
                    owner: 'OI-wiki',
                    repo: 'OI-wiki',
                    comment_id: payload.comment.id,
                    content: 'confused'
                  })
                } catch (err) {
                  console.error(err)
                }
                return;
              }
              console.log(
                `manual relint finishes ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`
              );
              try {
                await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
                  owner: 'OI-wiki',
                  repo: 'OI-wiki',
                  comment_id: payload.comment.id,
                  content: '+1'
                })
              } catch (err) {
                console.error(err)
              }
            }
          );
        });
    } else {
      console.log('issue event skipped')
    }
  }
);

const port = 3000;

const middleware = createNodeMiddleware(webhooks, { path: "/" });
require("http").createServer()
  .on("error", (err) => {
    console.error(err);
  })
  .on("listening", () => {
    console.log(`Listening on port ${port}`);
  })
  .on("request", async (req, res) => {
    if (req.url === "/health") {
      res.statusCode = 200;
      res.end("Hello, world!");
      res.end();
    } else {
      await middleware(req, res);
    }
  })
  .listen(port);

