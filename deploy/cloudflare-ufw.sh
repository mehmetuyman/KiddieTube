#!/usr/bin/env bash
# Print (never run) ufw rules that let only Cloudflare reach HTTPS on this
# server [review R3-4]. The ranges come from the nginx real-IP snippet, so the
# two stay in sync. Review the output, then run it yourself with sudo.
# Affects EVERY site on port 443 (all of tinyapps.dev), and LAN visitors who
# use the public name also arrive through Cloudflare, so nothing else breaks.
#   deploy/cloudflare-ufw.sh            # print the commands
set -euo pipefail
SNIPPET="$(dirname "$0")/nginx/kiddietube-cloudflare-realip.conf"
echo "# 1. allow Cloudflare to port 443"
grep -oE 'set_real_ip_from [^;]+' "$SNIPPET" | awk '{print "sudo ufw allow proto tcp from " $2 " to any port 443 comment cloudflare"}'
echo "# 2. then remove any general 443 allow rule, e.g.:"
echo "sudo ufw status numbered   # find 'ALLOW 443' / 'Nginx Full' entries"
echo "# sudo ufw delete <number>"
