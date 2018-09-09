const remark = require('remark');
const rguide = require('remark-preset-lint-markdown-style-guide');
const rpangu = require('remark-pangu');
const rmath = require('remark-math');
const rline = require('remark-lint-final-newline');
const rtab = require('remark-lint-no-tabs');
const cbs = require("remark-lint-code-block-style");
const mll = require("remark-lint-maximum-line-length");
const olm = require("remark-lint-ordered-list-marker-value");


/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */
module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  app.on(['push', 'pull_request.opened', 'pull_request.synchronize'], async context => {
    console.log(context.payload.installation.id)

    const asApp = await app.auth()
    const forkInstallation = await asApp.apps.findRepoInstallation({ owner: 'Ir1d', repo: 'OI-wiki' })
    console.log(forkInstallation.data.id)

    const push = context.payload

    const compare = await context.github.repos.compareCommits(context.repo({
      base: push.pull_request.base.sha,
      head: push.pull_request.head.sha
    }))

    const head_branch = push.pull_request.head.ref;

    return Promise.all(compare.data.files.map(async file => {
      if (file.filename.endsWith('.md')) {
        const content = await context.github.repos.getContent({
          path: file.filename,
          owner: push.pull_request.head.user.login,
          repo: push.pull_request.head.repo.name
        })
        const text = Buffer.from(content.data.content, 'base64').toString()
        // console.log(typeof text)
        // console.log(typeof rmath)
        remark()
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
          .process(text, (err, outputs) => {
            if (err) {
              throw new Error(err)
            }
            // console.log(file.filename);
            // console.log(outputs);
            return Promise.all([outputs].map(output => {
              // console.log('??' + output);
              // console.log(typeof output);
              context.github.repos.updateFile(context.repo({
                path: file.filename,
                message: `style: fix lint errors for ${file.filename}`,
                content: output.toString('base64'),
                sha: content.data.sha,
                branch: head_branch,
                author: {
                  name: '24OI-bot',
                  email: '15963390+24OI-bot@users.noreply.github.com'
                }
              }), (err, res) => {
                if (err) {
                  throw new Error(err)
                }
                console.log(res);
              })
            }))
          })
      }
    }))
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
