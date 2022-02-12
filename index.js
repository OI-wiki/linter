require('log-timestamp');
const octokit = require('@octokit/rest')()
const remark = require('remark');
const rguide = require('remark-preset-lint-markdown-style-guide');
const rpangu = require('remark-pangu');
const rmath = require('remark-math');
const rline = require('remark-lint-final-newline');
const rtab = require('remark-lint-no-tabs');
const cbs = require("remark-lint-code-block-style");
const mll = require("remark-lint-maximum-line-length");
const olm = require("remark-lint-ordered-list-marker-value");

octokit.authenticate({
  type: 'token',
  token: process.env.GH_TOKEN
})

const myremark = remark()
  .use(rpangu)
  .use({
    plugins: [rguide, [cbs, false],
      [mll, false],
      [olm, "ordered"]]
  })
  .use(rmath)
  .use(rline)
  .use(rtab)
  .use({
    "settings": {
      "listItemIndent": "mixed"
    }
  })


const WebhooksApi = require('@octokit/webhooks')
const webhooks = new WebhooksApi({
  secret: process.env.WEBHOOK_SECRET
})

webhooks.on('error', (error) => {
  console.log(`Error occured in "${error.event.name} handler: ${error.stack}"`)
})


const { exec } = require('child_process');

let env_variables = 'PATH=' + process.env.PATH;

webhooks.on(['push', 'pull_request.opened', 'pull_request.synchronize'], async ({ id, name, payload }) => {
  console.log(name, 'pr event received');
  const push = payload;
  if (push.pull_request && push.pull_request.title.indexOf('[lint skip]') < 0 && push.sender.login != "24OI-bot") {
    const pr_owner = push.pull_request.head.user.login;
    const pr_repo = push.pull_request.head.repo.name;
    const head_branch = push.pull_request.head.ref;
    const pr_number = push.number;
    console.log(`lint starts ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
    exec(env_variables + `bash ./lint.sh ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`, { env: { 'GH_TOKEN': process.env.GH_TOKEN }, uid: 0, maxBuffer: 1024 * 500}, (error, stdout, stderr) => {
      if(error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`lint finishes ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
    });
  } else {
    console.log(`lint skipped ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`);
  }
})

webhooks.on(
  [
    "issue_comment.created",
    "issue_comment",
    "issue_comment.deleted",
    "issue_comment.edited",
  ],
  async ({ id, name, payload }) => {
    console.log(name, "issue event received");
    const comment_body = payload.comment.body;
    if (comment_body.includes("@24OI-bot") && comment_body.includes("please")) {
      const api_url = payload.issue.pull_request.url;
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
            (error, stdout, stderr) => {
              if (error) {
                console.error(`exec error: ${error}`);
                return;
              }
              console.log(
                `manual relint finishes ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`
              );
            }
          );
        });
    }
  }
);

require('http').createServer(webhooks.middleware).listen(3000)

