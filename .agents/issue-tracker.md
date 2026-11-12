# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `SchildW3rk/OwnShell`. Use the `gh` CLI from this clone; it infers the repository from the Git remote.

## Conventions

- Create: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- Read: `gh issue view <number> --comments`; fetch labels and filter comments as needed.
- List: `gh issue list --state open --json number,title,body,labels,comments`, with appropriate label and state filters.
- Comment: `gh issue comment <number> --body "..."`
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`
- Sub-issues: with gh 2.94+, use `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>`. With older versions, use `gh api --method POST repos/SchildW3rk/OwnShell/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`. Where sub-issues are unavailable, add the child to a task list in the parent and put `Part of #<parent>` at the top of the child body.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", run `gh issue view <number> --comments`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

When set to yes, use `gh pr view <number> --comments` and `gh pr diff <number>` to read requests, and the `gh pr comment`, `gh pr edit`, and `gh pr close` equivalents to act on them.

List external PRs with:
`gh api --paginate 'repos/SchildW3rk/OwnShell/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`

Issues and PRs share a number space. For an ambiguous reference, try `gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding operations

Used by `/wayfinder`. A map is one issue with child issues as tickets.

- Map: label `wayfinder:map`; body contains Notes, Decisions-so-far, and Fog.
- Child: link as a sub-issue, or use the parent task-list fallback above. Label `wayfinder:<type>` where type is research, prototype, grilling, or task.
- Blocking: use native issue dependencies:
  `gh api --method POST repos/SchildW3rk/OwnShell/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Obtain the database ID with `gh api repos/SchildW3rk/OwnShell/issues/<number> --jq .id`; it is not the issue number or node ID.
  Where dependencies are unavailable, put `Blocked by: #<number>, #<number>` at the top of the child body.
- Frontier: inspect the map's open children in map order; skip assigned tickets and tickets with open blockers. Native `issue_dependencies_summary.blocked_by` counts open blockers; for the fallback, inspect each referenced issue's state.
- Claim: `gh issue edit <number> --add-assignee @me`, the session's first write.
- Resolve: comment with the answer, close the child, then append a gist and link to the map's Decisions-so-far.
