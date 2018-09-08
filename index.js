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

  app.on(['push', 'pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'], async context => {
    const push = context.payload

    const compare = await context.github.repos.compareCommits(context.repo({
      base: push.before,
      head: push.after
    }))

    const branch = push.pull_request.head.ref;

    return Promise.all(compare.data.files.map(async file => {
      if (file.filename.endsWith('.md')) {
        const content = await context.github.repos.getContent({
          path: file.filename,
          owner: push.pull_request.head.user.login,
          repo: push.pull_request.head.repo.name
        })
        const text = Buffer.from(content.data.content, 'utf-8').toString()
        console.log(typeof text)
        console.log(typeof rmath)
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
          .process(text, (err, output) => {
            if (err) {
              throw new Error(err)
            }
            return Promise.all([
              context.github.repos.updateFile(context.repo({
                path: file.filename,
                message: `style: fix lint errors for ${file.filename}`,
                content: Buffer.from(output).toString('utf-8'),
                sha: content.data.sha,
                branch,
                name: '24OI-bot',
                email: '15963390+24OI-bot@users.noreply.github.com'
              })
            )])
          })
      }
    }))
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
