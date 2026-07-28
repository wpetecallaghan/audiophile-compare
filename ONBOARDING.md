# Welcome to the Audiophile Compare Team

## How We Use Claude

Based on Pete Callaghan's usage over the last 30 days:

Work Type Breakdown:
  Improve Quality  █████████████████████████░░░░░░░░░░░░░  40%
  Debug Fix        ███████████████████░░░░░░░░░░░░░░░░░░░  30%
  Build Feature    █████████████░░░░░░░░░░░░░░░░░░░░░░░░░  20%
  Plan Design      ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10%

Top Skills & Commands:
  /clear           ████████████████████████████████████████  19x/month
  /insights        ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  2x/month
  /audit           ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1x/month
  /compact         ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1x/month
  /reload-skills   ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1x/month
  /model           ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  _None configured yet._

## Your Setup Checklist

### Codebases
- [ ] audiophile-compare — https://github.com/wpetecallaghan/audiophile-compare

### MCP Servers to Activate
_None in use yet — nothing to activate here._

### Skills to Know About
- `/audit` — full-surface pattern migration audit (`.claude/skills/audit`). Give it a pattern to standardize (e.g. a repeated literal or color class), it ripgreps the whole repo for every occurrence, confirms scope with you, migrates all of it, then re-runs the same ripgrep to prove zero remaining occurrences. This is how repeated-literal cleanups (see `__claude_context__/repeated-string-constants.md`) get done here.
- `/clear` — by far the most-used command (19x/month). Start a fresh session between unrelated tasks rather than letting context balloon.
- `/insights`, `/compact`, `/reload-skills`, `/model` — standard Claude Code mechanics, not project-specific; see Claude Code's own docs if you haven't used them before.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
