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

    const branch = push.ref.replace('refs/heads/', '');

    return Promise.all(compare.data.files.map(async file => {
      if (file.filename.endsWith('.md')) {
        const content = await context.github.repos.getContent(context.repo({
          path: file.filename,
          ref: branch
        }))
        const text = Buffer.from(content.data.content, 'utf-8').toString()
        remark()
          .use(rpangu)
          .use({
            plugins: [rguide, [[require("remark-lint-code-block-style"), false],
            [require("remark-lint-maximum-line-length"), false],
            [require("remark-lint-ordered-list-marker-value"), "ordered"]]]
          })
          .use(rmath)
          .use(rline)
          .use(rtab)
          .process(text, (err, output) => {
            if (err) {
              throw new Error(err)
            }
            return Promise.all(
              context.github.repos.updateFile(context.repo({
                path: file.filename,
                message: `Fix lint errors for ${file.filename}`,
                content: Buffer.from(output).toString('utf-8'),
                sha: content.data.sha,
                branch,
                name: '24OI-bot',
                email: '15963390+24OI-bot@users.noreply.github.com'
              })
              ))
          })
      }
    }))
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
