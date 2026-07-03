# Scheduling the daily post run — Claude, Cursor, Codex

The job is always the same: run the prompt in
[`../../scripts/daily-generate.md`](../../scripts/daily-generate.md) once a day. It
researches, writes one post per platform, and pushes each (the push script reads
`PORTAL_URL` + `PORTAL_API_TOKEN` from `.env`).

Each of the three tools gives you **two** ways to schedule it:
- a **native scheduler** (GUI / cloud), and
- a **cron job** on an always-on machine that drives the tool's **headless CLI**.

> Exact CLI flags move fast — run `<tool> --help` to confirm against your installed
> version. Commands below reflect the 2026 docs.

Common cron rules (apply to all three):
- Use **absolute paths** and `cd` into the repo first, so `.env` and the skills are found.
- The machine must be **awake** at run time (a laptop that's asleep won't fire cron —
  use an always-on box, or `caffeinate`/`pmset` on macOS).
- Edit your crontab with `crontab -e`; log output to a file for debugging.

---

## 1. Claude

### Native — Cowork scheduled task (easiest, but note the network caveat)
In the Claude desktop app (Cowork): create a **scheduled task**, set the cadence (e.g.
daily 8:00 am), and paste the contents of `scripts/daily-generate.md` as the prompt.
Run it in the repo folder with web access on. No cron, no terminal.

> ⚠️ **Cowork runs behind a network egress allowlist**, so the push to your portal is
> blocked by default (the task will research + draft but fail to push). Fix it by
> allowlisting your portal domain:
>
> - **Claude desktop (incl. Pro):** Settings → **Allow network egress** → under
>   **Domain allowlist** keep **"None"** (= only the domains you list) and **add**
>   `reputr-marketing.netlify.app` to *Additional allowed domains*. `WebSearch` still
>   works under "None"; choose **"All domains"** only if the agent must fetch arbitrary
>   pages from the sandbox during research.
> - **Team/Enterprise:** the same control lives in Organization settings → Capabilities →
>   Code execution → Allow network egress.
>
> Network settings apply to **new sessions**, so recreate the scheduled task after
> changing them. (Alternatively, the **cron + `claude -p`** path below has no such
> restriction.)

### Cron — Claude Code headless (`claude -p`)
`-p`/`--print` runs one prompt and exits; `--allowedTools` pre-authorizes tools so it
never pauses for permission.

```cron
# daily at 08:00 — generate + push via Claude Code
0 8 * * * cd /Users/you/reputr/marketing && \
  claude -p "$(cat scripts/daily-generate.md)" \
    --allowedTools "Read" "WebSearch" "Bash(node scripts/push-post.mjs *)" \
    >> /tmp/reputr-claude.log 2>&1
```

(For a blunt unattended run you can use `--dangerously-skip-permissions` instead of
`--allowedTools`, but allow-listing the exact tools is safer.)

---

## 2. Cursor

### Native — Cursor Automations (cloud + GitHub only)
Cursor **Automations are cloud-only** and run on a **GitHub-hosted** repo in Cursor's
VM — that's why the automation window only lists GitHub repos; there is **no
local-folder option**. Consequences for this project:
- The repo must be on GitHub.
- Your `.env` is gitignored, so the cloud agent won't have `PORTAL_URL` / token — add
  them as the automation's **environment secrets** in Cursor instead.

Cloud agents do have internet, so with those secrets set a scheduled automation can run
`daily-generate.md` and push. `cursor-agent agent worker start` registers your machine
as a *worker* for on-demand runs at cursor.com/agents, but **scheduling stays in cloud
Automations**. To keep everything local (your `.env`, your files), use the cron path below.

### Cron — Cursor CLI headless (`cursor-agent -p`)
The Cursor CLI runs headless for cron/CI.

```cron
# daily at 08:00 — generate + push via Cursor CLI
0 8 * * * cd /Users/you/reputr/marketing && \
  cursor-agent -p "$(cat scripts/daily-generate.md)" \
    >> /tmp/reputr-cursor.log 2>&1
```

---

## 3. Codex

### Native — Codex Automations (app/cloud)
The Codex app has **Automations** — create a scheduled automation and give it the
`daily-generate.md` prompt against this repo.

### Cron — Codex CLI headless (`codex exec`)
`codex exec` runs one task non-interactively and exits. The run needs to execute the
push script (Node + **network**), so give it write/network access via `--sandbox`.

```cron
# daily at 08:00 — generate + push via Codex CLI
0 8 * * * cd /Users/you/reputr/marketing && \
  codex exec --sandbox danger-full-access "$(cat scripts/daily-generate.md)" \
    >> /tmp/reputr-codex.log 2>&1
```

(`--sandbox workspace-write` is tighter but may block outbound network; use the level
your version needs to reach the portal. `--full-auto` is a deprecated alias.)

---

## macOS alternative to cron: launchd

If you prefer launchd, create `~/Library/LaunchAgents/com.reputr.daily.plist` that runs
a small wrapper (e.g. `scripts/daily.sh` containing your chosen tool command), then
`launchctl load` it. cron is fine for most cases; launchd survives reboots more cleanly.

---

## Verifying a scheduled run

- Tail the log: `tail -f /tmp/reputr-<tool>.log`.
- Open the portal board — new **draft** cards should appear with the 🔗 sources.
- Re-running is safe: dedup ignores identical text, so a double-fire won't duplicate.

Sources: [Claude Code headless docs](https://code.claude.com/docs/en/headless) ·
[Codex non-interactive mode](https://developers.openai.com/codex/noninteractive) ·
[Codex Automations](https://developers.openai.com/codex/app/automations) ·
[Cursor headless CLI](https://cursor.com/docs/cli/headless)
