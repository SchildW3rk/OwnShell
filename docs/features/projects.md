# Projects & Git

A **project** is a Git repository on one of your servers. It ties a saved SSH host, the repository path on that host and, optionally, a Docker Compose project together in one view.

![Project view with highlighted code](/screenshots/projects-git.png)

## Creating a project

Create a project with a name, a host, the repository path and optionally the compose project name. OwnShell can also suggest projects from the compose labels of running containers on a host.

## How it works

All Git commands run **on the server** over SSH (`git -C <path> …`). Nothing is cloned to your Mac, and you need `git` on the server. The **Overview** shows ready-to-copy `git clone ssh://…` and `git remote add` commands if you want a local copy.

## Sections

- **Overview**: current branch (or detached HEAD), upstream with ahead/behind counts, changed files and the last commit.
- **Code**: file tree and syntax-highlighted files of the **committed `HEAD`** (not uncommitted changes). ⌘P opens quick open, ⌘F searches in the file. Files up to 1 MB are shown.
- **Changes**: the working tree diff in unified or split view, with syntax highlighting and word-level marks. Stage and unstage files and commit with a message.
- **History**: commits, 50 per page, searchable by message or author. Open a commit to see the changed files and its diff.
- **Branches**: local and remote branches with ahead/behind counts. Create, switch and delete branches. Checking out a remote branch creates a local tracking branch. Switching needs a clean working tree.

![Split diff with word-level highlighting](/screenshots/projects-diff.png)

OwnShell does not push, pull, fetch or merge. Run those in the terminal.

If the path has no repository yet, OwnShell can run `git init` (branch `main`) there.

## Compose status

With a compose project set, the project shows how many of its containers are running. A button jumps to the host's **Docker** tab.
