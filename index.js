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

webhooks.on(['push', 'pull_request.opened', 'pull_request.synchronize', 'pull_request.review_requested'], async ({ id, name, payload }) => {
  const push = payload;
  if (push.pull_request && push.pull_request.title.indexOf('[lint skip]') < 0 && push.sender.login != "24OI-bot") {
  	console.log(name, 'event received', push.pull_request.html_url);
		if (push.pull_request.review_requested && push.pull_request.requested_reviewers && !push.pull_request.requested_reviewers.includes("24OI-bot")) {
			return;
		}
    const pr_owner = push.pull_request.head.user.login;
    const pr_repo = push.pull_request.head.repo.name;
    const head_branch = push.pull_request.head.ref;
    const pr_number = push.number;
    console.log('lint starts');
    exec(env_variables + `bash ./lint.sh ${pr_owner} ${pr_repo} ${head_branch} ${pr_number}`, { env: { 'GH_TOKEN': process.env.GH_TOKEN }, uid: 0, maxBuffer: 1024 * 500}, (error, stdout, stderr) => {
      // console.log(`stdout: ${stdout}`);
      // console.log(`stderr: ${stderr}`);
      if(error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log('lint finishes');
    });
  } else {
    console.log('lint skipped');
  }

  // const compare = await octokit.repos.compareCommits({
  //   owner: push.pull_request.base.user.login,
  //   repo: push.pull_request.base.repo.name,
  //   base: push.pull_request.base.sha,
  //   head: push.pull_request.head.sha
  // })

  // compare.data.files.map(async file => {
  //   if (file.filename.endsWith('.md')) {
  //     const content = await octokit.repos.getContent({
  //       path: file.filename,
  //       owner: push.pull_request.head.user.login,
  //       repo: push.pull_request.head.repo.name
  //     })
  //     const text = Buffer.from(content.data.content, 'base64').toString()
  //     // console.log(typeof text)
  //     // console.log(typeof rmath)
  //     console.log(file.filename);
  //     myremark.process(text, (err, outputs) => {
  //       if (err) {
  //         throw new Error(err)
  //       }
  //       // console.log(outputs);
  //       console.log({
  //         owner: push.pull_request.head.user.login,
  //         repo: push.pull_request.head.repo.name,
  //         path: file.filename,
  //         message: `style: fix lint errors for ${file.filename}`,
  //         content: outputs.toString('base64'),
  //         sha: content.data.sha,
  //         branch: head_branch,
  //         author: {
  //           name: '24OI-bot',
  //           email: '15963390+24OI-bot@users.noreply.github.com'
  //         }
  //       })
  //       return Promise.all([outputs].map(output => {
  //         // console.log('??' + output);
  //         // console.log(typeof output);
  //         octokit.repos.updateFile({
  //           owner: push.pull_request.head.user.login,
  //           repo: push.pull_request.head.repo.name,
  //           path: file.filename,
  //           message: `style: fix lint errors for ${file.filename}`,
  //           content: output.toString('base64'),
  //           sha: content.data.sha,
  //           branch: head_branch,
  //           author: {
  //             name: '24OI-bot',
  //             email: '15963390+24OI-bot@users.noreply.github.com'
  //           }
  //         }, (err, res) => {
  //           if (err) {
  //             throw new Error(err)
  //           }
  //           console.log(res);
  //         })
  //       }))
  //     })
  //   }
  // })
})

require('http').createServer(webhooks.middleware).listen(3000)

