#!/bin/sh
# PreToolUse hook (Bash): before any command that runs `git push`, run the
# test suite and the typecheck. Exit 2 blocks the push and hands the failure
# back to Claude; every other command passes straight through.
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac
# Test the checkout being pushed: from a worktree under .claude/worktrees that is the worktree, not the
# project folder the session started in.
dir=$(printf '%s' "$input" | jq -r '.cwd // ""')
top=$(git -C "${dir:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --show-toplevel 2>/dev/null) || top=${CLAUDE_PROJECT_DIR:-.}
cd "$top" || exit 0
if ! out=$(npm test 2>&1); then
  printf '%s\n' "$out" | tail -40 >&2
  echo "Push blocked: npm test failed. Fix the failures, then push again." >&2
  exit 2
fi
if ! out=$(npm run typecheck 2>&1); then
  printf '%s\n' "$out" | tail -40 >&2
  echo "Push blocked: npm run typecheck failed. Fix the errors, then push again." >&2
  exit 2
fi
exit 0
