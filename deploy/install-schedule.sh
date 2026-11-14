#!/usr/bin/env bash
# Schedules the daily database backup of prod: 03:00 Moscow time, by a systemd timer of the user that runs
# this script (a "user" timer: no root needed, nothing outside of the home folder is touched).
# Run by deploy.sh after every good prod deploy, safe to run again: it rewrites its own two unit files
# (crm-backup.service and crm-backup.timer) and leaves every other unit of the server as it is.
#
# One thing needs root, once, by hand: a user timer runs without an ssh login only when "linger" is on:
#   sudo loginctl enable-linger crmapp
# Without it this script stops with that command in the message.
#
# Usage: install-schedule.sh
# Check: systemctl --user list-timers crm-backup.timer; the result of every night: journalctl --user -u crm-backup
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/common.sh
source ./common.sh
init_env prod

command -v systemctl >/dev/null || die "systemctl not found, the daily backup is not scheduled"

# Over a non-interactive ssh the user manager may not be found without this
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}

user=$(id -un)
if [[ "$(loginctl show-user "$user" --property=Linger --value 2>/dev/null || true)" != yes ]]; then
  die "linger is off for $user, so a user timer would not run at night. Once, as root: sudo loginctl enable-linger $user; then run: bash $PWD/install-schedule.sh"
fi

unit_dir=$HOME/.config/systemd/user
mkdir -p "$unit_dir"

cat >"$unit_dir/crm-backup.service" <<EOF
# Written by deploy/install-schedule.sh, do not edit
[Unit]
Description=Daily backup of the prod database

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $PWD/backup.sh daily
EOF

# Persistent: a night missed because the server was off is made up at the next start
cat >"$unit_dir/crm-backup.timer" <<EOF
# Written by deploy/install-schedule.sh, do not edit
[Unit]
Description=Daily backup of the prod database at 03:00 Moscow time

[Timer]
OnCalendar=*-*-* 03:00:00 Europe/Moscow
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable crm-backup.timer
# restart, so that a changed timer file takes effect on a timer that already runs
systemctl --user restart crm-backup.timer

log "Daily backup scheduled: 03:00 Moscow time, $PWD/backup.sh daily"
systemctl --user list-timers crm-backup.timer --no-pager || true
